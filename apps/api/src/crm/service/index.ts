import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  crmBillingTypeSchema,
  crmServiceCategorySchema,
  crmServiceSchema,
} from "../../schemas";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import {
  createService,
  createServiceCategory,
  getServiceCategories,
  getServices,
  updateService,
  updateServiceCategory,
} from "./controllers/catalog";

const nullableString = v.optional(v.nullable(v.string()));
const name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(160));
const position = v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)));

const serviceFields = {
  categoryId: nullableString,
  code: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(32)))),
  description: nullableString,
  defaultPriceCents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  billingType: v.optional(crmBillingTypeSchema),
  position,
};

/**
 * O catálogo é configuração, como os campos customizados: escreve com
 * `crmField:manage`. Ler precisa só de `crmPipeline:read`, porque todo
 * vendedor que monta um negócio escolhe item dele.
 *
 * As rotas de categoria vêm antes de `/:serviceId` para não serem engolidas
 * pelo parâmetro.
 */
const service = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/category",
    describeRoute({
      operationId: "listCrmServiceCategories",
      tags: ["CRM"],
      description: "List service categories",
      responses: {
        200: {
          description: "Categories ordered by position",
          content: {
            "application/json": {
              schema: resolver(v.array(crmServiceCategorySchema)),
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
        await getServiceCategories(
          c.get("workspaceId"),
          includeInactive === "true",
        ),
      );
    },
  )
  .post(
    "/category",
    describeRoute({
      operationId: "createCrmServiceCategory",
      tags: ["CRM"],
      description: "Create a service category",
      responses: {
        200: {
          description: "Category created",
          content: {
            "application/json": { schema: resolver(crmServiceCategorySchema) },
          },
        },
      },
    }),
    validator("json", v.object({ workspaceId: v.string(), name })),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmField: ["manage"] }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await createServiceCategory({
          workspaceId: c.get("workspaceId"),
          name: body.name,
        }),
      );
    },
  )
  .patch(
    "/category/:categoryId",
    describeRoute({
      operationId: "updateCrmServiceCategory",
      tags: ["CRM"],
      description: "Rename, reorder or deactivate a service category",
      responses: {
        200: {
          description: "Category updated",
          content: {
            "application/json": { schema: resolver(crmServiceCategorySchema) },
          },
        },
      },
    }),
    validator("param", v.object({ categoryId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.optional(name),
        position,
        isActive: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmField: ["manage"] }),
    async (c) => {
      const { categoryId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await updateServiceCategory({
          workspaceId: c.get("workspaceId"),
          categoryId,
          name: body.name,
          position: body.position,
          isActive: body.isActive,
        }),
      );
    },
  )
  .get(
    "/",
    describeRoute({
      operationId: "listCrmServices",
      tags: ["CRM"],
      description:
        "List the service catalog. Archived services are hidden unless asked for.",
      responses: {
        200: {
          description: "Services grouped by category order",
          content: { "application/json": { schema: resolver(v.any()) } },
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
        await getServices({
          workspaceId: c.get("workspaceId"),
          includeArchived: includeArchived === "true",
        }),
      );
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createCrmService",
      tags: ["CRM"],
      description: "Add a service to the catalog",
      responses: {
        200: {
          description: "Service created",
          content: {
            "application/json": { schema: resolver(crmServiceSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({ workspaceId: v.string(), name, ...serviceFields }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmField: ["manage"] }),
    async (c) => {
      const { workspaceId: _ignored, ...input } = c.req.valid("json");
      return c.json(
        await createService({ workspaceId: c.get("workspaceId"), input }),
      );
    },
  )
  .patch(
    "/:serviceId",
    describeRoute({
      operationId: "updateCrmService",
      tags: ["CRM"],
      description:
        "Edit or archive a service. Deals already sold keep their own copy of name and price.",
      responses: {
        200: {
          description: "Service updated",
          content: {
            "application/json": { schema: resolver(crmServiceSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ serviceId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.optional(name),
        archived: v.optional(v.boolean()),
        ...serviceFields,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmField: ["manage"] }),
    async (c) => {
      const { serviceId } = c.req.valid("param");
      const { workspaceId: _ignored, ...input } = c.req.valid("json");
      return c.json(
        await updateService({
          workspaceId: c.get("workspaceId"),
          serviceId,
          input,
        }),
      );
    },
  );

export default service;
