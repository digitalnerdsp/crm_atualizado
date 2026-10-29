import { and, eq, isNotNull } from "drizzle-orm";
import db, { schema } from "../database";
import { createEntries, settleEntry } from "../finance/controllers/finance";
import {
  issueCommission,
  saveRule,
  saveSettings,
} from "../finance/performance/controller";
import {
  configureBilling,
  generateContract,
} from "../finance/recurrence/billing";
import {
  calculate,
  saveProfile,
  saveSimulation,
} from "../finance/taxes/controllers/taxes";
import { type Ctx, civil, civilFromNow } from "./demo-context";
import type { DemoCrm } from "./demo-crm";

/** Regras de comissão, cobrança de contratos, comissões geradas e impostos. */
export async function seedFinanceExtra(
  ctx: Ctx,
  crm: DemoCrm,
  categories: Record<string, string>,
) {
  const { workspaceId, userId } = ctx;
  const today = civil(new Date());
  const notes: string[] = [];

  // Regras de comissão (valem de hoje em diante) e presunção do resultado
  const rules: Array<[string, number, number, number | null]> = [
    ["TRAF", 500, 300, 6],
    ["SITE", 800, 0, null],
    ["LP", 700, 0, null],
    ["AGENTE", 600, 400, null],
  ];
  for (const [code, rate, recurring, months] of rules) {
    const service = crm.services[code];
    if (!service) continue;
    await saveRule(workspaceId, userId, {
      serviceId: service.id,
      effectiveDate: today,
      rateBps: rate,
      recurringRateBps: recurring,
      recurringMonths: months,
      version: 0,
    });
  }
  const [current] = await db
    .select({ version: schema.financeResultSettingsTable.version })
    .from(schema.financeResultSettingsTable)
    .where(eq(schema.financeResultSettingsTable.workspaceId, workspaceId))
    .limit(1);
  await saveSettings(workspaceId, userId, {
    presumptionBps: 3200,
    version: current?.version ?? 0,
  });

  // Cobrança automática dos contratos ativos
  const contracts = await db
    .select()
    .from(schema.crmContractTable)
    .where(
      and(
        eq(schema.crmContractTable.workspaceId, workspaceId),
        eq(schema.crmContractTable.status, "active"),
      ),
    );
  let generated = 0;
  for (const contract of contracts) {
    try {
      await configureBilling(workspaceId, contract.id, userId, {
        enabled: true,
        startsOn: today,
        horizonMonths: 3,
        prorateFinal: false,
        categoryId: categories["Serviços recorrentes"] ?? null,
        version: 0,
      });
      await generateContract(workspaceId, contract.id, userId);
      generated++;
    } catch (error) {
      notes.push(`contrato ${contract.id}: ${(error as Error).message}`);
    }
  }
  // Ciclos já vencidos: quase todos pagos; o último de dois contratos fica em aberto
  const cycles = await db
    .select()
    .from(schema.financeEntryTable)
    .where(
      and(
        eq(schema.financeEntryTable.workspaceId, workspaceId),
        isNotNull(schema.financeEntryTable.contractId),
      ),
    );
  const byContract = new Map<string, typeof cycles>();
  for (const entry of cycles) {
    const key = entry.contractId as string;
    byContract.set(key, [...(byContract.get(key) ?? []), entry]);
  }
  let n = 0;
  let paidCycles = 0;
  for (const [index, [, list]] of [...byContract.entries()].entries()) {
    const past = list
      .filter((e) => e.dueDate < today && !e.cancelledAt)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    for (const [position, entry] of past.entries()) {
      const keepOpen = index < 2 && position === past.length - 1;
      if (keepOpen) continue;
      n++;
      await settleEntry(workspaceId, userId, entry.id, {
        requestId: `demo-seed-cycle:${n}`,
        date: entry.dueDate,
        principalCents: entry.amountCents,
        discountCents: 0,
        interestCents: 0,
        fineCents: 0,
        notes: "Pagamento de mensalidade (demonstração)",
      });
      paidCycles++;
    }
  }

  // Comissões: cobranças de hoje com serviço e vendedor, baixadas e geradas a pagar
  let commissions = 0;
  for (const [index, code] of (["TRAF", "SITE", "AGENTE"] as const).entries()) {
    const service = crm.services[code];
    const company = crm.companies[index];
    if (!service || !company) continue;
    const requestId = `demo-seed-commission:${code}`;
    await createEntries(workspaceId, userId, {
      requestId,
      description: `Fechamento ${code} — comissionável`,
      direction: "receivable",
      kind: "operating",
      amountCents: service.priceCents * (code === "SITE" ? 1 : 2),
      competenceDate: today,
      dueDate: today,
      categoryId: categories["Projetos pontuais"] ?? null,
      partyId: null,
      partyName: company.name,
      companyId: company.id,
      serviceId: service.id,
      sellerId: userId,
      paymentMethod: "pix",
      notes: "Cobrança comissionável de demonstração",
      count: 1,
      intervalMonths: 1,
      schedule: "installments",
    });
    const [entry] = await db
      .select()
      .from(schema.financeEntryTable)
      .where(
        and(
          eq(schema.financeEntryTable.workspaceId, workspaceId),
          eq(schema.financeEntryTable.seriesId, requestId),
        ),
      );
    if (!entry) continue;
    n++;
    await settleEntry(workspaceId, userId, entry.id, {
      requestId: `demo-seed-cycle:${n}`,
      date: today,
      principalCents: entry.amountCents,
      discountCents: 0,
      interestCents: 0,
      fineCents: 0,
      notes: "Recebimento (demonstração)",
    });
    if (index < 2) {
      const [fresh] = await db
        .select()
        .from(schema.financeEntryTable)
        .where(eq(schema.financeEntryTable.id, entry.id));
      if (fresh) {
        await issueCommission(workspaceId, userId, fresh.id, {
          requestId: `demo-seed-payout:${code}`,
          dueDate: civilFromNow(10),
          version: fresh.version,
        });
        commissions++;
      }
    }
  }

  // Impostos: perfis e simulações
  const profile = await saveProfile(workspaceId, userId, {
    name: "Simples Nacional — Anexo III",
    notes:
      "Perfil de demonstração. Confira as alíquotas com sua contabilidade.",
    isActive: true,
    version: 0,
    items: [
      { name: "DAS", kind: "tax", rateBps: 600, fixedCents: 0 },
      { name: "Taxa de cartão", kind: "fee", rateBps: 299, fixedCents: 0 },
    ],
  });
  const presumido = await saveProfile(workspaceId, userId, {
    name: "Lucro presumido",
    notes: "Alíquotas ilustrativas.",
    isActive: true,
    version: 0,
    items: [
      { name: "PIS/COFINS", kind: "tax", rateBps: 365, fixedCents: 0 },
      { name: "ISS", kind: "tax", rateBps: 300, fixedCents: 0 },
      { name: "IRPJ/CSLL", kind: "tax", rateBps: 480, fixedCents: 0 },
    ],
  });
  let simulations = 0;
  for (const [index, base] of [
    {
      id: (profile as { id: string }).id,
      mode: "gross" as const,
      amount: 800000,
      cost: 250000,
      title: "Site institucional — Simples",
    },
    {
      id: (presumido as { id: string }).id,
      mode: "net" as const,
      amount: 500000,
      cost: 120000,
      title: "Gestão de tráfego — líquido desejado",
    },
  ].entries()) {
    const calculation = {
      profileId: base.id,
      profileVersion: 1,
      date: today,
      mode: base.mode,
      amountCents: base.amount,
      costCents: base.cost,
      commissionMode: "manual" as const,
      commissionRateBps: 500,
      serviceId: crm.services.SITE?.id ?? null,
      sellerId: userId,
    };
    const computed = await calculate(workspaceId, calculation);
    await saveSimulation(workspaceId, userId, {
      calculation,
      calculationSignature: computed.calculationSignature,
      title: base.title,
      requestId: `demo-seed-sim:${index}`,
    });
    simulations++;
  }

  return { generated, paidCycles, commissions, simulations, notes };
}
