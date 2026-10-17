import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { activitySchema, projectSchema, taskSchema } from "../schemas";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import globalSearch from "./controllers/global-search";

const workspaceSchema = v.object({
  id: v.string(),
  name: v.string(),
  slug: v.string(),
  logo: v.nullable(v.string()),
  metadata: v.nullable(v.string()),
  description: v.nullable(v.string()),
  createdAt: v.date(),
});

const searchResultSchema = v.object({
  tasks: v.optional(v.array(taskSchema)),
  projects: v.optional(v.array(projectSchema)),
  workspaces: v.optional(v.array(workspaceSchema)),
  comments: v.optional(v.array(activitySchema)),
  activities: v.optional(v.array(activitySchema)),
});

const search = new Hono<{
  Variables: {
    userId: string;
  };
}>().get(
  "/",
  describeRoute({
    operationId: "globalSearch",
    tags: ["Search"],
    description:
      "Search across tasks, projects, workspaces, comments, and activities",
    responses: {
      200: {
        description: "Search results",
        content: {
          "application/json": { schema: resolver(searchResultSchema) },
        },
      },
    },
  }),
  validator(
    "query",
    v.object({
      q: v.pipe(
        v.string(),
        v.minLength(1, "Query must be at least 1 character"),
      ),
      type: v.optional(
        v.picklist([
          "all",
          "tasks",
          "projects",
          "workspaces",
          "comments",
          "activities",
          "deals",
          "contacts",
          "companies",
        ]),
        "all",
      ),
      workspaceId: v.optional(v.string()),
      projectId: v.optional(v.string()),
      limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
      userEmail: v.optional(v.pipe(v.string(), v.email())),
    }),
  ),
  workspaceAccess.fromQuery(),
  async (c, next) => {
    const type = c.req.valid("query").type;
    const permissions: Record<string, string[]> =
      type === "projects"
        ? { project: ["read"] }
        : type === "workspaces"
          ? { workspace: ["read"] }
          : type === "deals"
            ? { crmDeal: ["read"] }
            : type === "contacts"
              ? { crmContact: ["read"] }
              : type === "companies"
                ? { crmCompany: ["read"] }
                : type === "all"
                  ? {
                      workspace: ["read"],
                      project: ["read"],
                      task: ["read"],
                    }
                  : { task: ["read"] };

    return requireWorkspacePermission(permissions)(c, next);
  },
  async (c) => {
    const { q, type, workspaceId, projectId, limit, userEmail } =
      c.req.valid("query");
    const userId = c.get("userId");

    // A search with type "all" must not hand CRM records to someone who has no
    // CRM access, and must not show a seller the rest of the team's pipeline.
    // The permission gate above only covers the explicitly requested type.
    const [canReadDeals, canReadContacts, canReadCompanies] = await Promise.all(
      [
        hasWorkspacePermission(c, { crmDeal: ["read"] }),
        hasWorkspacePermission(c, { crmContact: ["read"] }),
        hasWorkspacePermission(c, { crmCompany: ["read"] }),
      ],
    );
    const [readAllDeals, readAllContacts, readAllCompanies] = await Promise.all(
      [
        hasWorkspacePermission(c, { crmDeal: ["read_all"] }),
        hasWorkspacePermission(c, { crmContact: ["read_all"] }),
        hasWorkspacePermission(c, { crmCompany: ["read_all"] }),
      ],
    );

    const results = await globalSearch({
      query: q,
      userId,
      userEmail,
      type,
      workspaceId,
      projectId,
      limit: Math.min(50, Math.max(1, Number(limit ?? 20))),
      crmAccess: {
        deals: canReadDeals,
        contacts: canReadContacts,
        companies: canReadCompanies,
        allDeals: readAllDeals,
        allContacts: readAllContacts,
        allCompanies: readAllCompanies,
      },
    });

    return c.json(results);
  },
);

export default search;
