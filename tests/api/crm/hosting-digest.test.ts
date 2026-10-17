import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDigestEmail,
  type DigestCandidate,
  itemKey,
  localHour,
  nextNotice,
  normalizeMarks,
  planDeliveries,
  planDigest,
} from "../../../apps/api/src/crm/hosting/digest/model";
import {
  emptyHosting,
  type PortfolioCompany,
  portfolioReport,
} from "../../../apps/api/src/crm/hosting/model";

const candidate = (
  companyId: string,
  renewsOn: string,
  patch: Partial<DigestCandidate> = {},
): DigestCandidate => ({
  companyId,
  renewsOn,
  companyName: `Empresa ${companyId}`,
  provider: "Provedor X",
  domain: `${companyId}.com.br`,
  ownerUserId: "u1",
  ownerName: "Vendedor",
  contactName: "Contato",
  contactEmail: "contato@example.test",
  contactPhone: "+55 15 99999-9999",
  ...patch,
});
const REF = "2026-10-17";

describe("Aviso interno de renovação: planejamento", () => {
  it("lista a empresa quando faltam exatamente 30 dias", () => {
    const plan = planDigest(
      [candidate("a", "2026-11-16")],
      new Set(),
      [30, 15],
      REF,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      markDays: 30,
      listed: true,
      daysRemaining: 30,
    });
  });
  it("não lista com 31 dias nem renovações já vencidas", () => {
    expect(
      planDigest([candidate("a", "2026-11-17")], new Set(), [30, 15], REF),
    ).toEqual([]);
    expect(
      planDigest([candidate("a", "2026-10-16")], new Set(), [30, 15], REF),
    ).toEqual([]);
  });
  it("lista a marca de 15 dias depois da de 30, uma vez cada", () => {
    const sent30 = new Set([itemKey("a", "2026-11-01", 30)]);
    const plan = planDigest(
      [candidate("a", "2026-11-01")],
      sent30,
      [30, 15],
      REF,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ markDays: 15, listed: true });
    const both = new Set([
      itemKey("a", "2026-11-01", 30),
      itemKey("a", "2026-11-01", 15),
    ]);
    expect(
      planDigest([candidate("a", "2026-11-01")], both, [30, 15], REF),
    ).toEqual([]);
  });
  it("cadastro tardio lista só a marca mais próxima e registra a anterior sem listar", () => {
    const plan = planDigest(
      [candidate("a", "2026-10-27")],
      new Set(),
      [30, 15],
      REF,
    );
    expect(plan.map((p) => [p.markDays, p.listed])).toEqual([
      [30, false],
      [15, true],
    ]);
  });
  it("nova data de renovação abre um novo ciclo", () => {
    const old = new Set([itemKey("a", "2026-11-01", 30)]);
    const plan = planDigest([candidate("a", "2026-11-16")], old, [30, 15], REF);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.markDays).toBe(30);
  });
  it("ordena e deduplica as marcas configuradas", () => {
    expect(normalizeMarks([15, 30, 15, 60])).toEqual([60, 30, 15]);
  });
  it("calcula o próximo aviso previsto", () => {
    expect(nextNotice("2026-12-01", [30, 15], new Set(), REF)).toEqual({
      markDays: 30,
      date: "2026-11-01",
    });
    expect(nextNotice("2026-12-01", [30, 15], new Set([30]), REF)).toEqual({
      markDays: 15,
      date: "2026-11-16",
    });
    expect(
      nextNotice("2026-12-01", [30, 15], new Set([30, 15]), REF),
    ).toBeNull();
    expect(nextNotice("2026-10-27", [30, 15], new Set(), REF)).toEqual({
      markDays: 15,
      date: REF,
    });
    expect(nextNotice(null, [30, 15], new Set(), REF)).toBeNull();
    expect(nextNotice("2026-10-01", [30, 15], new Set(), REF)).toBeNull();
  });
});

describe("Aviso interno de renovação: e-mail e destinatários", () => {
  const line = (
    c: DigestCandidate,
    markDays: number,
    daysRemaining: number,
  ) => {
    const { companyId, renewsOn, ...snapshot } = c;
    return { companyId, markDays, renewsOn, daysRemaining, snapshot };
  };
  it("monta a lista por faixa, com provedor, responsável, contato e link", () => {
    const { subject, text } = buildDigestEmail(
      [
        line(candidate("b", "2026-11-01"), 15, 15),
        line(candidate("a", "2026-11-16"), 30, 30),
      ],
      { clientUrl: "https://app.example.test/", workspaceId: "w1" },
    );
    expect(subject).toBe("Hospedagens de terceiros a renovar: 2 clientes");
    expect(text.indexOf("RENOVAM EM ATÉ 30 DIAS")).toBeLessThan(
      text.indexOf("RENOVAM EM ATÉ 15 DIAS"),
    );
    expect(text).toContain("Provedor atual: Provedor X");
    expect(text).toContain("Renovação: 16/11/2026 (em 30 dias)");
    expect(text).toContain("Responsável: Vendedor");
    expect(text).toContain("Contato: Contato · contato@example.test");
    expect(text).toContain(
      "https://app.example.test/dashboard/workspace/w1/crm/companies/a",
    );
    expect(text).toContain("Nenhum aviso é enviado aos clientes");
  });
  it("não deixa dados do cadastro quebrarem linhas nem entrarem no assunto", () => {
    const { subject, text } = buildDigestEmail(
      [
        line(
          candidate("a", "2026-11-16", {
            companyName: "Empresa\r\nBcc: x@example.test",
            provider: "",
          }),
          30,
          30,
        ),
      ],
      { clientUrl: "https://app.example.test", workspaceId: "w1" },
    );
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).not.toContain("Empresa");
    expect(text).toContain("- Empresa Bcc: x@example.test");
    expect(text).toContain("Provedor atual: não informado");
  });
  it("marcados recebem tudo; responsáveis só as próprias empresas", () => {
    const deliveries = planDeliveries({
      listed: [
        { companyId: "a", ownerUserId: "u1" },
        { companyId: "b", ownerUserId: "u2" },
      ],
      recipients: [
        { userId: "boss", email: "boss@example.test", name: "Chefe" },
      ],
      owners: [
        { userId: "u1", email: "u1@example.test", name: "U1" },
        { userId: "u2", email: "u2@example.test", name: "U2" },
        { userId: "u3", email: "u3@example.test", name: "U3" },
      ],
      includeOwner: true,
    });
    const by = Object.fromEntries(
      deliveries.map((d) => [d.userId, d.companyIds]),
    );
    expect(by.boss).toEqual(["a", "b"]);
    expect(by.u1).toEqual(["a"]);
    expect(by.u2).toEqual(["b"]);
    expect(by.u3).toBeUndefined();
  });
  it("sem a opção de responsável, só os marcados recebem", () => {
    const deliveries = planDeliveries({
      listed: [{ companyId: "a", ownerUserId: "u1" }],
      recipients: [
        { userId: "boss", email: "boss@example.test", name: "Chefe" },
      ],
      owners: [{ userId: "u1", email: "u1@example.test", name: "U1" }],
      includeOwner: false,
    });
    expect(deliveries.map((d) => d.userId)).toEqual(["boss"]);
  });
  it("só envia a partir das 8h de São Paulo", () => {
    expect(localHour(new Date("2026-10-17T10:59:00Z"))).toBe(7);
    expect(localHour(new Date("2026-10-17T11:00:00Z"))).toBe(8);
    expect(localHour(new Date("2026-10-17T02:30:00Z"))).toBe(23);
  });
});

describe("Lista de terceiros: filtros e avisos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  const company = (
    id: string,
    provider: string,
    renewsOn: string | null,
    patch: Partial<PortfolioCompany> = {},
  ): PortfolioCompany => ({
    id,
    name: `Empresa ${id}`,
    status: "active",
    ownerId: "u",
    ownerName: "Vendedor",
    createdAt: "2026-07-01T12:00:00Z",
    archivedAt: null,
    version: 1,
    hosting: { ...emptyHosting, mode: "third_party", provider, renewsOn },
    revisions: [
      {
        sequence: 1,
        createdAt: "2026-10-01T12:00:00Z",
        snapshot: { ...emptyHosting, mode: "third_party", provider, renewsOn },
      },
    ],
    notices: [],
    ...patch,
  });
  const filters = { from: "2026-10-01", to: "2026-10-17", mode: "third_party" };
  it("filtra por provedor sem diferenciar maiúsculas", () => {
    const list = [
      company("a", "Hostgator", "2026-11-01"),
      company("b", "Locaweb", "2026-11-01"),
    ];
    const r = portfolioReport(list, { ...filters, provider: "hostgator" });
    expect(r.rows.map((x) => x.id)).toEqual(["a"]);
  });
  it("filtra por faixa de prazo e por vencidas", () => {
    const list = [
      company("d10", "P", "2026-10-27"),
      company("d25", "P", "2026-11-11"),
      company("d70", "P", "2026-12-26"),
      company("old", "P", "2026-10-01"),
      company("none", "P", null),
    ];
    const ids = (window: "overdue" | "15" | "30" | "60" | "90") =>
      portfolioReport(list, { ...filters, window }).rows.map((x) => x.id);
    expect(ids("15")).toEqual(["d10"]);
    expect(ids("30")).toEqual(["d10", "d25"]);
    expect(ids("90")).toEqual(["d10", "d25", "d70"]);
    expect(ids("overdue")).toEqual(["old"]);
  });
  it("mostra próximo aviso e último envio por empresa", () => {
    const sent = company("a", "P", "2026-11-16", {
      digest: [
        {
          renewsOn: "2026-11-16",
          markDays: 30,
          listed: true,
          runStatus: "sent",
          createdAt: "2026-10-17T12:00:00Z",
        },
      ],
    });
    const fresh = company("b", "P", "2026-12-31");
    const r = portfolioReport([sent, fresh], filters, { marks: [30, 15] });
    const a = r.rows.find((x) => x.id === "a");
    const b = r.rows.find((x) => x.id === "b");
    expect(a?.lastNotice).toMatchObject({ markDays: 30, status: "sent" });
    expect(a?.nextNotice).toEqual({ markDays: 15, date: "2026-11-01" });
    expect(b?.lastNotice).toBeNull();
    expect(b?.nextNotice).toEqual({ markDays: 30, date: "2026-12-01" });
  });
  it("a atenção segue a maior marca configurada", () => {
    const list = [company("a", "P", "2026-12-10")];
    expect(
      portfolioReport(list, filters, { marks: [60, 30] }).rows[0]?.attention,
    ).toBe("due");
    expect(
      portfolioReport(list, filters, { marks: [30, 15] }).rows[0]?.attention,
    ).toBe("scheduled");
  });
});
