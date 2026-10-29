import { and, asc, eq, like } from "drizzle-orm";
import db, { schema } from "../database";
import {
  cancelEntry,
  createEntries,
  reverseSettlement,
  saveCategory,
  saveParty,
  settleEntry,
} from "../finance/controllers/finance";
import { type Ctx, civil, monthStart } from "./demo-context";
import type { DemoCrm } from "./demo-crm";
import { seedFinanceExtra } from "./demo-finance-extra";

export type DemoFinance = {
  entries: number;
  settlements: number;
  categories: Record<string, string>;
  parties: Record<string, string>;
};

type EntrySeed = {
  key: string;
  description: string;
  direction: "payable" | "receivable";
  amountCents: number;
  /** Meses a partir de hoje (negativo = passado). */
  month: number;
  day: number;
  category?: string;
  party?: string;
  partyName: string;
  companyId?: string | null;
  method?: "pix" | "boleto" | "card" | "transfer" | "cash" | "other";
  count?: number;
  interval?: 1 | 3 | 12;
  schedule?: "installments" | "recurring";
  notes?: string;
};

const dateOf = (monthOffset: number, day: number) => {
  const d = monthStart(monthOffset);
  d.setUTCDate(day);
  return civil(d);
};

export async function seedFinance(
  ctx: Ctx,
  crm: DemoCrm,
): Promise<DemoFinance> {
  const { workspaceId, userId } = ctx;
  let entries = 0;
  let settlements = 0;

  // Plano de contas
  const categories: Record<string, string> = {};
  const category = async (
    name: string,
    direction: "payable" | "receivable",
    parent?: string,
  ) => {
    const row = await saveCategory(workspaceId, userId, {
      name,
      direction,
      parentId: parent ? (categories[parent] ?? null) : null,
      isActive: true,
    });
    categories[name] = (row as { id: string }).id;
  };
  await category("Serviços recorrentes", "receivable");
  await category("Projetos pontuais", "receivable");
  await category("Sites e landing pages", "receivable", "Projetos pontuais");
  await category("Folha e pró-labore", "payable");
  await category("Ferramentas e licenças", "payable");
  await category("Mídia paga (repasse)", "payable");
  await category("Infraestrutura e aluguel", "payable");
  await category("Impostos e taxas", "payable");
  await category("Freelancers", "payable");

  // Favorecidos
  const parties: Record<string, string> = {};
  const party = async (
    name: string,
    laborType: "pj" | "freelance" | "clt" | null,
  ) => {
    const row = await saveParty(workspaceId, userId, {
      name,
      laborType,
      isActive: true,
    });
    parties[name] = (row as { id: string }).id;
  };
  await party("Imobiliária Centro Empresarial", "pj");
  await party("Google Ads (repasse)", "pj");
  await party("Meta Ads (repasse)", "pj");
  await party("Ferramentas SaaS Brasil", "pj");
  await party("Contabilidade Souza & Filhos", "pj");
  await party("Lucas Designer", "freelance");
  await party("Marina Redatora", "freelance");
  await party("Equipe interna (folha)", "clt");

  const list: EntrySeed[] = [
    // A pagar — recorrentes
    {
      key: "aluguel",
      description: "Aluguel do escritório",
      direction: "payable",
      amountCents: 450000,
      month: -4,
      day: 5,
      category: "Infraestrutura e aluguel",
      party: "Imobiliária Centro Empresarial",
      partyName: "Imobiliária Centro Empresarial",
      method: "boleto",
      count: 8,
      interval: 1,
      schedule: "recurring",
    },
    {
      key: "saas",
      description: "Licenças de ferramentas (CRM, design, IA)",
      direction: "payable",
      amountCents: 189000,
      month: -4,
      day: 10,
      category: "Ferramentas e licenças",
      party: "Ferramentas SaaS Brasil",
      partyName: "Ferramentas SaaS Brasil",
      method: "card",
      count: 8,
      interval: 1,
      schedule: "recurring",
    },
    {
      key: "folha",
      description: "Folha da equipe interna",
      direction: "payable",
      amountCents: 1250000,
      month: -4,
      day: 5,
      category: "Folha e pró-labore",
      party: "Equipe interna (folha)",
      partyName: "Equipe interna (folha)",
      method: "transfer",
      count: 8,
      interval: 1,
      schedule: "recurring",
    },
    {
      key: "contab",
      description: "Honorários contábeis",
      direction: "payable",
      amountCents: 85000,
      month: -4,
      day: 15,
      category: "Impostos e taxas",
      party: "Contabilidade Souza & Filhos",
      partyName: "Contabilidade Souza & Filhos",
      method: "pix",
      count: 8,
      interval: 1,
      schedule: "recurring",
    },
    // A pagar — parcelados e avulsos
    {
      key: "midia-google",
      description: "Repasse de mídia — Google Ads (clientes)",
      direction: "payable",
      amountCents: 620000,
      month: -2,
      day: 12,
      category: "Mídia paga (repasse)",
      party: "Google Ads (repasse)",
      partyName: "Google Ads (repasse)",
      method: "card",
      count: 3,
      interval: 1,
      schedule: "installments",
    },
    {
      key: "midia-meta",
      description: "Repasse de mídia — Meta Ads (clientes)",
      direction: "payable",
      amountCents: 480000,
      month: -2,
      day: 14,
      category: "Mídia paga (repasse)",
      party: "Meta Ads (repasse)",
      partyName: "Meta Ads (repasse)",
      method: "card",
      count: 3,
      interval: 1,
      schedule: "installments",
    },
    {
      key: "design",
      description: "Identidade visual — projeto Vale Dourado",
      direction: "payable",
      amountCents: 360000,
      month: -3,
      day: 20,
      category: "Freelancers",
      party: "Lucas Designer",
      partyName: "Lucas Designer",
      method: "pix",
      count: 3,
      interval: 1,
      schedule: "installments",
    },
    {
      key: "redacao",
      description: "Textos do blog — pacote mensal",
      direction: "payable",
      amountCents: 90000,
      month: -1,
      day: 25,
      category: "Freelancers",
      party: "Marina Redatora",
      partyName: "Marina Redatora",
      method: "pix",
      count: 1,
    },
    {
      key: "imposto",
      description: "DAS do Simples Nacional",
      direction: "payable",
      amountCents: 312000,
      month: -1,
      day: 20,
      category: "Impostos e taxas",
      partyName: "Receita Federal",
      method: "boleto",
      count: 1,
    },
    {
      key: "cancelada",
      description: "Curso cancelado (reembolsado)",
      direction: "payable",
      amountCents: 79000,
      month: -1,
      day: 18,
      category: "Ferramentas e licenças",
      partyName: "Escola Online",
      method: "card",
      count: 1,
    },
    {
      key: "atrasada",
      description: "Servidor dedicado — fatura atrasada",
      direction: "payable",
      amountCents: 214000,
      month: -1,
      day: 3,
      category: "Infraestrutura e aluguel",
      partyName: "Datacenter Sul",
      method: "boleto",
      count: 1,
    },
    // A receber — avulsos fora de venda
    {
      key: "workshop",
      description: "Workshop de marketing — turma aberta",
      direction: "receivable",
      amountCents: 240000,
      month: -1,
      day: 22,
      category: "Projetos pontuais",
      partyName: "Padaria Pão Dourado",
      companyId: crm.companies[0]?.id,
      method: "pix",
      count: 1,
    },
    {
      key: "migracao",
      description: "Migração de site para Next.js",
      direction: "receivable",
      amountCents: 600000,
      month: -3,
      day: 9,
      category: "Sites e landing pages",
      partyName: "Auto Peças Rodomar",
      companyId: crm.companies[5]?.id,
      method: "boleto",
      count: 3,
      interval: 1,
      schedule: "installments",
    },
    {
      key: "atrasado-cli",
      description: "Consultoria de SEO — saldo em atraso",
      direction: "receivable",
      amountCents: 350000,
      month: -2,
      day: 6,
      category: "Projetos pontuais",
      partyName: "Imobiliária Casa Nova",
      companyId: crm.companies[6]?.id,
      method: "boleto",
      count: 1,
    },
    {
      key: "a-vencer",
      description: "Landing page de campanha — entrega final",
      direction: "receivable",
      amountCents: 280000,
      month: 0,
      day: 28,
      category: "Sites e landing pages",
      partyName: "Escola Aprender Mais",
      companyId: crm.companies[3]?.id,
      method: "pix",
      count: 1,
    },
  ];

  const series: Record<string, string> = {};
  for (const item of list) {
    const requestId = `demo-seed:${item.key}`;
    series[item.key] = requestId;
    const first = dateOf(item.month, item.day);
    await createEntries(workspaceId, userId, {
      requestId,
      description: item.description,
      direction: item.direction,
      kind: "operating",
      amountCents: item.amountCents,
      competenceDate: first,
      dueDate: first,
      categoryId: item.category ? (categories[item.category] ?? null) : null,
      partyId: item.party ? (parties[item.party] ?? null) : null,
      partyName: item.partyName,
      companyId: item.companyId ?? null,
      serviceId: null,
      sellerId: item.direction === "receivable" ? userId : null,
      paymentMethod: item.method ?? "pix",
      notes: item.notes ?? "Lançamento de demonstração",
      count: item.count ?? 1,
      intervalMonths: item.interval ?? 1,
      schedule: item.schedule ?? "installments",
    });
  }

  const today = civil(new Date());
  const seriesEntries = async (key: string) =>
    db
      .select()
      .from(schema.financeEntryTable)
      .where(
        and(
          eq(schema.financeEntryTable.workspaceId, workspaceId),
          eq(schema.financeEntryTable.seriesId, series[key] as string),
        ),
      )
      .orderBy(asc(schema.financeEntryTable.dueDate));

  let counter = 0;
  const settle = async (
    entry: { id: string; amountCents: number },
    date: string,
    principalCents = entry.amountCents,
    extra: { discount?: number; interest?: number; fine?: number } = {},
  ) => {
    counter++;
    const row = await settleEntry(workspaceId, userId, entry.id, {
      requestId: `demo-seed-settle:${counter}`,
      date,
      principalCents,
      discountCents: extra.discount ?? 0,
      interestCents: extra.interest ?? 0,
      fineCents: extra.fine ?? 0,
      notes: "Baixa de demonstração",
    });
    settlements++;
    return row;
  };

  // Baixas: tudo que já venceu é pago, exceto o que queremos em atraso/parcial
  const keepOpen = new Set(["atrasada", "atrasado-cli"]);
  for (const key of Object.keys(series)) {
    if (keepOpen.has(key) || key === "cancelada" || key === "a-vencer")
      continue;
    for (const entry of await seriesEntries(key)) {
      if (entry.dueDate >= today) continue;
      await settle(entry, entry.dueDate);
    }
  }
  // Parcial: metade de uma parcela da migração
  const migracao = await seriesEntries("migracao");
  const partial =
    migracao.find((e) => e.dueDate >= today) ?? migracao[migracao.length - 1];
  if (partial) {
    const open = await db
      .select()
      .from(schema.financeEntryTable)
      .where(eq(schema.financeEntryTable.id, partial.id));
    const target = open[0];
    if (
      target &&
      !(
        await db
          .select()
          .from(schema.financeSettlementTable)
          .where(eq(schema.financeSettlementTable.entryId, target.id))
      ).length
    ) {
      await settle(target, today, Math.floor(target.amountCents / 2));
    }
  }
  // Baixa com juros e multa no imposto atrasado pago depois
  const imposto = (await seriesEntries("imposto"))[0];
  if (imposto) {
    const existing = await db
      .select()
      .from(schema.financeSettlementTable)
      .where(eq(schema.financeSettlementTable.entryId, imposto.id));
    if (existing.length === 0) {
      await settle(imposto, today, imposto.amountCents, {
        interest: 4200,
        fine: 6000,
      });
    }
  }
  // Estorno de uma baixa e baixa de novo (histórico)
  const redacao = (await seriesEntries("redacao"))[0];
  if (redacao) {
    const [done] = await db
      .select()
      .from(schema.financeSettlementTable)
      .where(eq(schema.financeSettlementTable.entryId, redacao.id));
    if (done) {
      await reverseSettlement(
        workspaceId,
        userId,
        redacao.id,
        done.id,
        "Pagamento duplicado, estornado",
      );
      await settle(redacao, today);
    }
  }
  // Cancelamento
  const cancelled = (await seriesEntries("cancelada"))[0];
  if (cancelled) {
    await cancelEntry(
      workspaceId,
      userId,
      cancelled.id,
      "Curso cancelado pelo fornecedor",
    );
  }

  // Vendas do CRM: baixa dos itens pontuais já vencidos
  const sales = await db
    .select()
    .from(schema.financeEntryTable)
    .where(
      and(
        eq(schema.financeEntryTable.workspaceId, workspaceId),
        like(schema.financeEntryTable.seriesId, "sale:%"),
      ),
    );
  for (const entry of sales) {
    const settled = await db
      .select()
      .from(schema.financeSettlementTable)
      .where(eq(schema.financeSettlementTable.entryId, entry.id));
    if (settled.length === 0 && entry.dueDate < today) {
      await settle(entry, entry.dueDate);
    }
  }

  const extra = await seedFinanceExtra(ctx, crm, categories);
  console.log(
    `  contratos com cobrança: ${extra.generated}, mensalidades pagas: ${extra.paidCycles}, comissões: ${extra.commissions}, simulações: ${extra.simulations}`,
  );
  for (const note of extra.notes) console.log(`  aviso: ${note}`);

  const total = await db
    .select({ id: schema.financeEntryTable.id })
    .from(schema.financeEntryTable)
    .where(eq(schema.financeEntryTable.workspaceId, workspaceId));
  entries = total.length;
  settlements = (
    await db
      .select({ id: schema.financeSettlementTable.id })
      .from(schema.financeSettlementTable)
      .innerJoin(
        schema.financeEntryTable,
        eq(schema.financeEntryTable.id, schema.financeSettlementTable.entryId),
      )
      .where(eq(schema.financeEntryTable.workspaceId, workspaceId))
  ).length;
  return { entries, settlements, categories, parties };
}
