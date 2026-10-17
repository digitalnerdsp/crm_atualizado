import type { CrmCompanyStatus, CrmPersonType } from "../../../database/schema";
import { BRAZIL_STATES } from "../../shared/client-profile";
import { isValidTaxId, stripTaxId } from "../../shared/tax-id";

/**
 * Os campos que uma planilha pode trazer, por entidade.
 *
 * A tela mapeia coluna → campo antes de enviar, então a API recebe linhas já
 * com as chaves daqui. Isso mantém a tradução "Razão Social" → `legalName`
 * onde a pessoa a faz, e a validação onde os dados são gravados.
 */
export const IMPORT_FIELDS = {
  company: [
    "name",
    "legalName",
    "taxId",
    "personType",
    "phone",
    "domain",
    "website",
    "billingEmail",
    "segment",
    "source",
    "status",
    "clientSince",
    "addressLine",
    "addressNumber",
    "district",
    "city",
    "state",
    "postalCode",
    "description",
  ],
  contact: [
    "firstName",
    "lastName",
    "email",
    "phone",
    "mobile",
    "jobTitle",
    "company",
    "notes",
  ],
  deal: [
    "title",
    "company",
    "value",
    "stage",
    "source",
    "ownerEmail",
    "expectedCloseDate",
  ],
} as const;

export type ImportEntity = keyof typeof IMPORT_FIELDS;
export type ImportRow = Record<string, string | undefined>;

/** O campo sem o qual a linha não vira registro nenhum. */
export const REQUIRED_FIELD: Record<ImportEntity, string> = {
  company: "name",
  contact: "firstName",
  deal: "title",
};

export function text(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Dinheiro de planilha vem como "1.234,56", "1234.56" ou "R$ 1.234,56". O
 * separador decimal é o último ponto ou vírgula: quem escreve 1.234 numa
 * planilha brasileira quer mil duzentos e trinta e quatro, não 1,234.
 */
export function parseMoneyCents(value: string | undefined) {
  const raw = text(value);
  if (!raw) return null;

  const digits = raw.replace(/[^\d,.-]/g, "");
  if (!digits) return null;

  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  const decimalAt = Math.max(lastComma, lastDot);

  const hasDecimals = decimalAt >= 0 && digits.length - decimalAt - 1 <= 2;
  const normalized = hasDecimals
    ? `${digits.slice(0, decimalAt).replace(/[.,]/g, "")}.${digits.slice(decimalAt + 1)}`
    : digits.replace(/[.,]/g, "");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

/** Datas de planilha: dd/mm/aaaa (o que o Excel brasileiro escreve) e ISO. */
export function parseDate(value: string | undefined) {
  const raw = text(value);
  if (!raw) return null;

  const brazilian = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brazilian) {
    const [, day, month, year] = brazilian;
    // Meio-dia: meia-noite viraria o dia anterior em UTC-3.
    return new Date(Number(year), Number(month) - 1, Number(day), 12);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parsePersonType(
  value: string | undefined,
  taxId: string | null,
): CrmPersonType {
  // "PF", "Pessoa Física", "fisica": a planilha de cada um escreve à sua maneira.
  const raw = text(value)
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (raw === "pf" || raw?.includes("fisic")) return "pf";
  if (raw === "pj" || raw?.includes("juridic")) return "pj";
  // Sem coluna: o documento diz. CPF tem 11 dígitos, CNPJ tem 14.
  return taxId && stripTaxId(taxId).length === 11 ? "pf" : "pj";
}

const STATUS_WORDS: Record<string, CrmCompanyStatus> = {
  prospect: "prospect",
  ativo: "active",
  active: "active",
  cliente: "active",
  inativo: "inactive",
  inactive: "inactive",
  churn: "churned",
  churned: "churned",
  perdido: "churned",
};

export function parseStatus(value: string | undefined) {
  const raw = text(value)?.toLowerCase();
  return raw ? (STATUS_WORDS[raw] ?? null) : null;
}

export function parseState(value: string | undefined) {
  const raw = text(value)?.toUpperCase();
  if (!raw) return null;
  return (BRAZIL_STATES as readonly string[]).includes(raw) ? raw : null;
}

/** Documento inválido não impede a importação: vira aviso na linha, e o
 * cadastro entra sem ele — barrar a planilha inteira por um dígito trocado é
 * o caminho mais curto para ninguém migrar. */
export function parseTaxId(
  value: string | undefined,
  personType: CrmPersonType,
) {
  const raw = text(value);
  if (!raw) return { taxId: null, warning: null };

  const digits = stripTaxId(raw);
  if (digits.length === 0) return { taxId: null, warning: null };

  if (!isValidTaxId(personType, digits)) {
    return {
      taxId: null,
      warning: `Documento inválido (${raw}); a linha entrou sem ele.`,
    };
  }

  return { taxId: digits, warning: null };
}

export function normalizeDomain(value: string | undefined) {
  const raw = text(value);
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return cleaned || null;
}
