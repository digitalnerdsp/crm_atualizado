import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { crmBillingTypeSchema } from "../../schemas";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { resolveVisibility } from "../shared/resolve-visibility";
import createSaleCtrl from "./controllers/create-sale";
import getSalesCtrl, { type SaleSortField } from "./controllers/get-sales";

const isoDate = v.pipe(v.string(), v.isoTimestamp());
const nullableText = (max: number) =>
  v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max))));

const sale = new Hono<{
  Variables: { userId: string; workspaceId: string };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listCrmSales",
      tags: ["CRM"],
      description:
        "List sales (won deals) for the quick-lookup table. Without crmDeal:read_all, only the caller's own are returned.",
      responses: {
        200: {
          description: "Paginated sales",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        from: v.optional(isoDate),
        to: v.optional(isoDate),
        ownerUserId: v.optional(v.string()),
        search: v.optional(v.string()),
        sortBy: v.optional(v.picklist(["wonAt", "valueCents", "company"])),
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
        await getSalesCtrl({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          visibility: await resolveVisibility(c, "crmDeal"),
          from: query.from ? new Date(query.from) : undefined,
          to: query.to ? new Date(query.to) : undefined,
          ownerUserId: query.ownerUserId,
          search: query.search,
          sortBy: query.sortBy as SaleSortField | undefined,
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
      operationId: "createCrmSale",
      tags: ["CRM"],
      description:
        "Create a sale directly, without going through the funnel: company and at least one service are required. Recurring items generate the contract on the sale date.",
      responses: {
        200: {
          description: "Sale created",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        companyId: v.pipe(v.string(), v.minLength(1)),
        ownerUserId: nullableText(128),
        soldAt: isoDate,
        items: v.pipe(
          v.array(
            v.object({
              serviceId: v.optional(v.nullable(v.string())),
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
              notes: nullableText(1000),
            }),
          ),
          v.minLength(1),
          v.maxLength(100),
        ),
        notes: nullableText(4000),
        paymentForm: v.optional(
          v.nullable(
            v.picklist([
              "cash",
              "pix",
              "boleto",
              "card",
              "installments",
              "custom",
            ]),
          ),
        ),
        paymentFormNote: nullableText(200),
        contractEndsAt: v.optional(v.nullable(isoDate)),
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
      const body = c.req.valid("json");
      return c.json(
        await createSaleCtrl({
          workspaceId: c.get("workspaceId"),
          actorUserId: c.get("userId"),
          companyId: body.companyId,
          ownerUserId: body.ownerUserId,
          soldAt: new Date(body.soldAt),
          items: body.items,
          notes: body.notes,
          paymentForm: body.paymentForm,
          paymentFormNote: body.paymentFormNote,
          contractEndsAt: body.contractEndsAt
            ? new Date(body.contractEndsAt)
            : null,
          billingDay: body.billingDay,
        }),
      );
    },
  );

export default sale;
