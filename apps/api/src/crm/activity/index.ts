import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { crmActivitySchema, crmActivityTypeSchema } from "../../schemas";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { resolveVisibility } from "../shared/resolve-visibility";
import getActivitiesCtrl from "./controllers/get-activities";
import {
  completeActivity,
  createActivity,
  deleteActivity,
  updateActivity,
} from "./controllers/upsert-activity";

const nullableString = v.optional(v.nullable(v.string()));
const isoDate = v.pipe(v.string(), v.isoTimestamp());

function toDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

const activityFields = {
  body: nullableString,
  dealId: nullableString,
  contactId: nullableString,
  companyId: nullableString,
  ownerUserId: nullableString,
  dueAt: v.optional(v.nullable(isoDate)),
  completedAt: v.optional(v.nullable(isoDate)),
  durationMinutes: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  ),
  outcome: nullableString,
};

const activity = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listCrmActivities",
      tags: ["CRM"],
      description:
        "The commercial timeline. Filter by deal, contact or company; or by owner and pendingOnly for the rep's own agenda.",
      responses: {
        200: {
          description: "Paginated activities",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        dealId: v.optional(v.string()),
        contactId: v.optional(v.string()),
        companyId: v.optional(v.string()),
        ownerUserId: v.optional(v.string()),
        pendingOnly: v.optional(v.string()),
        dueBefore: v.optional(isoDate),
        dueAfter: v.optional(isoDate),
        limit: v.optional(v.string()),
        offset: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["read"] }),
    async (c) => {
      const query = c.req.valid("query");
      return c.json(
        await getActivitiesCtrl({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          visibility: await resolveVisibility(c, "crmDeal"),
          dealId: query.dealId,
          contactId: query.contactId,
          companyId: query.companyId,
          ownerUserId: query.ownerUserId,
          pendingOnly: query.pendingOnly === "true",
          dueBefore: query.dueBefore ? new Date(query.dueBefore) : undefined,
          dueAfter: query.dueAfter ? new Date(query.dueAfter) : undefined,
          limit: query.limit ? Number(query.limit) : undefined,
          offset: query.offset ? Number(query.offset) : undefined,
        }),
      );
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createCrmActivity",
      tags: ["CRM"],
      description: "Log a call, meeting, email, note or task",
      responses: {
        200: {
          description: "Activity created",
          content: {
            "application/json": { schema: resolver(crmActivitySchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        type: crmActivityTypeSchema,
        subject: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
        ...activityFields,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const {
        workspaceId: _ignored,
        dueAt,
        completedAt,
        ...rest
      } = c.req.valid("json");
      return c.json(
        await createActivity({
          workspaceId: c.get("workspaceId"),
          createdByUserId: c.get("userId"),
          input: {
            ...rest,
            dueAt: toDate(dueAt),
            completedAt: toDate(completedAt),
          },
        }),
      );
    },
  )
  .patch(
    "/:activityId",
    describeRoute({
      operationId: "updateCrmActivity",
      tags: ["CRM"],
      description: "Update an activity",
      responses: {
        200: {
          description: "Activity updated",
          content: {
            "application/json": { schema: resolver(crmActivitySchema) },
          },
        },
      },
    }),
    validator("param", v.object({ activityId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        type: v.optional(crmActivityTypeSchema),
        subject: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
        ),
        ...activityFields,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { activityId } = c.req.valid("param");
      const {
        workspaceId: _ignored,
        dueAt,
        completedAt,
        ...rest
      } = c.req.valid("json");
      return c.json(
        await updateActivity({
          workspaceId: c.get("workspaceId"),
          activityId,
          input: {
            ...rest,
            dueAt: toDate(dueAt),
            completedAt: toDate(completedAt),
          },
        }),
      );
    },
  )
  .post(
    "/:activityId/complete",
    describeRoute({
      operationId: "completeCrmActivity",
      tags: ["CRM"],
      description: "Mark an activity done, optionally with its outcome",
      responses: {
        200: {
          description: "Activity completed",
          content: {
            "application/json": { schema: resolver(crmActivitySchema) },
          },
        },
      },
    }),
    validator("param", v.object({ activityId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        outcome: nullableString,
        durationMinutes: v.optional(
          v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
        ),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { activityId } = c.req.valid("param");
      const { outcome, durationMinutes } = c.req.valid("json");
      return c.json(
        await completeActivity({
          workspaceId: c.get("workspaceId"),
          activityId,
          outcome,
          durationMinutes,
        }),
      );
    },
  )
  .delete(
    "/:activityId",
    describeRoute({
      operationId: "deleteCrmActivity",
      tags: ["CRM"],
      description: "Delete an activity",
      responses: {
        200: {
          description: "Activity deleted",
          content: {
            "application/json": { schema: resolver(crmActivitySchema) },
          },
        },
      },
    }),
    validator("param", v.object({ activityId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { activityId } = c.req.valid("param");
      return c.json(
        await deleteActivity({
          workspaceId: c.get("workspaceId"),
          activityId,
        }),
      );
    },
  );

export default activity;
