import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getWorkspaceMembersCtrl from "./controllers/get-workspace-members";

const workspace = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>().get(
  "/:workspaceId/members",
  describeRoute({
    operationId: "getWorkspaceMembers",
    tags: ["Workspaces"],
    description: "Get all members of a workspace",
    responses: {
      200: {
        description: "List of workspace members",
        content: {
          "application/json": {
            schema: resolver(
              v.array(
                v.object({
                  id: v.string(),
                  name: v.string(),
                  email: v.string(),
                  image: v.nullable(v.string()),
                  role: v.string(),
                  lastAccessAt: v.nullable(v.string()),
                }),
              ),
            ),
          },
        },
      },
    },
  }),
  validator("param", v.object({ workspaceId: v.string() })),
  workspaceAccess.fromParam("workspaceId"),
  requireWorkspacePermission({ workspace: ["read"] }),
  async (c) => {
    const workspaceId = c.get("workspaceId");
    const members = await getWorkspaceMembersCtrl(workspaceId);
    return c.json(members);
  },
);

export default workspace;
