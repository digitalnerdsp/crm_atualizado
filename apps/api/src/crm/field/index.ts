import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  crmFieldDefinitionSchema,
  crmFieldEntitySchema,
  crmFieldTypeSchema,
} from "../../schemas";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import {
  createFieldDefinition,
  deleteFieldDefinition,
  getFieldDefinitions,
  getFieldValues,
  setFieldValues,
  updateFieldDefinition,
} from "./controllers/field-definitions";

const field = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listCrmFields",
      tags: ["CRM"],
      description:
        "List the workspace's custom field definitions for deals, contacts and companies",
      responses: {
        200: {
          description: "Field definitions",
          content: {
            "application/json": {
              schema: resolver(v.array(crmFieldDefinitionSchema)),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        entity: v.optional(crmFieldEntitySchema),
      }),
    ),
    workspaceAccess.fromQuery(),
    // Reading the definitions is needed to render any CRM form, so it rides on
    // pipeline read rather than the manage-only field permission.
    requireWorkspacePermission({ crmPipeline: ["read"] }),
    async (c) => {
      const { entity } = c.req.valid("query");
      return c.json(
        await getFieldDefinitions({
          workspaceId: c.get("workspaceId"),
          entity,
        }),
      );
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createCrmField",
      tags: ["CRM"],
      description: "Define a custom field on deals, contacts or companies",
      responses: {
        200: {
          description: "Field created",
          content: {
            "application/json": { schema: resolver(crmFieldDefinitionSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        entity: crmFieldEntitySchema,
        label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
        type: crmFieldTypeSchema,
        options: v.optional(v.nullable(v.array(v.string()))),
        isRequired: v.optional(v.boolean()),
        showOnCard: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmField: ["manage"] }),
    async (c) => {
      const { entity, label, type, options, isRequired, showOnCard } =
        c.req.valid("json");
      return c.json(
        await createFieldDefinition({
          workspaceId: c.get("workspaceId"),
          entity,
          label,
          type,
          options,
          isRequired,
          showOnCard,
        }),
      );
    },
  )
  .patch(
    "/:definitionId",
    describeRoute({
      operationId: "updateCrmField",
      tags: ["CRM"],
      description:
        "Update a field's label, options, requirement, card visibility or position. Its type and key are immutable.",
      responses: {
        200: {
          description: "Field updated",
          content: {
            "application/json": { schema: resolver(crmFieldDefinitionSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ definitionId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        label: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
        ),
        options: v.optional(v.nullable(v.array(v.string()))),
        isRequired: v.optional(v.boolean()),
        showOnCard: v.optional(v.boolean()),
        position: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmField: ["manage"] }),
    async (c) => {
      const { definitionId } = c.req.valid("param");
      const { label, options, isRequired, showOnCard, position } =
        c.req.valid("json");
      return c.json(
        await updateFieldDefinition({
          workspaceId: c.get("workspaceId"),
          definitionId,
          label,
          options,
          isRequired,
          showOnCard,
          position,
        }),
      );
    },
  )
  .delete(
    "/:definitionId",
    describeRoute({
      operationId: "deleteCrmField",
      tags: ["CRM"],
      description:
        "Delete a field definition and every value stored against it",
      responses: {
        200: {
          description: "Field deleted",
          content: {
            "application/json": { schema: resolver(crmFieldDefinitionSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ definitionId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmField: ["manage"] }),
    async (c) => {
      const { definitionId } = c.req.valid("param");
      return c.json(
        await deleteFieldDefinition({
          workspaceId: c.get("workspaceId"),
          definitionId,
        }),
      );
    },
  )
  .get(
    "/value/:entity/:entityId",
    describeRoute({
      operationId: "getCrmFieldValues",
      tags: ["CRM"],
      description:
        "Every field defined for the entity, each with the value stored for this record",
      responses: {
        200: {
          description: "Field definitions with their values",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "param",
      v.object({ entity: crmFieldEntitySchema, entityId: v.string() }),
    ),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmPipeline: ["read"] }),
    async (c) => {
      const { entity, entityId } = c.req.valid("param");
      return c.json(
        await getFieldValues({
          workspaceId: c.get("workspaceId"),
          entity,
          entityId,
        }),
      );
    },
  )
  .put(
    "/value/:entity/:entityId",
    describeRoute({
      operationId: "setCrmFieldValues",
      tags: ["CRM"],
      description: "Set custom field values on a deal, contact or company",
      responses: {
        200: {
          description: "Field definitions with their new values",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "param",
      v.object({ entity: crmFieldEntitySchema, entityId: v.string() }),
    ),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        values: v.array(v.object({ key: v.string(), value: v.string() })),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { entity, entityId } = c.req.valid("param");
      const { values } = c.req.valid("json");
      return c.json(
        await setFieldValues({
          workspaceId: c.get("workspaceId"),
          entity,
          entityId,
          values,
        }),
      );
    },
  );

export default field;
