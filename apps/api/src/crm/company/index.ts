import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  crmCompanySchema,
  crmCompanySizeSchema,
  crmCompanyStatusSchema,
  crmPaymentMethodSchema,
  crmPaymentTermSchema,
  crmPersonTypeSchema,
} from "../../schemas";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { BRAZIL_STATES } from "../shared/client-profile";
import { resolveVisibility } from "../shared/resolve-visibility";
import getCitiesCtrl from "./controllers/get-cities";
import getCompaniesCtrl from "./controllers/get-companies";
import getCompanyCtrl from "./controllers/get-company";
import {
  createCompany,
  deleteCompany,
  updateCompany,
} from "./controllers/upsert-company";
import { companyLookup, LookupNotFoundError } from "./lookup";

const nullableString = v.optional(v.nullable(v.string()));

/** UF em lista fechada: as 27 unidades federativas não mudam, e aceitar texto
 * livre aqui é o que produz "SP", "sp" e "São Paulo" na mesma coluna. */
const stateField = v.optional(v.nullable(v.picklist([...BRAZIL_STATES])));

const companyFields = {
  legalName: nullableString,
  taxId: nullableString,
  personType: v.optional(crmPersonTypeSchema),
  stateRegistration: nullableString,
  municipalRegistration: nullableString,
  domain: nullableString,
  website: nullableString,
  phone: nullableString,
  segmentId: nullableString,
  sourceId: nullableString,
  companySize: v.optional(v.nullable(crmCompanySizeSchema)),
  status: v.optional(crmCompanyStatusSchema),
  clientSince: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp()))),
  churnedAt: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp()))),
  churnReason: nullableString,
  billingEmail: nullableString,
  paymentTerms: v.optional(v.nullable(crmPaymentTermSchema)),
  billingDay: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31))),
  ),
  paymentMethod: v.optional(v.nullable(crmPaymentMethodSchema)),
  employeeCount: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  ),
  ownerUserId: nullableString,
  addressLine: nullableString,
  addressNumber: nullableString,
  addressComplement: nullableString,
  district: nullableString,
  city: nullableString,
  state: stateField,
  postalCode: nullableString,
  country: nullableString,
  description: nullableString,
};

/** As datas chegam como ISO no JSON e o Drizzle espera Date. */
function toDate(value?: string | null) {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

function toCompanyInput<
  T extends { clientSince?: string | null; churnedAt?: string | null },
>(input: T) {
  return {
    ...input,
    clientSince: toDate(input.clientSince),
    churnedAt: toDate(input.churnedAt),
  };
}

const company = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listCrmCompanies",
      tags: ["CRM"],
      description:
        "List companies. Without crmCompany:read_all, only the caller's own are returned.",
      responses: {
        200: {
          description: "Paginated companies",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        search: v.optional(v.string()),
        ownerUserId: v.optional(v.string()),
        includeArchived: v.optional(v.string()),
        limit: v.optional(v.string()),
        offset: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmCompany: ["read"] }),
    async (c) => {
      const { search, ownerUserId, includeArchived, limit, offset } =
        c.req.valid("query");
      return c.json(
        await getCompaniesCtrl({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          visibility: await resolveVisibility(c, "crmCompany"),
          search,
          ownerUserId,
          includeArchived: includeArchived === "true",
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
        }),
      );
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createCrmCompany",
      tags: ["CRM"],
      description:
        "Create a company. Possible duplicates by tax id or domain are returned alongside, not blocked.",
      responses: {
        200: {
          description: "Company created",
          content: {
            "application/json": { schema: resolver(crmCompanySchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
        // Obrigatório: uma empresa sem pessoa é um registro com o qual não se
        // faz nada. A importação CSV do plano 008 é a exceção, e ela chama o
        // controller direto.
        primaryContact: v.object({
          firstName: v.pipe(
            v.string(),
            v.trim(),
            v.minLength(1),
            v.maxLength(120),
          ),
          lastName: nullableString,
          email: v.optional(v.nullable(v.pipe(v.string(), v.email()))),
          phone: nullableString,
          jobTitle: nullableString,
        }),
        ...companyFields,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmCompany: ["create"] }),
    async (c) => {
      const {
        workspaceId: _ignored,
        primaryContact,
        ...input
      } = c.req.valid("json");
      return c.json(
        await createCompany({
          workspaceId: c.get("workspaceId"),
          input: toCompanyInput({
            ...input,
            ownerUserId:
              input.ownerUserId === undefined
                ? c.get("userId")
                : input.ownerUserId,
          }),
          primaryContact,
        }),
      );
    },
  )
  .get(
    "/cities",
    describeRoute({
      operationId: "listCrmCompanyCities",
      tags: ["CRM"],
      description:
        "Cities already typed in this workspace, for autocomplete. Optionally narrowed by state.",
      responses: {
        200: {
          description: "Distinct city names",
          content: {
            "application/json": { schema: resolver(v.array(v.string())) },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        state: v.optional(v.picklist([...BRAZIL_STATES])),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmCompany: ["read"] }),
    async (c) => {
      const { state } = c.req.valid("query");
      return c.json(
        await getCitiesCtrl({ workspaceId: c.get("workspaceId"), state }),
      );
    },
  )
  .get(
    "/lookup/cnpj",
    describeRoute({
      operationId: "lookupCrmCompanyCnpj",
      tags: ["CRM"],
      description: "Suggest public company data for a valid CNPJ",
    }),
    validator("query", v.object({ workspaceId: v.string(), cnpj: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmCompany: ["read"] }),
    async (c) => {
      try {
        const result = await companyLookup.cnpj(c.req.valid("query").cnpj);
        if (!result)
          throw new HTTPException(503, {
            message:
              "Consulta de CNPJ indisponível. Preencha os dados manualmente.",
          });
        return c.json(result);
      } catch (error) {
        if (error instanceof HTTPException) throw error;
        if (error instanceof LookupNotFoundError)
          throw new HTTPException(404, {
            message: "CNPJ não encontrado. Preencha os dados manualmente.",
          });
        throw new HTTPException(400, { message: "CNPJ inválido" });
      }
    },
  )
  .get(
    "/lookup/cep",
    describeRoute({
      operationId: "lookupCrmCompanyCep",
      tags: ["CRM"],
      description: "Suggest an address for a valid Brazilian postal code",
    }),
    validator("query", v.object({ workspaceId: v.string(), cep: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmCompany: ["read"] }),
    async (c) => {
      try {
        const result = await companyLookup.cep(c.req.valid("query").cep);
        if (!result)
          throw new HTTPException(503, {
            message:
              "Consulta de CEP indisponível. Preencha o endereço manualmente.",
          });
        return c.json(result);
      } catch (error) {
        if (error instanceof HTTPException) throw error;
        if (error instanceof LookupNotFoundError)
          throw new HTTPException(404, {
            message: "CEP não encontrado. Preencha o endereço manualmente.",
          });
        throw new HTTPException(400, { message: "CEP inválido" });
      }
    },
  )
  .get(
    "/:companyId",
    describeRoute({
      operationId: "getCrmCompany",
      tags: ["CRM"],
      description:
        "Account view: the company with its people, deal totals and the delivery projects linked to it",
      responses: {
        200: {
          description: "Company detail",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ companyId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmCompany: ["read"] }),
    async (c) => {
      const { companyId } = c.req.valid("param");
      const result = await getCompanyCtrl({
        workspaceId: c.get("workspaceId"),
        companyId,
      });
      const canProduction = await hasWorkspacePermission(c, { task: ["read"] });
      return c.json(
        canProduction
          ? result
          : { ...result, tasksByProject: [], openTaskCount: 0 },
      );
    },
  )
  .patch(
    "/:companyId",
    describeRoute({
      operationId: "updateCrmCompany",
      tags: ["CRM"],
      description: "Update or archive a company",
      responses: {
        200: {
          description: "Company updated",
          content: {
            "application/json": { schema: resolver(crmCompanySchema) },
          },
        },
      },
    }),
    validator("param", v.object({ companyId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        name: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
        ),
        archived: v.optional(v.boolean()),
        ...companyFields,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmCompany: ["update"] }),
    async (c) => {
      const { companyId } = c.req.valid("param");
      const { workspaceId: _ignored, ...input } = c.req.valid("json");
      return c.json(
        await updateCompany({
          workspaceId: c.get("workspaceId"),
          companyId,
          input: toCompanyInput(input),
        }),
      );
    },
  )
  .delete(
    "/:companyId",
    describeRoute({
      operationId: "deleteCrmCompany",
      tags: ["CRM"],
      description:
        "Delete a company. Its projects survive with the client link cleared.",
      responses: {
        200: {
          description: "Company deleted",
          content: {
            "application/json": { schema: resolver(crmCompanySchema) },
          },
        },
      },
    }),
    validator("param", v.object({ companyId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmCompany: ["delete"] }),
    async (c) => {
      const { companyId } = c.req.valid("param");
      return c.json(
        await deleteCompany({ workspaceId: c.get("workspaceId"), companyId }),
      );
    },
  );

export default company;
