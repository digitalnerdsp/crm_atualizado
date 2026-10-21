import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { recordAuditLog } from "../../admin/audit-log";
import { crmBillingTypeSchema, crmDealSchema } from "../../schemas";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { createContractFromDeal } from "../contract/controllers/contracts";
import { resolveVisibility } from "../shared/resolve-visibility";
import createDealCtrl from "./controllers/create-deal";
import createDeliveryTasksCtrl from "./controllers/create-delivery-tasks";
import { linkContact, unlinkContact } from "./controllers/deal-contacts";
import deleteDealCtrl from "./controllers/delete-deal";
import getDealCtrl from "./controllers/get-deal";
import getDealBoardCtrl from "./controllers/get-deal-board";
import getDealsCtrl, { type DealSortField } from "./controllers/get-deals";
import moveDealStageCtrl from "./controllers/move-deal-stage";
import reopenDealCtrl from "./controllers/reopen-deal";
import setDealServicesCtrl from "./controllers/set-deal-services";
import updateDealCtrl from "./controllers/update-deal";

const nullableString = v.optional(v.nullable(v.string()));
const isoDate = v.pipe(v.string(), v.isoTimestamp());

const dealFields = {
  companyId: nullableString,
  primaryContactId: nullableString,
  ownerUserId: nullableString,
  valueCents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  currency: v.optional(v.pipe(v.string(), v.length(3))),
  probability: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
  ),
  expectedCloseDate: v.optional(v.nullable(isoDate)),
  sourceId: nullableString,
};

function toDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

const deal = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/board",
    describeRoute({
      operationId: "getCrmDealBoard",
      tags: ["CRM"],
      description:
        "The pipeline board: stages with their deal count, total and weighted value, plus the first page of deals in each",
      responses: {
        200: {
          description: "Board payload",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        pipelineId: v.optional(v.string()),
        ownerUserId: v.optional(v.string()),
        search: v.optional(v.string()),
        stageLimit: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["read"] }),
    async (c) => {
      const { pipelineId, ownerUserId, search, stageLimit } =
        c.req.valid("query");
      return c.json(
        await getDealBoardCtrl({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          visibility: await resolveVisibility(c, "crmDeal"),
          pipelineId,
          ownerUserId,
          search,
          stageLimit: stageLimit ? Number(stageLimit) : undefined,
        }),
      );
    },
  )
  .get(
    "/",
    describeRoute({
      operationId: "listCrmDeals",
      tags: ["CRM"],
      description:
        "List deals with filters. Without crmDeal:read_all, only the caller's own are returned.",
      responses: {
        200: {
          description: "Paginated deals",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        pipelineId: v.optional(v.string()),
        stageId: v.optional(v.string()),
        status: v.optional(v.picklist(["open", "won", "lost"])),
        ownerUserId: v.optional(v.string()),
        companyId: v.optional(v.string()),
        search: v.optional(v.string()),
        closingFrom: v.optional(isoDate),
        closingTo: v.optional(isoDate),
        includeArchived: v.optional(v.string()),
        sortBy: v.optional(
          v.picklist([
            "createdAt",
            "updatedAt",
            "valueCents",
            "expectedCloseDate",
            "title",
          ]),
        ),
        sortDirection: v.optional(v.picklist(["asc", "desc"])),
        limit: v.optional(v.string()),
        offset: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["read"] }),
    async (c) => {
      const query = c.req.valid("query");
      return c.json(
        await getDealsCtrl({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          visibility: await resolveVisibility(c, "crmDeal"),
          pipelineId: query.pipelineId,
          stageId: query.stageId,
          status: query.status,
          ownerUserId: query.ownerUserId,
          companyId: query.companyId,
          search: query.search,
          closingFrom: query.closingFrom
            ? new Date(query.closingFrom)
            : undefined,
          closingTo: query.closingTo ? new Date(query.closingTo) : undefined,
          includeArchived: query.includeArchived === "true",
          sortBy: query.sortBy as DealSortField | undefined,
          sortDirection: query.sortDirection,
          limit: query.limit ? Number(query.limit) : undefined,
          offset: query.offset ? Number(query.offset) : undefined,
        }),
      );
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createCrmDeal",
      tags: ["CRM"],
      description:
        "Create a deal. Defaults to the workspace's default pipeline and its first open stage.",
      responses: {
        200: {
          description: "Deal created",
          content: { "application/json": { schema: resolver(crmDealSchema) } },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
        pipelineId: v.optional(v.string()),
        stageId: v.optional(v.string()),
        ...dealFields,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["create"] }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await createDealCtrl({
          workspaceId: c.get("workspaceId"),
          createdByUserId: c.get("userId"),
          title: body.title,
          pipelineId: body.pipelineId,
          stageId: body.stageId,
          companyId: body.companyId,
          primaryContactId: body.primaryContactId,
          ownerUserId: body.ownerUserId,
          valueCents: body.valueCents,
          currency: body.currency,
          probability: body.probability,
          expectedCloseDate: toDate(body.expectedCloseDate),
          sourceId: body.sourceId,
        }),
      );
    },
  )
  .get(
    "/:dealId",
    describeRoute({
      operationId: "getCrmDeal",
      tags: ["CRM"],
      description:
        "A deal with its stage, company, contacts, stage history and linked delivery projects",
      responses: {
        200: {
          description: "Deal detail",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["read"] }),
    async (c) => {
      const { dealId } = c.req.valid("param");
      const result = await getDealCtrl({
        workspaceId: c.get("workspaceId"),
        dealId,
      });
      const canProduction = await hasWorkspacePermission(c, { task: ["read"] });
      return c.json(
        canProduction
          ? result
          : { ...result, deliveryTasks: [], completedTaskCount: 0 },
      );
    },
  )
  .patch(
    "/:dealId",
    describeRoute({
      operationId: "updateCrmDeal",
      tags: ["CRM"],
      description:
        "Update a deal's own fields. Stage and status move through the stage endpoints.",
      responses: {
        200: {
          description: "Deal updated",
          content: { "application/json": { schema: resolver(crmDealSchema) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        title: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
        ),
        archived: v.optional(v.boolean()),
        // Travar o valor só existe na edição: na criação o negócio ainda não
        // tem item nenhum para mandar no total.
        valueIsManual: v.optional(v.boolean()),
        ...dealFields,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { dealId } = c.req.valid("param");
      const {
        workspaceId: _ignored,
        expectedCloseDate,
        ownerUserId,
        ...rest
      } = c.req.valid("json");

      // Handing a deal to someone else is a separate permission from editing
      // its fields.
      if (
        ownerUserId !== undefined &&
        !(await hasWorkspacePermission(c, { crmDeal: ["assign"] }))
      ) {
        throw new HTTPException(403, {
          message: "You cannot reassign deals",
        });
      }

      return c.json(
        await updateDealCtrl({
          workspaceId: c.get("workspaceId"),
          dealId,
          actorUserId: c.get("userId"),
          input: {
            ...rest,
            ...(ownerUserId === undefined ? {} : { ownerUserId }),
            expectedCloseDate: toDate(expectedCloseDate),
          },
        }),
      );
    },
  )
  .patch(
    "/:dealId/stage",
    describeRoute({
      operationId: "moveCrmDealStage",
      tags: ["CRM"],
      description:
        "Move a deal to a stage, or reorder it inside the current one. Moving into the lost stage requires a reason.",
      responses: {
        200: {
          description: "Deal moved",
          content: { "application/json": { schema: resolver(crmDealSchema) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        stageId: v.string(),
        position: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
        lostReasonId: nullableString,
        lostReasonNote: nullableString,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["change_stage"] }),
    async (c) => {
      const { dealId } = c.req.valid("param");
      const { stageId, position, lostReasonId, lostReasonNote } =
        c.req.valid("json");
      return c.json(
        await moveDealStageCtrl({
          workspaceId: c.get("workspaceId"),
          dealId,
          stageId,
          position,
          changedByUserId: c.get("userId"),
          lostReasonId,
          lostReasonNote,
        }),
      );
    },
  )
  .post(
    "/:dealId/reopen",
    describeRoute({
      operationId: "reopenCrmDeal",
      tags: ["CRM"],
      description: "Move a won or lost deal back into an open stage",
      responses: {
        200: {
          description: "Deal reopened",
          content: { "application/json": { schema: resolver(crmDealSchema) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        stageId: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["change_stage"] }),
    async (c) => {
      const { dealId } = c.req.valid("param");
      const { stageId } = c.req.valid("json");
      return c.json(
        await reopenDealCtrl({
          workspaceId: c.get("workspaceId"),
          dealId,
          stageId,
          changedByUserId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:dealId/delivery-tasks",
    describeRoute({
      operationId: "createCrmDeliveryTasks",
      tags: ["CRM"],
      description:
        "Create delivery tasks for a won deal, each in the discipline project chosen for it. Every task is linked to the deal's client.",
      responses: {
        200: {
          description: "Tasks created",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        items: v.pipe(
          v.array(
            v.object({
              projectId: v.string(),
              title: v.pipe(
                v.string(),
                v.trim(),
                v.minLength(1),
                v.maxLength(255),
              ),
              status: v.optional(v.string()),
              priority: v.optional(v.string()),
              assigneeId: nullableString,
              dueDate: v.optional(v.nullable(isoDate)),
            }),
          ),
          v.minLength(1),
          v.maxLength(50),
        ),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ task: ["create"] }),
    async (c) => {
      const { dealId } = c.req.valid("param");
      const { items } = c.req.valid("json");

      return c.json(
        await createDeliveryTasksCtrl({
          workspaceId: c.get("workspaceId"),
          dealId,
          currentUserId: c.get("userId"),
          items: items.map((item) => ({
            ...item,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
          })),
        }),
      );
    },
  )
  .post(
    "/:dealId/contact",
    describeRoute({
      operationId: "linkCrmDealContact",
      tags: ["CRM"],
      description:
        "Link a contact to a deal with their role, or update the role if already linked",
      responses: {
        200: {
          description: "Contact linked",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        contactId: v.string(),
        role: nullableString,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { dealId } = c.req.valid("param");
      const { contactId, role } = c.req.valid("json");
      return c.json(
        await linkContact({
          workspaceId: c.get("workspaceId"),
          dealId,
          contactId,
          role,
        }),
      );
    },
  )
  .delete(
    "/:dealId/contact/:contactId",
    describeRoute({
      operationId: "unlinkCrmDealContact",
      tags: ["CRM"],
      description: "Remove a contact from a deal",
      responses: {
        200: {
          description: "Contact unlinked",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string(), contactId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { dealId, contactId } = c.req.valid("param");
      return c.json(
        await unlinkContact({
          workspaceId: c.get("workspaceId"),
          dealId,
          contactId,
        }),
      );
    },
  )
  .put(
    "/:dealId/service",
    describeRoute({
      operationId: "setCrmDealServices",
      tags: ["CRM"],
      description:
        "Replace the deal's line items in one transaction. Unless the value is locked, the deal value becomes their sum.",
      responses: {
        200: {
          description: "Saved line items and the resulting deal value",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        items: v.pipe(
          v.array(
            v.object({
              serviceId: nullableString,
              name: v.optional(
                v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
              ),
              billingType: v.optional(crmBillingTypeSchema),
              quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
              unitPriceCents: v.optional(
                v.pipe(v.number(), v.integer(), v.minValue(0)),
              ),
              discountPercent: v.optional(
                v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
              ),
            }),
          ),
          v.maxLength(100),
        ),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { dealId } = c.req.valid("param");
      const { items } = c.req.valid("json");
      return c.json(
        await setDealServicesCtrl({
          workspaceId: c.get("workspaceId"),
          dealId,
          lines: items,
        }),
      );
    },
  )
  .post(
    "/:dealId/contract",
    describeRoute({
      operationId: "createCrmContractFromDeal",
      tags: ["CRM"],
      description:
        "Turn a won deal's recurring line items into a contract, starting on the win date.",
      responses: {
        200: {
          description: "Contract created",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        title: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
        ),
        startsAt: v.optional(isoDate),
        endsAt: v.optional(v.nullable(isoDate)),
        billingDay: v.optional(
          v.nullable(
            v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31)),
          ),
        ),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["create"] }),
    async (c) => {
      const { dealId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await createContractFromDeal({
          workspaceId: c.get("workspaceId"),
          actorUserId: c.get("userId"),
          dealId,
          overrides: {
            title: body.title,
            startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
            endsAt: toDate(body.endsAt),
            billingDay: body.billingDay,
          },
        }),
      );
    },
  )
  .delete(
    "/:dealId",
    describeRoute({
      operationId: "deleteCrmDeal",
      tags: ["CRM"],
      description:
        "Permanently delete a deal and its history. Linked projects survive.",
      responses: {
        200: {
          description: "Deal deleted",
          content: { "application/json": { schema: resolver(crmDealSchema) } },
        },
      },
    }),
    validator("param", v.object({ dealId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["delete"] }),
    async (c) => {
      const { dealId } = c.req.valid("param");
      const deleted = await deleteDealCtrl({
        workspaceId: c.get("workspaceId"),
        dealId,
      });

      await recordAuditLog(c, {
        action: "crm.deal.deleted",
        entityType: "crm_deal",
        entityId: deleted.id,
        entityName: deleted.title,
        workspaceId: c.get("workspaceId"),
        summary: `Excluiu o negocio #${deleted.number} do CRM.`,
        before: deleted,
      });

      return c.json(deleted);
    },
  );

export default deal;
