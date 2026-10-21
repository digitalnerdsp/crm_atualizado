import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  lookupCompanyCep,
  lookupCompanyCnpj,
} from "@/fetchers/crm/company/lookup";
import {
  useCrmCompanyCities,
  useCrmSegments,
  useCrmSources,
} from "@/hooks/queries/crm/use-crm-taxonomy";

/** As 27 unidades federativas. Lista fechada é o que impede "SP", "sp" e
 * "São Paulo" na mesma coluna. */
export const BRAZIL_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export const COMPANY_SIZES = ["mei", "me", "epp", "medium", "large"] as const;
export const COMPANY_STATUSES = [
  "prospect",
  "active",
  "inactive",
  "churned",
] as const;
export const PAYMENT_TERMS = ["cash", "15", "30", "30_60", "custom"] as const;
export const PAYMENT_METHODS = ["pix", "boleto", "card", "transfer"] as const;

const SIZE_LABEL_KEY = {
  mei: "sizeMei",
  me: "sizeMe",
  epp: "sizeEpp",
  medium: "sizeMedium",
  large: "sizeLarge",
} as const;

const STATUS_LABEL_KEY = {
  prospect: "statusProspect",
  active: "statusActive",
  inactive: "statusInactive",
  churned: "statusChurned",
} as const;

const TERMS_LABEL_KEY = {
  cash: "termsCash",
  "15": "terms15",
  "30": "terms30",
  "30_60": "terms3060",
  custom: "termsCustom",
} as const;

const METHOD_LABEL_KEY = {
  pix: "methodPix",
  boleto: "methodBoleto",
  card: "methodCard",
  transfer: "methodTransfer",
} as const;

export type BrazilState = (typeof BRAZIL_STATES)[number];
export type CompanySize = (typeof COMPANY_SIZES)[number];
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type CompanyFormState = {
  name: string;
  personType: "pj" | "pf";
  taxId: string;
  legalName: string;
  stateRegistration: string;
  municipalRegistration: string;
  domain: string;
  phone: string;
  segmentId: string;
  sourceId: string;
  companySize: CompanySize | "";
  status: CompanyStatus;
  clientSince: string;
  state: BrazilState | "";
  city: string;
  postalCode: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  district: string;
  billingEmail: string;
  paymentTerms: PaymentTerm | "";
  billingDay: string;
  paymentMethod: PaymentMethod | "";
};

export const emptyCompanyForm: CompanyFormState = {
  name: "",
  personType: "pj",
  taxId: "",
  legalName: "",
  stateRegistration: "",
  municipalRegistration: "",
  domain: "",
  phone: "",
  segmentId: "",
  sourceId: "",
  companySize: "",
  status: "prospect",
  clientSince: "",
  state: "",
  city: "",
  postalCode: "",
  addressLine: "",
  addressNumber: "",
  addressComplement: "",
  district: "",
  billingEmail: "",
  paymentTerms: "",
  billingDay: "",
  paymentMethod: "",
};

/** O "não informado" das listas: o Select do coss não aceita valor vazio, e
 * um item explícito é o que permite limpar a classificação depois. */
const NONE = "__none__";
const SUGGESTION_LABELS: Partial<Record<keyof CompanyFormState, string>> = {
  name: "Nome",
  legalName: "Razão social",
  phone: "Telefone",
  postalCode: "CEP",
  addressLine: "Logradouro",
  addressNumber: "Número",
  addressComplement: "Complemento",
  district: "Bairro",
  city: "Cidade",
  state: "UF",
};
const LOOKUP_SOURCE_LABELS = {
  brasilapi: "BrasilAPI",
  cnpjws: "CNPJ.ws",
  viacep: "ViaCEP",
  "brasilapi-cep": "BrasilAPI",
} as const;

function toValue(value: string) {
  return value === NONE ? "" : value;
}

function fromValue(value: string) {
  return value === "" ? NONE : value;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

export function CompanyFields({
  workspaceId,
  form,
  onChange,
  idPrefix,
  mode = "create",
}: {
  workspaceId: string;
  form: CompanyFormState;
  onChange: (patch: Partial<CompanyFormState>) => void;
  idPrefix: string;
  mode?: "create" | "edit";
}) {
  const { t } = useTranslation();
  const { data: sources = [] } = useCrmSources(workspaceId);
  const { data: segments = [] } = useCrmSegments(workspaceId);
  const { data: cities = [] } = useCrmCompanyCities(
    workspaceId,
    form.state || undefined,
  );

  const isIndividual = form.personType === "pf";
  const currentForm = useRef(form);
  currentForm.current = form;
  const cnpjRequest = useRef(0);
  const cepRequest = useRef(0);
  const [cnpjBusy, setCnpjBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [cepMessage, setCepMessage] = useState("");
  const [cnpjSuggestion, setCnpjSuggestion] =
    useState<Partial<CompanyFormState> | null>(null);
  const [cepSuggestion, setCepSuggestion] =
    useState<Partial<CompanyFormState> | null>(null);

  useEffect(
    () => () => {
      cnpjRequest.current += 1;
      cepRequest.current += 1;
    },
    [],
  );

  function apply(values: Partial<CompanyFormState>, overwrite: boolean) {
    const patch: Partial<CompanyFormState> = {};
    for (const [field, value] of Object.entries(values) as Array<
      [keyof CompanyFormState, string]
    >) {
      if (value && (overwrite || !currentForm.current[field])) {
        // Each returned field is normalized before it reaches this component.
        Object.assign(patch, { [field]: value });
      }
    }
    if (Object.keys(patch).length) onChange(patch);
  }

  function suggestionPanel(
    suggestion: Partial<CompanyFormState>,
    clear: (next: null) => void,
  ) {
    const changes = Object.entries(suggestion).filter(
      ([field, value]) =>
        value && value !== form[field as keyof CompanyFormState],
    );
    return (
      <div className="space-y-2 rounded-md border p-3 text-xs">
        <p className="font-medium">Dados sugeridos para este cadastro</p>
        {changes.length ? (
          <ul className="space-y-1">
            {changes.map(([field, value]) => (
              <li key={field} className="break-words">
                <span className="font-medium">
                  {SUGGESTION_LABELS[field as keyof CompanyFormState] ?? field}:
                </span>{" "}
                {form[field as keyof CompanyFormState] || "(vazio)"} → {value}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nenhuma diferença encontrada.</p>
        )}
        {changes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                apply(suggestion, false);
                clear(null);
              }}
            >
              Preencher campos vazios
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                apply(suggestion, true);
                clear(null);
              }}
            >
              Substituir pelos dados consultados
            </Button>
          </div>
        )}
      </div>
    );
  }

  async function consultCnpj() {
    if (currentForm.current.personType !== "pj") return;
    const number = currentForm.current.taxId.replace(/\D/g, "");
    if (number.length !== 14 || cnpjBusy) return;
    const request = ++cnpjRequest.current;
    setCnpjBusy(true);
    setCnpjMessage("");
    setCnpjSuggestion(null);
    try {
      const result = await lookupCompanyCnpj(workspaceId, number);
      if (
        request !== cnpjRequest.current ||
        currentForm.current.personType !== "pj" ||
        currentForm.current.taxId.replace(/\D/g, "") !== number
      )
        return;
      const data = result.data;
      const fields: Partial<CompanyFormState> = {
        name: data.name,
        legalName: data.legalName,
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.postalCode ? { postalCode: data.postalCode } : {}),
        ...(data.addressLine ? { addressLine: data.addressLine } : {}),
        ...(data.addressNumber ? { addressNumber: data.addressNumber } : {}),
        ...(data.addressComplement
          ? { addressComplement: data.addressComplement }
          : {}),
        ...(data.district ? { district: data.district } : {}),
        ...(data.city ? { city: data.city } : {}),
        ...(data.state && BRAZIL_STATES.includes(data.state as BrazilState)
          ? { state: data.state as BrazilState }
          : {}),
      };
      if (mode === "create") apply(fields, false);
      else setCnpjSuggestion(fields);
      setCnpjMessage(
        `Dados encontrados (${LOOKUP_SOURCE_LABELS[result.source]}${result.stale ? ", consulta anterior" : ""}). ${mode === "edit" ? "Revise antes de aplicar." : "Revise antes de salvar."}`,
      );
    } catch (error) {
      if (request === cnpjRequest.current)
        setCnpjMessage(
          error instanceof Error
            ? error.message
            : "Consulta indisponível. Preencha manualmente.",
        );
    } finally {
      if (request === cnpjRequest.current) setCnpjBusy(false);
    }
  }

  async function consultCep() {
    const number = currentForm.current.postalCode.replace(/\D/g, "");
    if (number.length !== 8 || cepBusy) return;
    const request = ++cepRequest.current;
    setCepBusy(true);
    setCepMessage("");
    setCepSuggestion(null);
    try {
      const result = await lookupCompanyCep(workspaceId, number);
      if (
        request !== cepRequest.current ||
        currentForm.current.postalCode.replace(/\D/g, "") !== number
      )
        return;
      const data = result.data;
      const fields: Partial<CompanyFormState> = {
        ...(data.addressLine ? { addressLine: data.addressLine } : {}),
        ...(data.district ? { district: data.district } : {}),
        ...(data.city ? { city: data.city } : {}),
        ...(data.state && BRAZIL_STATES.includes(data.state as BrazilState)
          ? { state: data.state as BrazilState }
          : {}),
      };
      if (mode === "create") apply(fields, false);
      else setCepSuggestion(fields);
      setCepMessage(
        `Endereço encontrado (${LOOKUP_SOURCE_LABELS[result.source]}${result.stale ? ", consulta anterior" : ""}). ${mode === "edit" ? "Revise antes de aplicar." : "Informe o número e revise antes de salvar."}`,
      );
    } catch (error) {
      if (request === cepRequest.current)
        setCepMessage(
          error instanceof Error
            ? error.message
            : "Consulta indisponível. Preencha manualmente.",
        );
    } finally {
      if (request === cepRequest.current) setCepBusy(false);
    }
  }
  const id = (suffix: string) => `${idPrefix}-${suffix}`;
  const cityListId = id("city-list");

  const selectedSegment = segments.find(
    (segment) => segment.id === form.segmentId,
  );
  const selectedSource = sources.find((source) => source.id === form.sourceId);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <SectionTitle>{t("crm:company.sectionIdentity")}</SectionTitle>

        <div className="space-y-2">
          <Label htmlFor={id("name")}>{t("crm:company.name")}</Label>
          <Input
            id={id("name")}
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            autoFocus
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={id("person-type")}>
              {t("crm:company.personType")}
            </Label>
            <Select
              value={form.personType}
              onValueChange={(value) => {
                if (value === "pj" || value === "pf") {
                  cnpjRequest.current += 1;
                  setCnpjBusy(false);
                  setCnpjMessage("");
                  setCnpjSuggestion(null);
                  onChange({ personType: value });
                }
              }}
            >
              <SelectTrigger id={id("person-type")}>
                <SelectValue>
                  {t(
                    isIndividual
                      ? "crm:company.personTypePf"
                      : "crm:company.personTypePj",
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pj">
                  {t("crm:company.personTypePj")}
                </SelectItem>
                <SelectItem value="pf">
                  {t("crm:company.personTypePf")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={id("tax-id")}>
              {t(isIndividual ? "crm:company.taxIdPf" : "crm:company.taxIdPj")}
            </Label>
            <Input
              id={id("tax-id")}
              value={form.taxId}
              onChange={(event) => {
                cnpjRequest.current += 1;
                setCnpjBusy(false);
                setCnpjSuggestion(null);
                setCnpjMessage("");
                onChange({ taxId: event.target.value });
              }}
              onBlur={() => void consultCnpj()}
              inputMode="numeric"
              placeholder={
                isIndividual ? "000.000.000-00" : "00.000.000/0000-00"
              }
            />
            {!isIndividual && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  cnpjBusy || form.taxId.replace(/\D/g, "").length !== 14
                }
                onClick={() => void consultCnpj()}
              >
                {cnpjBusy ? "Consultando CNPJ…" : "Consultar CNPJ"}
              </Button>
            )}
            {cnpjMessage && !isIndividual && (
              <p role="status" className="text-xs text-muted-foreground">
                {cnpjMessage}
              </p>
            )}
            {cnpjSuggestion &&
              !isIndividual &&
              suggestionPanel(cnpjSuggestion, setCnpjSuggestion)}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={id("legal-name")}>
              {t("crm:company.legalName")}
            </Label>
            <Input
              id={id("legal-name")}
              value={form.legalName}
              onChange={(event) => onChange({ legalName: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("phone")}>{t("crm:company.phone")}</Label>
            <Input
              id={id("phone")}
              value={form.phone}
              onChange={(event) => onChange({ phone: event.target.value })}
            />
          </div>
        </div>

        {isIndividual ? null : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={id("ie")}>
                {t("crm:company.stateRegistration")}
              </Label>
              <Input
                id={id("ie")}
                value={form.stateRegistration}
                onChange={(event) =>
                  onChange({ stateRegistration: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={id("im")}>
                {t("crm:company.municipalRegistration")}
              </Label>
              <Input
                id={id("im")}
                value={form.municipalRegistration}
                onChange={(event) =>
                  onChange({ municipalRegistration: event.target.value })
                }
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={id("domain")}>{t("crm:company.domain")}</Label>
          <Input
            id={id("domain")}
            value={form.domain}
            onChange={(event) => onChange({ domain: event.target.value })}
            placeholder="acme.com.br"
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("crm:company.sectionClassification")}</SectionTitle>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={id("source")}>{t("crm:company.source")}</Label>
            <Select
              value={fromValue(form.sourceId)}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  onChange({ sourceId: toValue(value) });
                }
              }}
            >
              <SelectTrigger id={id("source")}>
                <SelectValue>
                  {selectedSource?.name ?? t("crm:company.noneSelected")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {t("crm:company.noneSelected")}
                </SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={id("segment")}>{t("crm:company.segment")}</Label>
            <Select
              value={fromValue(form.segmentId)}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  onChange({ segmentId: toValue(value) });
                }
              }}
            >
              <SelectTrigger id={id("segment")}>
                <SelectValue>
                  {selectedSegment?.name ?? t("crm:company.noneSelected")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {t("crm:company.noneSelected")}
                </SelectItem>
                {segments.map((segment) => (
                  <SelectItem key={segment.id} value={segment.id}>
                    {segment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={id("status")}>{t("crm:company.status")}</Label>
            <Select
              value={form.status}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  onChange({ status: value as CompanyStatus });
                }
              }}
            >
              <SelectTrigger id={id("status")}>
                <SelectValue>
                  {t(`crm:company.${STATUS_LABEL_KEY[form.status]}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {COMPANY_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`crm:company.${STATUS_LABEL_KEY[status]}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={id("size")}>{t("crm:company.companySize")}</Label>
            <Select
              value={fromValue(form.companySize)}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  onChange({ companySize: toValue(value) as CompanySize | "" });
                }
              }}
            >
              <SelectTrigger id={id("size")}>
                <SelectValue>
                  {form.companySize
                    ? t(`crm:company.${SIZE_LABEL_KEY[form.companySize]}`)
                    : t("crm:company.noneSelected")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {t("crm:company.noneSelected")}
                </SelectItem>
                {COMPANY_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {t(`crm:company.${SIZE_LABEL_KEY[size]}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={id("client-since")}>
              {t("crm:company.clientSince")}
            </Label>
            <Input
              id={id("client-since")}
              type="date"
              value={form.clientSince}
              onChange={(event) =>
                onChange({ clientSince: event.target.value })
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("crm:company.sectionLocation")}</SectionTitle>

        <div className="grid gap-3 sm:grid-cols-[7rem_1fr_9rem]">
          <div className="space-y-2">
            <Label htmlFor={id("state")}>{t("crm:company.state")}</Label>
            <Select
              value={fromValue(form.state)}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  onChange({ state: toValue(value) as BrazilState | "" });
                }
              }}
            >
              <SelectTrigger id={id("state")} className="min-w-0">
                {/* "—" em vez de "Não informado": o campo tem a largura de
                    uma sigla, e o texto longo sairia cortado. */}
                <SelectValue>{form.state || "—"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {t("crm:company.noneSelected")}
                </SelectItem>
                {BRAZIL_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={id("city")}>{t("crm:company.city")}</Label>
            {/* Datalist em vez de tabela de municípios: sugere o que já foi
                digitado no workspace e continua aceitando cidade nova. */}
            <Input
              id={id("city")}
              value={form.city}
              onChange={(event) => onChange({ city: event.target.value })}
              placeholder={t("crm:company.cityPlaceholder")}
              list={cityListId}
            />
            <datalist id={cityListId}>
              {cities.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor={id("postal-code")}>CEP</Label>
            <Input
              id={id("postal-code")}
              value={form.postalCode}
              onChange={(event) => {
                cepRequest.current += 1;
                setCepBusy(false);
                setCepSuggestion(null);
                setCepMessage("");
                onChange({ postalCode: event.target.value });
              }}
              onBlur={() => void consultCep()}
              inputMode="numeric"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                cepBusy || form.postalCode.replace(/\D/g, "").length !== 8
              }
              onClick={() => void consultCep()}
            >
              {cepBusy ? "Consultando CEP…" : "Consultar CEP"}
            </Button>
            {cepMessage && (
              <p role="status" className="text-xs text-muted-foreground">
                {cepMessage}
              </p>
            )}
            {cepSuggestion && suggestionPanel(cepSuggestion, setCepSuggestion)}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_6rem_1fr]">
          <div className="space-y-2">
            <Label htmlFor={id("address-line")}>Logradouro</Label>
            <Input
              id={id("address-line")}
              value={form.addressLine}
              onChange={(event) =>
                onChange({ addressLine: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("address-number")}>Nº</Label>
            <Input
              id={id("address-number")}
              value={form.addressNumber}
              onChange={(event) =>
                onChange({ addressNumber: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("district")}>Bairro</Label>
            <Input
              id={id("district")}
              value={form.district}
              onChange={(event) => onChange({ district: event.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={id("address-complement")}>Complemento</Label>
          <Input
            id={id("address-complement")}
            value={form.addressComplement}
            onChange={(event) =>
              onChange({ addressComplement: event.target.value })
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>{t("crm:company.sectionBilling")}</SectionTitle>

        <div className="space-y-2">
          <Label htmlFor={id("billing-email")}>
            {t("crm:company.billingEmail")}
          </Label>
          <Input
            id={id("billing-email")}
            type="email"
            value={form.billingEmail}
            onChange={(event) => onChange({ billingEmail: event.target.value })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={id("terms")}>{t("crm:company.paymentTerms")}</Label>
            <Select
              value={fromValue(form.paymentTerms)}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  onChange({
                    paymentTerms: toValue(value) as PaymentTerm | "",
                  });
                }
              }}
            >
              <SelectTrigger id={id("terms")}>
                <SelectValue>
                  {form.paymentTerms
                    ? t(`crm:company.${TERMS_LABEL_KEY[form.paymentTerms]}`)
                    : t("crm:company.noneSelected")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {t("crm:company.noneSelected")}
                </SelectItem>
                {PAYMENT_TERMS.map((term) => (
                  <SelectItem key={term} value={term}>
                    {t(`crm:company.${TERMS_LABEL_KEY[term]}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={id("billing-day")}>
              {t("crm:company.billingDay")}
            </Label>
            <Input
              id={id("billing-day")}
              type="number"
              min={1}
              max={31}
              value={form.billingDay}
              onChange={(event) => onChange({ billingDay: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={id("method")}>
              {t("crm:company.paymentMethod")}
            </Label>
            <Select
              value={fromValue(form.paymentMethod)}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  onChange({
                    paymentMethod: toValue(value) as PaymentMethod | "",
                  });
                }
              }}
            >
              <SelectTrigger id={id("method")}>
                <SelectValue>
                  {form.paymentMethod
                    ? t(`crm:company.${METHOD_LABEL_KEY[form.paymentMethod]}`)
                    : t("crm:company.noneSelected")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {t("crm:company.noneSelected")}
                </SelectItem>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {t(`crm:company.${METHOD_LABEL_KEY[method]}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Só o que vai para a API: campo vazio vira `null`, não string vazia. */
export function toCompanyPayload(form: CompanyFormState) {
  const text = (value: string) => (value.trim() ? value.trim() : null);

  return {
    name: form.name.trim(),
    personType: form.personType,
    taxId: text(form.taxId),
    legalName: text(form.legalName),
    stateRegistration: text(form.stateRegistration),
    municipalRegistration: text(form.municipalRegistration),
    domain: text(form.domain),
    phone: text(form.phone),
    segmentId: form.segmentId || null,
    sourceId: form.sourceId || null,
    companySize: form.companySize || null,
    status: form.status,
    clientSince: form.clientSince
      ? new Date(`${form.clientSince}T12:00:00`).toISOString()
      : null,
    state: form.state || null,
    city: text(form.city),
    postalCode: text(form.postalCode),
    addressLine: text(form.addressLine),
    addressNumber: text(form.addressNumber),
    addressComplement: text(form.addressComplement),
    district: text(form.district),
    billingEmail: text(form.billingEmail),
    paymentTerms: form.paymentTerms || null,
    billingDay: form.billingDay ? Number(form.billingDay) : null,
    paymentMethod: form.paymentMethod || null,
  };
}
