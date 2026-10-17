import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  crmLostReasonSchema,
  crmPipelineSchema,
  crmStageSchema,
} from "../../schemas";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import createPipelineCtrl from "./controllers/create-pipeline";
import createStageCtrl from "./controllers/create-stage";
import deletePipelineCtrl from "./controllers/delete-pipeline";
import deleteStageCtrl from "./controllers/delete-stage";
import getPipelinesCtrl from "./controllers/get-pipelines";
import {
  createLostReason,
  deactivateLostReason,
  getLostReasons,
  updateLostReason,
} from "./controllers/lost-reasons";
import reorderStagesCtrl from "./controllers/reorder-stages";
import updatePipelineCtrl from "./controllers/update-pipeline";
import updateStageCtrl from "./controllers/update-stage";

const colorSchema = v.pipe(
  v.string(),
  v.regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color"),
);

const probabilitySchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(100),
);

const pipelineWithStagesSchema = v.object({
  ...crmPipelineSchema.entries,
  stages: v.array(crmStageSchema),
});

const pipeline = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listCrmPipelines",
      tags: ["CRM"],
      description: "List the sales pipelines of a workspace, with their stages",
      responses: {
        200: {
          description: "Pipelines with their ordered stages",
          content: {
            "application/json": {
              schema: resolver(v.array(pipelineWithStagesSchema)),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        includeArchived: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmPipeline: ["read"] }),
    async (c) => {
      const { includeArchived } = c.req.valid("query");
      return c.json(
        await getPipelinesCtrl(
          c.get("workspaceId"),
          includeArchived === "true",
        ),
      );
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createCrmPipeline",
      tags: ["CRM"],
      description:
        "Create a sales pipeline, seeded with default stages including won and lost",
      responses: {
        200: {
          description: "Pipeline created",
          content: {
            "application/json": { schema: resolver(crmPipelineSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
        description: v.optional(v.string()),
        isDefault: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { name, description, isDefault } = c.req.valid("json");
      return c.json(
        await createPipelineCtrl({
          workspaceId: c.get("workspaceId"),
          name,
          description,
          isDefault,
        }),
      );
    },
  )
  .patch(
    "/:pipelineId",
    describeRoute({
      operationId: "updateCrmPipeline",
      tags: ["CRM"],
      description: "Rename, archive or promote a pipeline to workspace default",
      responses: {
        200: {
          description: "Pipeline updated",
          content: {
            "application/json": { schema: resolver(crmPipelineSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ pipelineId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
        ),
        description: v.optional(v.nullable(v.string())),
        isDefault: v.optional(v.boolean()),
        archived: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { pipelineId } = c.req.valid("param");
      const { name, description, isDefault, archived } = c.req.valid("json");
      return c.json(
        await updatePipelineCtrl({
          workspaceId: c.get("workspaceId"),
          pipelineId,
          name,
          description,
          isDefault,
          archived,
        }),
      );
    },
  )
  .delete(
    "/:pipelineId",
    describeRoute({
      operationId: "deleteCrmPipeline",
      tags: ["CRM"],
      description: "Delete an empty, non-default pipeline",
      responses: {
        200: {
          description: "Pipeline deleted",
          content: {
            "application/json": { schema: resolver(crmPipelineSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ pipelineId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { pipelineId } = c.req.valid("param");
      return c.json(
        await deletePipelineCtrl({
          workspaceId: c.get("workspaceId"),
          pipelineId,
        }),
      );
    },
  )
  .post(
    "/:pipelineId/stage",
    describeRoute({
      operationId: "createCrmStage",
      tags: ["CRM"],
      description: "Add an open stage to a pipeline, before its closing stages",
      responses: {
        200: {
          description: "Stage created",
          content: {
            "application/json": { schema: resolver(crmStageSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ pipelineId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
        probability: v.optional(probabilitySchema),
        color: v.optional(colorSchema),
        rottingDays: v.optional(
          v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
        ),
        position: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { pipelineId } = c.req.valid("param");
      const { name, probability, color, rottingDays, position } =
        c.req.valid("json");
      return c.json(
        await createStageCtrl({
          workspaceId: c.get("workspaceId"),
          pipelineId,
          name,
          probability,
          color,
          rottingDays,
          position,
        }),
      );
    },
  )
  .patch(
    "/stage/:stageId",
    describeRoute({
      operationId: "updateCrmStage",
      tags: ["CRM"],
      description: "Update a stage's name, probability, color or rotting limit",
      responses: {
        200: {
          description: "Stage updated",
          content: {
            "application/json": { schema: resolver(crmStageSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ stageId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
        ),
        probability: v.optional(probabilitySchema),
        color: v.optional(v.nullable(colorSchema)),
        rottingDays: v.optional(
          v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
        ),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { stageId } = c.req.valid("param");
      const { name, probability, color, rottingDays } = c.req.valid("json");
      return c.json(
        await updateStageCtrl({
          workspaceId: c.get("workspaceId"),
          stageId,
          name,
          probability,
          color,
          rottingDays,
        }),
      );
    },
  )
  .delete(
    "/stage/:stageId",
    describeRoute({
      operationId: "deleteCrmStage",
      tags: ["CRM"],
      description: "Delete an empty open stage",
      responses: {
        200: {
          description: "Stage deleted",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ stageId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { stageId } = c.req.valid("param");
      return c.json(
        await deleteStageCtrl({ workspaceId: c.get("workspaceId"), stageId }),
      );
    },
  )
  .put(
    "/:pipelineId/stage/reorder",
    describeRoute({
      operationId: "reorderCrmStages",
      tags: ["CRM"],
      description: "Reorder the stages of a pipeline",
      responses: {
        200: {
          description: "Stages in their new order",
          content: {
            "application/json": { schema: resolver(v.array(crmStageSchema)) },
          },
        },
      },
    }),
    validator("param", v.object({ pipelineId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        stages: v.array(
          v.object({
            id: v.string(),
            position: v.pipe(v.number(), v.integer(), v.minValue(0)),
          }),
        ),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { pipelineId } = c.req.valid("param");
      const { stages } = c.req.valid("json");
      return c.json(
        await reorderStagesCtrl({
          workspaceId: c.get("workspaceId"),
          pipelineId,
          order: stages,
        }),
      );
    },
  )
  .get(
    "/lost-reason",
    describeRoute({
      operationId: "listCrmLostReasons",
      tags: ["CRM"],
      description: "List the reasons a deal can be marked lost for",
      responses: {
        200: {
          description: "Lost reasons ordered by position",
          content: {
            "application/json": {
              schema: resolver(v.array(crmLostReasonSchema)),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        includeInactive: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmPipeline: ["read"] }),
    async (c) => {
      const { includeInactive } = c.req.valid("query");
      return c.json(
        await getLostReasons(c.get("workspaceId"), includeInactive === "true"),
      );
    },
  )
  .post(
    "/lost-reason",
    describeRoute({
      operationId: "createCrmLostReason",
      tags: ["CRM"],
      description: "Create a lost reason",
      responses: {
        200: {
          description: "Lost reason created",
          content: {
            "application/json": { schema: resolver(crmLostReasonSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { name } = c.req.valid("json");
      return c.json(
        await createLostReason({ workspaceId: c.get("workspaceId"), name }),
      );
    },
  )
  .patch(
    "/lost-reason/:lostReasonId",
    describeRoute({
      operationId: "updateCrmLostReason",
      tags: ["CRM"],
      description: "Rename, reorder or deactivate a lost reason",
      responses: {
        200: {
          description: "Lost reason updated",
          content: {
            "application/json": { schema: resolver(crmLostReasonSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ lostReasonId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
        ),
        position: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
        isActive: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { lostReasonId } = c.req.valid("param");
      const { name, position, isActive } = c.req.valid("json");
      return c.json(
        await updateLostReason({
          workspaceId: c.get("workspaceId"),
          lostReasonId,
          name,
          position,
          isActive,
        }),
      );
    },
  )
  .delete(
    "/lost-reason/:lostReasonId",
    describeRoute({
      operationId: "deactivateCrmLostReason",
      tags: ["CRM"],
      description:
        "Deactivate a lost reason. It is kept so the deals lost for it stay reportable.",
      responses: {
        200: {
          description: "Lost reason deactivated",
          content: {
            "application/json": { schema: resolver(crmLostReasonSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ lostReasonId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmPipeline: ["manage"] }),
    async (c) => {
      const { lostReasonId } = c.req.valid("param");
      return c.json(
        await deactivateLostReason({
          workspaceId: c.get("workspaceId"),
          lostReasonId,
        }),
      );
    },
  );

export default pipeline;
