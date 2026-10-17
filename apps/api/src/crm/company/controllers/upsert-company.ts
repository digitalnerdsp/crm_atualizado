import { and, eq, ne, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  type CrmCompanySize,
  type CrmCompanyStatus,
  type CrmPaymentMethod,
  type CrmPaymentTerm,
  type CrmPersonType,
  crmCompanyTable,
  crmContactTable,
  crmContractTable,
  crmSegmentTable,
  crmSourceTable,
} from "../../../database/schema";
import { publishEvent } from "../../../events";
import { isValidTaxId } from "../../shared/tax-id";

export type CompanyInput = {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  personType?: CrmPersonType;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  domain?: string | null;
  website?: string | null;
  phone?: string | null;
  segmentId?: string | null;
  sourceId?: string | null;
  companySize?: CrmCompanySize | null;
  status?: CrmCompanyStatus;
  clientSince?: Date | null;
  churnedAt?: Date | null;
  churnReason?: string | null;
  billingEmail?: string | null;
  paymentTerms?: CrmPaymentTerm | null;
  billingDay?: number | null;
  paymentMethod?: CrmPaymentMethod | null;
  employeeCount?: number | null;
  ownerUserId?: string | null;
  addressLine?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  description?: string | null;
  archived?: boolean;
};

/** Stored without a mask so the unique index and imports can match on it. */
function normalizeTaxId(taxId: string | null | undefined) {
  if (taxId === undefined) return undefined;
  if (taxId === null) return null;
  const digits = taxId.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function normalizeDomain(domain: string | null | undefined) {
  if (domain === undefined) return undefined;
  if (domain === null) return null;
  const cleaned = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Duplicates are surfaced, not blocked: the same company legitimately exists
 * twice while a team cleans up an import, and refusing the write would strand
 * whoever is entering it. Merging belongs to the import tooling of plan 008.
 */
export async function findPossibleDuplicates({
  workspaceId,
  taxId,
  domain,
  excludeId,
}: {
  workspaceId: string;
  taxId?: string | null;
  domain?: string | null;
  excludeId?: string;
}) {
  const matchers = [
    taxId ? eq(crmCompanyTable.taxId, taxId) : undefined,
    domain ? eq(crmCompanyTable.domain, domain) : undefined,
  ].filter((matcher) => matcher !== undefined);

  if (matchers.length === 0) return [];

  return db
    .select({
      id: crmCompanyTable.id,
      name: crmCompanyTable.name,
      taxId: crmCompanyTable.taxId,
      domain: crmCompanyTable.domain,
    })
    .from(crmCompanyTable)
    .where(
      and(
        eq(crmCompanyTable.workspaceId, workspaceId),
        or(...matchers),
        excludeId ? ne(crmCompanyTable.id, excludeId) : undefined,
      ),
    )
    .limit(5);
}

/**
 * O contato principal nasce junto da empresa: uma empresa sem pessoa é um
 * registro com o qual não se faz nada. Quem cria decide o nome; o resto é
 * opcional, porque exigir e-mail e telefone no primeiro contato trava o
 * cadastro exatamente quando ele mais precisa acontecer.
 */
export type PrimaryContactInput = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
};

function assertValidTaxId(
  personType: CrmPersonType,
  taxId: string | null | undefined,
) {
  if (isValidTaxId(personType, taxId)) return;
  throw new HTTPException(400, {
    message:
      personType === "pf"
        ? "CPF inválido: confira os dígitos."
        : "CNPJ inválido: confira os dígitos.",
  });
}

/**
 * A chave estrangeira garante que a linha existe, não que ela é deste
 * workspace — sem esta checagem, um id de outro workspace classificaria o
 * cliente com um segmento que ninguém daqui consegue ver.
 */
async function assertBelongsToWorkspace({
  workspaceId,
  segmentId,
  sourceId,
}: {
  workspaceId: string;
  segmentId?: string | null;
  sourceId?: string | null;
}) {
  if (segmentId) {
    const [segment] = await db
      .select({ id: crmSegmentTable.id })
      .from(crmSegmentTable)
      .where(
        and(
          eq(crmSegmentTable.id, segmentId),
          eq(crmSegmentTable.workspaceId, workspaceId),
        ),
      );
    if (!segment) {
      throw new HTTPException(404, { message: "Segment not found" });
    }
  }

  if (sourceId) {
    const [source] = await db
      .select({ id: crmSourceTable.id })
      .from(crmSourceTable)
      .where(
        and(
          eq(crmSourceTable.id, sourceId),
          eq(crmSourceTable.workspaceId, workspaceId),
        ),
      );
    if (!source) {
      throw new HTTPException(404, { message: "Source not found" });
    }
  }
}

export async function createCompany({
  workspaceId,
  input,
  primaryContact,
}: {
  workspaceId: string;
  input: CompanyInput & { name: string };
  /** Opcional aqui, obrigatório na rota: a importação CSV do plano 008 cria
   * empresa sem contato quando a planilha não tem um, e bloquear a importação
   * transformaria a regra num motivo para não migrar a base. */
  primaryContact?: PrimaryContactInput;
}) {
  const personType = input.personType ?? "pj";
  const taxId = normalizeTaxId(input.taxId) ?? null;
  const domain = normalizeDomain(input.domain) ?? null;

  assertValidTaxId(personType, taxId);
  await assertBelongsToWorkspace({
    workspaceId,
    segmentId: input.segmentId,
    sourceId: input.sourceId,
  });

  const duplicates = await findPossibleDuplicates({
    workspaceId,
    taxId,
    domain,
  });

  // Empresa e contato numa transação: metade do cadastro gravado é pior do
  // que nenhum, porque ninguém vê que faltou.
  const { created, contact } = await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(crmCompanyTable)
      .values({
        workspaceId,
        name: input.name,
        legalName: input.legalName ?? null,
        taxId,
        personType,
        stateRegistration: input.stateRegistration ?? null,
        municipalRegistration: input.municipalRegistration ?? null,
        domain,
        website: input.website ?? null,
        phone: input.phone ?? null,
        segmentId: input.segmentId ?? null,
        sourceId: input.sourceId ?? null,
        companySize: input.companySize ?? null,
        status: input.status ?? "prospect",
        clientSince: input.clientSince ?? null,
        billingEmail: input.billingEmail ?? null,
        paymentTerms: input.paymentTerms ?? null,
        billingDay: input.billingDay ?? null,
        paymentMethod: input.paymentMethod ?? null,
        employeeCount: input.employeeCount ?? null,
        ownerUserId: input.ownerUserId ?? null,
        addressLine: input.addressLine ?? null,
        addressNumber: input.addressNumber ?? null,
        addressComplement: input.addressComplement ?? null,
        district: input.district ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? "BR",
        description: input.description ?? null,
      })
      .returning();

    if (!company) {
      throw new HTTPException(500, { message: "Failed to create company" });
    }

    if (!primaryContact) return { created: company, contact: null };

    const [person] = await tx
      .insert(crmContactTable)
      .values({
        workspaceId,
        companyId: company.id,
        firstName: primaryContact.firstName,
        lastName: primaryContact.lastName ?? null,
        email: primaryContact.email ?? null,
        phone: primaryContact.phone ?? null,
        jobTitle: primaryContact.jobTitle ?? null,
        ownerUserId: input.ownerUserId ?? null,
        isPrimary: true,
      })
      .returning();

    if (!person) {
      throw new HTTPException(500, { message: "Failed to create contact" });
    }

    return { created: company, contact: person };
  });

  await publishEvent("crm.company.created", {
    companyId: created.id,
    workspaceId,
  });

  if (contact) {
    await publishEvent("crm.contact.created", {
      contactId: contact.id,
      workspaceId,
    });
  }

  return {
    ...created,
    primaryContact: contact,
    possibleDuplicates: duplicates,
  };
}

export async function updateCompany({
  workspaceId,
  companyId,
  input,
}: {
  workspaceId: string;
  companyId: string;
  input: CompanyInput;
}) {
  const taxId = normalizeTaxId(input.taxId);
  const domain = normalizeDomain(input.domain);

  const [current] = await db
    .select({
      personType: crmCompanyTable.personType,
      status: crmCompanyTable.status,
    })
    .from(crmCompanyTable)
    .where(
      and(
        eq(crmCompanyTable.id, companyId),
        eq(crmCompanyTable.workspaceId, workspaceId),
      ),
    );

  if (!current) {
    throw new HTTPException(404, { message: "Company not found" });
  }

  // Trocar o tipo de pessoa sem trocar o documento (ou vice-versa) tem de
  // validar contra o par que fica gravado, não contra metade dele.
  if (taxId !== undefined || input.personType !== undefined) {
    assertValidTaxId(
      input.personType ?? current.personType,
      taxId === undefined ? undefined : taxId,
    );
  }

  await assertBelongsToWorkspace({
    workspaceId,
    segmentId: input.segmentId,
    sourceId: input.sourceId,
  });

  /* Churn é a única transição com efeito colateral: a data de saída é o que o
   * relatório de retenção lê, e ninguém lembra de preencher um campo separado
   * no momento em que está registrando a perda do cliente. */
  const churnedAt =
    input.churnedAt !== undefined
      ? input.churnedAt
      : input.status === "churned" && current.status !== "churned"
        ? new Date()
        : input.status !== undefined && input.status !== "churned"
          ? null
          : undefined;

  const [updated] = await db
    .update(crmCompanyTable)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
      ...(taxId === undefined ? {} : { taxId }),
      ...(input.personType === undefined
        ? {}
        : { personType: input.personType }),
      ...(input.stateRegistration === undefined
        ? {}
        : { stateRegistration: input.stateRegistration }),
      ...(input.municipalRegistration === undefined
        ? {}
        : { municipalRegistration: input.municipalRegistration }),
      ...(domain === undefined ? {} : { domain }),
      ...(input.website === undefined ? {} : { website: input.website }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.segmentId === undefined ? {} : { segmentId: input.segmentId }),
      ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
      ...(input.companySize === undefined
        ? {}
        : { companySize: input.companySize }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.clientSince === undefined
        ? {}
        : { clientSince: input.clientSince }),
      ...(churnedAt === undefined ? {} : { churnedAt }),
      ...(input.churnReason === undefined
        ? {}
        : { churnReason: input.churnReason }),
      ...(input.billingEmail === undefined
        ? {}
        : { billingEmail: input.billingEmail }),
      ...(input.paymentTerms === undefined
        ? {}
        : { paymentTerms: input.paymentTerms }),
      ...(input.billingDay === undefined
        ? {}
        : { billingDay: input.billingDay }),
      ...(input.paymentMethod === undefined
        ? {}
        : { paymentMethod: input.paymentMethod }),
      ...(input.employeeCount === undefined
        ? {}
        : { employeeCount: input.employeeCount }),
      ...(input.ownerUserId === undefined
        ? {}
        : { ownerUserId: input.ownerUserId }),
      ...(input.addressLine === undefined
        ? {}
        : { addressLine: input.addressLine }),
      ...(input.addressNumber === undefined
        ? {}
        : { addressNumber: input.addressNumber }),
      ...(input.addressComplement === undefined
        ? {}
        : { addressComplement: input.addressComplement }),
      ...(input.district === undefined ? {} : { district: input.district }),
      ...(input.city === undefined ? {} : { city: input.city }),
      ...(input.state === undefined ? {} : { state: input.state }),
      ...(input.postalCode === undefined
        ? {}
        : { postalCode: input.postalCode }),
      ...(input.country === undefined ? {} : { country: input.country }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.archived === undefined
        ? {}
        : { archivedAt: input.archived ? new Date() : null }),
    })
    .where(
      and(
        eq(crmCompanyTable.id, companyId),
        eq(crmCompanyTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: "Company not found" });
  }

  await publishEvent("crm.company.updated", {
    companyId: updated.id,
    workspaceId,
  });

  return updated;
}

export async function deleteCompany({
  workspaceId,
  companyId,
}: {
  workspaceId: string;
  companyId: string;
}) {
  /* O contrato bloqueia a exclusão no banco (restrict): apagar o cliente
   * levaria junto o histórico de receita dele. Checado antes para devolver
   * uma mensagem que diga o que fazer, não um erro de chave estrangeira. */
  const [contract] = await db
    .select({ id: crmContractTable.id })
    .from(crmContractTable)
    .where(eq(crmContractTable.companyId, companyId))
    .limit(1);

  if (contract) {
    throw new HTTPException(409, {
      message:
        "Este cliente tem contratos e não pode ser excluído, porque isso apagaria o histórico de receita. Arquive o cliente.",
    });
  }

  const [deleted] = await db
    .delete(crmCompanyTable)
    .where(
      and(
        eq(crmCompanyTable.id, companyId),
        eq(crmCompanyTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "Company not found" });
  }

  await publishEvent("crm.company.deleted", {
    companyId: deleted.id,
    workspaceId,
  });

  return deleted;
}
