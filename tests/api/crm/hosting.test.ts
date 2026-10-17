import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attention,
  civilDay,
  emptyHosting,
  type PortfolioCompany,
  phoneNumber,
  portfolioReport,
  whatsappUrl,
} from "../../../apps/api/src/crm/hosting/model";

const company = (patch: Partial<PortfolioCompany> = {}): PortfolioCompany => ({
  id: "c",
  name: "Empresa",
  status: "active",
  ownerId: "u",
  ownerName: "Vendedor",
  createdAt: "2026-07-01T12:00:00Z",
  archivedAt: null,
  version: 1,
  hosting: { ...emptyHosting, mode: "third_party", renewsOn: "2026-10-20" },
  revisions: [
    {
      sequence: 1,
      createdAt: "2026-10-01T12:00:00Z",
      snapshot: {
        ...emptyHosting,
        mode: "third_party",
        renewsOn: "2026-10-20",
        services: [{ id: "s", name: "Site" }],
      },
    },
  ],
  notices: [],
  ...patch,
});
const filters = { from: "2026-10-01", to: "2026-10-17" };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("Carteira e hospedagem", () => {
  it("usa o dia civil do Brasil nos eventos de madrugada UTC", () =>
    expect(civilDay("2026-10-17T01:00:00Z")).toBe("2026-10-16"));
  it("normaliza telefone internacional e cria texto codificado sem alterar o destinatário", () => {
    expect(phoneNumber("+55 (15) 99999-9999")).toBe("5515999999999");
    expect(whatsappUrl("5515999999999", "Olá & tudo bem?")).toBe(
      "https://wa.me/5515999999999?text=Ol%C3%A1%20%26%20tudo%20bem%3F",
    );
    expect(phoneNumber("123")).toBeNull();
  });
  it("sinaliza antecedência e mantém vencidos na lista de atenção", () => {
    expect(
      attention(
        {
          ...emptyHosting,
          mode: "third_party",
          renewsOn: "2026-11-17",
          leadDays: 30,
        },
        "2026-10-17",
      ),
    ).toBe("scheduled");
    expect(
      attention(
        {
          ...emptyHosting,
          mode: "third_party",
          renewsOn: "2026-11-16",
          leadDays: 30,
        },
        "2026-10-17",
      ),
    ).toBe("due");
    expect(
      attention(
        { ...emptyHosting, mode: "third_party", renewsOn: "2026-01-01" },
        "2026-10-17",
      ),
    ).toBe("due");
  });
  it("separa ausência de data e hospedagem própria dos alertas de terceiros", () => {
    expect(attention({ ...emptyHosting, mode: "third_party" })).toBe("no_date");
    expect(
      attention({ ...emptyHosting, mode: "own", renewsOn: "2020-01-01" }),
    ).toBe("none");
  });
  it("reconstitui classificação pela última versão conhecida na referência", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
    const c = company();
    c.revisions.push({
      sequence: 2,
      createdAt: "2026-10-16T12:00:00Z",
      snapshot: { ...emptyHosting, mode: "own" },
    });
    const r = portfolioReport([c], filters);
    expect(r.current.own).toBe(1);
    expect(r.current.thirdParty).toBe(0);
    expect(r.previous.historyAvailable).toBe(false);
  });
  it("não presume a situação histórica antes do primeiro cadastro", () => {
    const r = portfolioReport([company()], {
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(r.current.thirdParty).toBe(0);
    expect(r.current.unknown).toBe(1);
    expect(r.current.historyAvailable).toBe(false);
  });
  it("filtra as flags de serviço registradas na referência", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
    expect(
      portfolioReport([company()], { ...filters, serviceId: "s" }).total,
    ).toBe(1);
    expect(
      portfolioReport([company()], { ...filters, serviceId: "other" }).total,
    ).toBe(0);
  });
  it("não conta WhatsApp preparado como envio confirmado", () => {
    const c = company({
      notices: [
        {
          id: "n",
          channel: "whatsapp",
          status: "prepared",
          createdAt: "2026-10-10T12:00:00Z",
          confirmedAt: null,
        },
      ],
    });
    const r = portfolioReport([c], filters);
    expect(r.current.whatsappPrepared).toBe(1);
    expect(r.current.whatsappConfirmed).toBe(0);
    expect(r.current.emailsAccepted).toBe(0);
  });
  it("usa a data da confirmação manual, inclusive quando a preparação é anterior", () => {
    const c = company({
      notices: [
        {
          id: "n",
          channel: "whatsapp",
          status: "confirmed",
          createdAt: "2026-09-01T12:00:00Z",
          confirmedAt: "2026-10-10T12:00:00Z",
        },
      ],
    });
    expect(portfolioReport([c], filters).current.whatsappConfirmed).toBe(1);
  });
  it("não mostra empresas arquivadas na carteira atual", () => {
    const c = company({ archivedAt: "2026-10-10T12:00:00Z" });
    const r = portfolioReport([c], filters);
    expect(r.total).toBe(0);
    expect(r.current.companies).toBe(0);
  });
  it("limita gráficos ao dia atual quando o filtro termina no futuro", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
    const r = portfolioReport([company()], { ...filters, to: "2027-01-31" });
    expect(r.months.map((m) => m.month)).toEqual(["2026-10"]);
    expect(r.referenceDate).toBe("2026-10-17");
  });
});
