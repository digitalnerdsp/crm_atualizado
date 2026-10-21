import { isValidCnpj } from "../shared/tax-id";

type Address = {
  postalCode: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

type CompanySuggestion = Address & {
  name: string;
  legalName: string;
  phone: string | null;
};

type Provider = "brasilapi" | "cnpjws" | "viacep" | "brasilapi-cep";
export type LookupResult<T> = { data: T; source: Provider; stale: boolean };
export class LookupNotFoundError extends Error {}

const digits = (value: string) => value.replace(/\D/g, "");
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const state = (value: unknown) => {
  const code = text(value)?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) && code !== "EX" ? code : null;
};
const postalCode = (value: unknown) => {
  const code = digits(text(value) ?? "");
  return code.length === 8 ? code : null;
};

function brasilApiCompany(
  value: unknown,
  requested: string,
): CompanySuggestion | null {
  const row = object(value);
  if (digits(text(row.cnpj) ?? "") !== requested) return null;
  const legalName = text(row.razao_social);
  if (!legalName) return null;
  return {
    name: text(row.nome_fantasia) ?? legalName,
    legalName,
    phone: text(row.ddd_telefone_1),
    postalCode: postalCode(row.cep),
    addressLine: text(row.logradouro),
    addressNumber: text(row.numero),
    addressComplement: text(row.complemento),
    district: text(row.bairro),
    city: text(row.municipio),
    state: state(row.uf),
  };
}

function cnpjWsCompany(
  value: unknown,
  requested: string,
): CompanySuggestion | null {
  const row = object(value);
  const branch = object(row.estabelecimento);
  if (digits(text(branch.cnpj) ?? "") !== requested) return null;
  const legalName = text(row.razao_social);
  if (!legalName) return null;
  const city = object(branch.cidade);
  const uf = object(branch.estado);
  const phone = [text(branch.ddd1), text(branch.telefone1)]
    .filter(Boolean)
    .join("");
  return {
    name: text(branch.nome_fantasia) ?? legalName,
    legalName,
    phone: phone || null,
    postalCode: postalCode(branch.cep),
    addressLine: text(branch.logradouro),
    addressNumber: text(branch.numero),
    addressComplement: text(branch.complemento),
    district: text(branch.bairro),
    city: text(city.nome),
    state: state(uf.sigla),
  };
}

function viaCep(value: unknown, requested: string): Address | null {
  const row = object(value);
  if (row.erro || postalCode(row.cep) !== requested) return null;
  return {
    postalCode: requested,
    addressLine: text(row.logradouro),
    addressNumber: null,
    addressComplement: null, // O complemento do CEP pode ser uma observação da rua.
    district: text(row.bairro),
    city: text(row.localidade),
    state: state(row.uf),
  };
}

function brasilApiCep(value: unknown, requested: string): Address | null {
  const row = object(value);
  if (postalCode(row.cep) !== requested) return null;
  return {
    postalCode: requested,
    addressLine: text(row.street),
    addressNumber: null,
    addressComplement: null,
    district: text(row.neighborhood),
    city: text(row.city),
    state: state(row.state),
  };
}

type CacheEntry<T> = {
  value: LookupResult<T>;
  freshUntil: number;
  staleUntil: number;
};
type Fetcher = typeof fetch;

/** Isolated per API process; cache and fallback throttle do not contain user data. */
export function createCompanyLookup(fetcher: Fetcher = fetch, now = Date.now) {
  const cache = new Map<string, CacheEntry<CompanySuggestion | Address>>();
  const pending = new Map<
    string,
    Promise<LookupResult<CompanySuggestion | Address> | null>
  >();
  const fallbackCalls: number[] = [];
  let fallbackBlockedUntil = 0;

  async function getJson(url: string) {
    try {
      const response = await fetcher(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(3500),
      });
      if (response.status === 429 && url.includes("publica.cnpj.ws")) {
        fallbackBlockedUntil = now() + 60_000;
      }
      if (!response.ok)
        return { body: null, notFound: response.status === 404 };
      const body = await response.text();
      if (body.length > 300_000) return { body: null, notFound: false };
      return { body: JSON.parse(body) as unknown, notFound: false };
    } catch {
      return { body: null, notFound: false };
    }
  }

  function allowCnpjFallback() {
    const time = now();
    if (time < fallbackBlockedUntil) return false;
    while (fallbackCalls.length && fallbackCalls[0] <= time - 60_000) {
      fallbackCalls.shift();
    }
    if (fallbackCalls.length >= 3) return false;
    fallbackCalls.push(time);
    return true;
  }

  async function lookup<T extends CompanySuggestion | Address>(
    key: string,
    freshMs: number,
    providers: Array<{
      source: Provider;
      url: string;
      map: (value: unknown) => T | null;
      limited?: boolean;
    }>,
  ): Promise<LookupResult<T> | null> {
    const existing = cache.get(key) as CacheEntry<T> | undefined;
    if (existing && existing.freshUntil > now()) return existing.value;
    const inFlight = pending.get(key) as
      | Promise<LookupResult<T> | null>
      | undefined;
    if (inFlight) return inFlight;
    const promise = (async () => {
      let missing = 0;
      for (const provider of providers) {
        if (provider.limited && !allowCnpjFallback()) continue;
        const response = await getJson(provider.url);
        if (
          response.notFound ||
          (provider.source === "viacep" &&
            (object(response.body).erro === true ||
              object(response.body).erro === "true"))
        )
          missing += 1;
        const data =
          response.body === null ? null : provider.map(response.body);
        if (!data) continue;
        const value = { data, source: provider.source, stale: false };
        // Keep the cache bounded when many distinct companies are entered.
        if (cache.size >= 500) cache.delete(cache.keys().next().value ?? "");
        cache.set(key, {
          value,
          freshUntil: now() + freshMs,
          staleUntil: now() + freshMs + 7 * 24 * 60 * 60_000,
        });
        return value;
      }
      if (existing && existing.staleUntil > now()) {
        return { ...existing.value, stale: true };
      }
      if (missing === providers.length) {
        throw new LookupNotFoundError("Nenhum provedor encontrou o documento");
      }
      return null;
    })();
    pending.set(key, promise);
    try {
      return await promise;
    } finally {
      pending.delete(key);
    }
  }

  return {
    cnpj(value: string) {
      const cnpj = digits(value);
      if (!isValidCnpj(cnpj)) throw new Error("CNPJ inválido");
      return lookup(`cnpj:${cnpj}`, 24 * 60 * 60_000, [
        {
          source: "brasilapi",
          url: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
          map: (data) => brasilApiCompany(data, cnpj),
        },
        {
          source: "cnpjws",
          url: `https://publica.cnpj.ws/cnpj/${cnpj}`,
          map: (data) => cnpjWsCompany(data, cnpj),
          limited: true,
        },
      ]);
    },
    cep(value: string) {
      const cep = digits(value);
      if (cep.length !== 8) throw new Error("CEP inválido");
      return lookup(`cep:${cep}`, 7 * 24 * 60 * 60_000, [
        {
          source: "viacep",
          url: `https://viacep.com.br/ws/${cep}/json/`,
          map: (data) => viaCep(data, cep),
        },
        {
          source: "brasilapi-cep",
          url: `https://brasilapi.com.br/api/cep/v2/${cep}`,
          map: (data) => brasilApiCep(data, cep),
        },
      ]);
    },
  };
}

export const companyLookup = createCompanyLookup();
