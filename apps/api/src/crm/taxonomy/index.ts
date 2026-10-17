import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  crmSegmentSchema,
  crmSourceChannelSchema,
  crmSourceSchema,
} from "../../schemas";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import {
  createSegment,
  createSource,
  getSegments,
  getSources,
  updateSegment,
  updateSource,
} from "./controllers/taxonomy";

const listQuery = v.object({
  workspaceId: v.string(),
  includeInactive: v.optional(v.string()),
});

const name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));

/**
 * Origem e segmento são configuração do workspace, como as razões de perda —
 * por isso leem com `crmPipeline:read` (toda tela de cliente precisa da lista
 * para renderizar) e escrevem com `crmPipeline:manage`.
 */
const taxonomy = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/source",
    describeRoute({
      operationId: "listCrmSources",
      tags: ["CRM"],
      description: "List where clients and deals come from",
      responses: {
        200: {
          description: "Sources ordered by position",
          content: {
            "application/json": { schema: resolver(v.array(crmSourceSchema)) },
          },
        },
      },
    }),
    validator("query", listQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmPipeline: ["read"] }),
    async (c) => {
      const { includeInactive } = c.req.valid("query");
      return c.json(
        await getSources(c.get("workspaceId"), includeInactive === "true"),
      );
    },
  )
  .post(
    "/source",
    describeRoute({
      operationId: "createCrmSource",
      tags: ["CRM"],
      description: "Create a source",
      responses: {
        200: {
          description: "Source created",
          content: {
            "application/json": { schema: resolver(crmSourceSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name,
        channel: v.optional(crmSourceChannelSchema),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await createSource({
          workspaceId: c.get("workspaceId"),
          name: body.name,
          channel: body.channel ?? "other",
        }),
      );
    },
  )
  .patch(
    "/source/:sourceId",
    describeRoute({
      operationId: "updateCrmSource",
      tags: ["CRM"],
      description:
        "Rename, reorder, reclassify or deactivate a source. Deactivating keeps the history of every client already classified with it.",
      responses: {
        200: {
          description: "Source updated",
          content: {
            "application/json": { schema: resolver(crmSourceSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ sourceId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.optional(name),
        channel: v.optional(crmSourceChannelSchema),
        position: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
        isActive: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { sourceId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await updateSource({
          workspaceId: c.get("workspaceId"),
          sourceId,
          name: body.name,
          channel: body.channel,
          position: body.position,
          isActive: body.isActive,
        }),
      );
    },
  )
  .get(
    "/segment",
    describeRoute({
      operationId: "listCrmSegments",
      tags: ["CRM"],
      description: "List the sectors clients operate in",
      responses: {
        200: {
          description: "Segments ordered by position",
          content: {
            "application/json": { schema: resolver(v.array(crmSegmentSchema)) },
          },
        },
      },
    }),
    validator("query", listQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmPipeline: ["read"] }),
    async (c) => {
      const { includeInactive } = c.req.valid("query");
      return c.json(
        await getSegments(c.get("workspaceId"), includeInactive === "true"),
      );
    },
  )
  .post(
    "/segment",
    describeRoute({
      operationId: "createCrmSegment",
      tags: ["CRM"],
      description: "Create a segment",
      responses: {
        200: {
          description: "Segment created",
          content: {
            "application/json": { schema: resolver(crmSegmentSchema) },
          },
        },
      },
    }),
    validator("json", v.object({ workspaceId: v.string(), name })),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await createSegment({
          workspaceId: c.get("workspaceId"),
          name: body.name,
        }),
      );
    },
  )
  .patch(
    "/segment/:segmentId",
    describeRoute({
      operationId: "updateCrmSegment",
      tags: ["CRM"],
      description: "Rename, reorder or deactivate a segment",
      responses: {
        200: {
          description: "Segment updated",
          content: {
            "application/json": { schema: resolver(crmSegmentSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ segmentId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.optional(name),
        position: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
        isActive: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { segmentId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await updateSegment({
          workspaceId: c.get("workspaceId"),
          segmentId,
          name: body.name,
          position: body.position,
          isActive: body.isActive,
        }),
      );
    },
  );

export default taxonomy;
