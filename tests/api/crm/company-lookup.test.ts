import { describe, expect, it, vi } from "vitest";
import {
  createCompanyLookup,
  LookupNotFoundError,
} from "../../../apps/api/src/crm/company/lookup";

const cnpj = "19131243000197";
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("company lookup", () => {
  it("uses the second CNPJ provider and caches the normalized result", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes("brasilapi")
        ? reply({ message: "unavailable" }, 503)
        : reply({
            razao_social: "OPEN KNOWLEDGE BRASIL",
            estabelecimento: {
              cnpj,
              nome_fantasia: "Conhecimento Livre",
              cep: "01311902",
              logradouro: "Paulista",
              numero: "37",
              bairro: "Bela Vista",
              cidade: { nome: "São Paulo" },
              estado: { sigla: "SP" },
            },
          }),
    );
    const lookup = createCompanyLookup(fetcher as unknown as typeof fetch);
    const first = await lookup.cnpj(cnpj);
    expect(first).toMatchObject({
      source: "cnpjws",
      stale: false,
      data: {
        name: "Conhecimento Livre",
        legalName: "OPEN KNOWLEDGE BRASIL",
        addressLine: "Paulista",
        state: "SP",
      },
    });
    expect(await lookup.cnpj(cnpj)).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("tries BrasilAPI CEP v2 if ViaCEP does not find the CEP", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes("viacep")
        ? reply({ erro: true })
        : reply({
            cep: "01001000",
            street: "Praça da Sé",
            neighborhood: "Sé",
            city: "São Paulo",
            state: "SP",
          }),
    );
    const lookup = createCompanyLookup(fetcher as unknown as typeof fetch);
    expect(await lookup.cep("01001-000")).toMatchObject({
      source: "brasilapi-cep",
      data: {
        addressLine: "Praça da Sé",
        city: "São Paulo",
        addressNumber: null,
      },
    });
  });

  it("distinguishes an unknown CEP from a temporary provider failure", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes("viacep")
        ? reply({ erro: true })
        : reply({ message: "not found" }, 404),
    );
    const lookup = createCompanyLookup(fetcher as unknown as typeof fetch);
    await expect(lookup.cep("99999999")).rejects.toBeInstanceOf(
      LookupNotFoundError,
    );
  });

  it("does not apply a result for another document and rejects invalid input locally", async () => {
    const fetcher = vi.fn(async () =>
      reply({ cnpj: "00000000000191", razao_social: "Wrong company" }),
    );
    const lookup = createCompanyLookup(fetcher as unknown as typeof fetch);
    expect(() => lookup.cnpj("00000000000000")).toThrow("CNPJ inválido");
    expect(() => lookup.cep("123")).toThrow("CEP inválido");
    expect(fetcher).not.toHaveBeenCalled();
    expect(await lookup.cnpj(cnpj)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("limits calls to the public fallback and can return a marked stale cache", async () => {
    let clock = 0;
    let available = true;
    const fetcher = vi.fn(async (url: string) =>
      available && url.includes("brasilapi")
        ? reply({ cnpj, razao_social: "Empresa A" })
        : reply({ message: "unavailable" }, 503),
    );
    const lookup = createCompanyLookup(
      fetcher as unknown as typeof fetch,
      () => clock,
    );
    expect((await lookup.cnpj(cnpj))?.stale).toBe(false);
    clock = 24 * 60 * 60_000 + 1;
    available = false;
    expect(await lookup.cnpj(cnpj)).toMatchObject({
      stale: true,
      data: { legalName: "Empresa A" },
    });
    await lookup.cnpj(cnpj);
    await lookup.cnpj(cnpj);
    await lookup.cnpj(cnpj);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes("cnpj.ws")),
    ).toHaveLength(3);
  });
});
