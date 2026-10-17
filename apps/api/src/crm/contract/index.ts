import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  crmBillingTypeSchema,
  crmContractSchema,
  crmContractStatusSchema,
} from "../../schemas";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { resolveVisibility } from "../shared/resolve-visibility";
import {
  changeContractValue,
  createContract,
  getContract,
  getContracts,
  transitionContract,
  updateContract,
} from "./controllers/contracts";

const nullableString = v.optional(v.nullable(v.string()));
const isoDate = v.pipe(v.string(), v.isoTimestamp());

const serviceLineSchema = v.object({
  serviceId: nullableString,
  name: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  ),
  billingType: v.optional(crmBillingTypeSchema),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
  unitPriceCents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  discountPercent: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  ),
});

const billingDay = v.optional(
  v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31))),
);

function toDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

const contractResponse = {
  200: {
    description: "Contract",
    content: { "application/json": { schema: resolver(crmContractSchema) } },
  },
};

/** Data opcional em pausar, retomar, cancelar e encerrar: o cliente avisou do
 * cancelamento no dia 31 e a equipe só registrou no dia 3. */
const transitionBody = v.object({
  workspaceId: v.string(),
  occurredAt: v.optional(isoDate),
  note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
});

/**
 * Contratos são a parte recorrente da venda, então seguem as permissões de
 * negócio. Valor e situação só mudam pelas rotas próprias, nunca pelo PATCH:
 * são elas que escrevem o histórico — a mesma razão pela qual etapa de
 * negócio não se muda por PATCH.
 */
const contract = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listCrmContracts",
      tags: ["CRM"],
      description:
        "List contracts with the active MRR and the count per status. Without crmDeal:read_all, only the caller's own.",
      responses: {
        200: {
          description: "Contracts and summary",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        status: v.optional(crmContractStatusSchema),
        companyId: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["read"] }),
    async (c) => {
      const { status, companyId } = c.req.valid("query");
      return c.json(
        await getContracts({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          visibility: await resolveVisibility(c, "crmDeal"),
          status,
          companyId,
        }),
      );
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createCrmContract",
      tags: ["CRM"],
      description:
        "Create a contract. With services, the monthly value is their monthly equivalent; without, it must be given.",
      responses: contractResponse,
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        companyId: v.string(),
        dealId: nullableString,
        title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
        startsAt: isoDate,
        endsAt: v.optional(v.nullable(isoDate)),
        billingDay,
        ownerUserId: nullableString,
        services: v.optional(
          v.pipe(v.array(serviceLineSchema), v.maxLength(50)),
        ),
        monthlyValueCents: v.optional(
          v.pipe(v.number(), v.integer(), v.minValue(0)),
        ),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["create"] }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await createContract({
          workspaceId: c.get("workspaceId"),
          actorUserId: c.get("userId"),
          input: {
            companyId: body.companyId,
            dealId: body.dealId,
            title: body.title,
            startsAt: new Date(body.startsAt),
            endsAt: toDate(body.endsAt),
            billingDay: body.billingDay,
            ownerUserId: body.ownerUserId,
            lines: body.services ?? [],
            monthlyValueCents: body.monthlyValueCents,
          },
        }),
      );
    },
  )
  .get(
    "/:contractId",
    describeRoute({
      operationId: "getCrmContract",
      tags: ["CRM"],
      description:
        "A contract with its services and the full history of value and status changes",
      responses: {
        200: {
          description: "Contract detail",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ contractId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["read"] }),
    async (c) => {
      const { contractId } = c.req.valid("param");
      return c.json(
        await getContract({ workspaceId: c.get("workspaceId"), contractId }),
      );
    },
  )
  .patch(
    "/:contractId",
    describeRoute({
      operationId: "updateCrmContract",
      tags: ["CRM"],
      description:
        "Edit title, end date, billing day or owner. Value and status have their own routes.",
      responses: contractResponse,
    }),
    validator("param", v.object({ contractId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        title: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
        ),
        endsAt: v.optional(v.nullable(isoDate)),
        billingDay,
        ownerUserId: nullableString,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { contractId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await updateContract({
          workspaceId: c.get("workspaceId"),
          actorUserId: c.get("userId"),
          contractId,
          input: {
            title: body.title,
            endsAt: toDate(body.endsAt),
            billingDay: body.billingDay,
            ownerUserId: body.ownerUserId,
          },
        }),
      );
    },
  )
  .post(
    "/:contractId/value",
    describeRoute({
      operationId: "changeCrmContractValue",
      tags: ["CRM"],
      description:
        "Adjust the contract: replace its services or set the monthly value. Records an upgrade or downgrade.",
      responses: contractResponse,
    }),
    validator("param", v.object({ contractId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        services: v.optional(
          v.pipe(v.array(serviceLineSchema), v.maxLength(50)),
        ),
        monthlyValueCents: v.optional(
          v.pipe(v.number(), v.integer(), v.minValue(0)),
        ),
        occurredAt: v.optional(isoDate),
        note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const { contractId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await changeContractValue({
          workspaceId: c.get("workspaceId"),
          contractId,
          actorUserId: c.get("userId"),
          lines: body.services,
          monthlyValueCents: body.monthlyValueCents,
          note: body.note,
          occurredAt: toDate(body.occurredAt) ?? undefined,
        }),
      );
    },
  )
  .post(
    "/:contractId/pause",
    describeRoute({
      operationId: "pauseCrmContract",
      tags: ["CRM"],
      description: "Pause an active contract. It stops counting in the MRR.",
      responses: contractResponse,
    }),
    validator("param", v.object({ contractId: v.string() })),
    validator("json", transitionBody),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["change_stage"] }),
    async (c) => {
      const { contractId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await transitionContract({
          workspaceId: c.get("workspaceId"),
          contractId,
          actorUserId: c.get("userId"),
          action: "pause",
          occurredAt: toDate(body.occurredAt) ?? undefined,
          note: body.note,
        }),
      );
    },
  )
  .post(
    "/:contractId/resume",
    describeRoute({
      operationId: "resumeCrmContract",
      tags: ["CRM"],
      description: "Resume a paused contract.",
      responses: contractResponse,
    }),
    validator("param", v.object({ contractId: v.string() })),
    validator("json", transitionBody),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["change_stage"] }),
    async (c) => {
      const { contractId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await transitionContract({
          workspaceId: c.get("workspaceId"),
          contractId,
          actorUserId: c.get("userId"),
          action: "resume",
          occurredAt: toDate(body.occurredAt) ?? undefined,
          note: body.note,
        }),
      );
    },
  )
  .post(
    "/:contractId/cancel",
    describeRoute({
      operationId: "cancelCrmContract",
      tags: ["CRM"],
      description:
        "Cancel a contract. When it was the client's last one, the client becomes churned.",
      responses: contractResponse,
    }),
    validator("param", v.object({ contractId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        occurredAt: v.optional(isoDate),
        note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
        cancelReasonId: nullableString,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["change_stage"] }),
    async (c) => {
      const { contractId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await transitionContract({
          workspaceId: c.get("workspaceId"),
          contractId,
          actorUserId: c.get("userId"),
          action: "cancel",
          occurredAt: toDate(body.occurredAt) ?? undefined,
          note: body.note,
          cancelReasonId: body.cancelReasonId,
        }),
      );
    },
  )
  .post(
    "/:contractId/finish",
    describeRoute({
      operationId: "finishCrmContract",
      tags: ["CRM"],
      description:
        "End a fixed-term contract that ran its course. The client becomes inactive, not churned.",
      responses: contractResponse,
    }),
    validator("param", v.object({ contractId: v.string() })),
    validator("json", transitionBody),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmDeal: ["change_stage"] }),
    async (c) => {
      const { contractId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await transitionContract({
          workspaceId: c.get("workspaceId"),
          contractId,
          actorUserId: c.get("userId"),
          action: "finish",
          occurredAt: toDate(body.occurredAt) ?? undefined,
          note: body.note,
        }),
      );
    },
  );

export default contract;
