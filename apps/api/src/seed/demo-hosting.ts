import { saveHosting } from "../crm/hosting/controllers/hosting";
import { type Ctx, civilFromNow } from "./demo-context";
import type { DemoCrm } from "./demo-crm";

/** Hospedagem própria, de terceiros (com renovações em várias janelas) e sem. */
export async function seedHosting(ctx: Ctx, crm: DemoCrm) {
  const scope = {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    visibility: "all" as const,
  };
  const host = crm.services.HOST?.id;
  const plan = [
    {
      company: 0,
      mode: "own" as const,
      provider: "Host Nerd",
      renews: civilFromNow(200),
    },
    {
      company: 1,
      mode: "third_party" as const,
      provider: "Hostgator",
      renews: civilFromNow(-6),
      domain: "clinicavidaplena.com.br",
    },
    {
      company: 2,
      mode: "third_party" as const,
      provider: "Locaweb",
      renews: civilFromNow(12),
      domain: "metalurgicaferraco.com.br",
    },
    {
      company: 3,
      mode: "third_party" as const,
      provider: "GoDaddy",
      renews: civilFromNow(28),
      domain: "escolaaprendermais.com.br",
    },
    {
      company: 4,
      mode: "third_party" as const,
      provider: "Hostinger",
      renews: civilFromNow(55),
      domain: "vinicolavaledourado.com.br",
    },
    {
      company: 5,
      mode: "third_party" as const,
      provider: "UOL Host",
      renews: null,
      domain: "autopecasrodomar.com.br",
    },
    {
      company: 6,
      mode: "own" as const,
      provider: "Host Nerd",
      renews: civilFromNow(90),
    },
    { company: 7, mode: "none" as const, provider: "", renews: null },
  ];
  let count = 0;
  for (const item of plan) {
    const company = crm.companies[item.company];
    if (!company) continue;
    await saveHosting(scope, company.id, {
      mode: item.mode,
      provider: item.provider,
      domain: "domain" in item && item.domain ? item.domain : "",
      renewsOn: item.renews,
      leadDays: 30,
      contactId: company.contactId || null,
      emailAllowed: item.mode === "third_party",
      whatsappAllowed: item.mode === "third_party",
      notes: "Cadastro de demonstração",
      serviceIds: item.mode === "own" && host ? [host] : [],
      version: 0,
    });
    count++;
  }
  return count;
}
