import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { recordAuditLog } from "../../admin/audit-log";
import { crmContactSchema } from "../../schemas";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { resolveVisibility } from "../shared/resolve-visibility";
import exportContactsCtrl from "./controllers/export-contacts";
import getContactCtrl from "./controllers/get-contact";
import getContactsCtrl from "./controllers/get-contacts";
import {
  createContact,
  deleteContact,
  updateContact,
} from "./controllers/upsert-contact";

const nullableString = v.optional(v.nullable(v.string()));

const contactFields = {
  lastName: nullableString,
  email: v.optional(v.nullable(v.pipe(v.string(), v.trim()))),
  phone: nullableString,
  mobile: nullableString,
  jobTitle: nullableString,
  department: nullableString,
  linkedinUrl: nullableString,
  companyId: nullableString,
  ownerUserId: nullableString,
  isPrimary: v.optional(v.boolean()),
  emailOptOut: v.optional(v.boolean()),
  consentSource: nullableString,
  consentAt: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp()))),
  notes: nullableString,
};

function parseConsentAt(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

const contact = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listCrmContacts",
      tags: ["CRM"],
      description:
        "List contacts. Without crmContact:read_all, only the caller's own are returned.",
      responses: {
        200: {
          description: "Paginated contacts",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        search: v.optional(v.string()),
        companyId: v.optional(v.string()),
        ownerUserId: v.optional(v.string()),
        includeArchived: v.optional(v.string()),
        limit: v.optional(v.string()),
        offset: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmContact: ["read"] }),
    async (c) => {
      const { search, companyId, ownerUserId, includeArchived, limit, offset } =
        c.req.valid("query");
      return c.json(
        await getContactsCtrl({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          visibility: await resolveVisibility(c, "crmContact"),
          search,
          companyId,
          ownerUserId,
          includeArchived: includeArchived === "true",
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
        }),
      );
    },
  )
  .get(
    "/export",
    describeRoute({
      operationId: "exportCrmContacts",
      tags: ["CRM"],
      description:
        "Download the contact base as CSV. Audited, and gated by its own permission.",
      responses: {
        200: {
          description: "CSV file",
          content: { "text/csv": { schema: resolver(v.string()) } },
        },
      },
    }),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmContact: ["export"] }),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { csv, count } = await exportContactsCtrl({
        workspaceId,
        userId: c.get("userId"),
        visibility: await resolveVisibility(c, "crmContact"),
      });

      await recordAuditLog(c, {
        action: "crm.contact.export",
        entityType: "crm_contact",
        workspaceId,
        summary: `Exportou ${count} contatos do CRM.`,
        metadata: { count },
      });

      return c.body(csv, 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts-${workspaceId}.csv"`,
      });
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createCrmContact",
      tags: ["CRM"],
      description:
        "Create a contact. Contacts with the same email are returned as possible duplicates, not blocked.",
      responses: {
        200: {
          description: "Contact created",
          content: {
            "application/json": { schema: resolver(crmContactSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        firstName: v.pipe(
          v.string(),
          v.trim(),
          v.minLength(1),
          v.maxLength(120),
        ),
        ...contactFields,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmContact: ["create"] }),
    async (c) => {
      const { workspaceId: _ignored, consentAt, ...rest } = c.req.valid("json");
      return c.json(
        await createContact({
          workspaceId: c.get("workspaceId"),
          input: { ...rest, consentAt: parseConsentAt(consentAt) },
        }),
      );
    },
  )
  .get(
    "/:contactId",
    describeRoute({
      operationId: "getCrmContact",
      tags: ["CRM"],
      description:
        "A contact with its company, owner and the deals it takes part in",
      responses: {
        200: {
          description: "Contact detail",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ contactId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmContact: ["read"] }),
    async (c) => {
      const { contactId } = c.req.valid("param");
      return c.json(
        await getContactCtrl({ workspaceId: c.get("workspaceId"), contactId }),
      );
    },
  )
  .patch(
    "/:contactId",
    describeRoute({
      operationId: "updateCrmContact",
      tags: ["CRM"],
      description: "Update, archive or set the consent state of a contact",
      responses: {
        200: {
          description: "Contact updated",
          content: {
            "application/json": { schema: resolver(crmContactSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ contactId: v.string() })),
    validator(
      "json",
      v.object({
        workspaceId: v.string(),
        firstName: v.optional(
          v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
        ),
        archived: v.optional(v.boolean()),
        ...contactFields,
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmContact: ["update"] }),
    async (c) => {
      const { contactId } = c.req.valid("param");
      const { workspaceId: _ignored, consentAt, ...rest } = c.req.valid("json");
      return c.json(
        await updateContact({
          workspaceId: c.get("workspaceId"),
          contactId,
          input: { ...rest, consentAt: parseConsentAt(consentAt) },
        }),
      );
    },
  )
  .delete(
    "/:contactId",
    describeRoute({
      operationId: "deleteCrmContact",
      tags: ["CRM"],
      description:
        "Permanently delete a contact and its links to deals. Audited as an LGPD erasure.",
      responses: {
        200: {
          description: "Contact deleted",
          content: {
            "application/json": { schema: resolver(crmContactSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ contactId: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmContact: ["delete"] }),
    async (c) => {
      const { contactId } = c.req.valid("param");
      const deleted = await deleteContact({
        workspaceId: c.get("workspaceId"),
        contactId,
      });

      await recordAuditLog(c, {
        action: "crm.contact.deleted",
        entityType: "crm_contact",
        entityId: contactId,
        entityName: [deleted.firstName, deleted.lastName]
          .filter(Boolean)
          .join(" "),
        workspaceId: c.get("workspaceId"),
        summary: "Excluiu um contato do CRM.",
        before: deleted,
      });

      return c.json(deleted);
    },
  );

export default contact;
