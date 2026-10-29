import { and, asc, eq } from "drizzle-orm";
import {
  completeActivity,
  createActivity,
} from "../crm/activity/controllers/upsert-activity";
import { createCompany } from "../crm/company/controllers/upsert-company";
import { createContact } from "../crm/contact/controllers/upsert-contact";
import {
  changeContractValue,
  transitionContract,
} from "../crm/contract/controllers/contracts";
import createDeal from "../crm/deal/controllers/create-deal";
import moveDealStage from "../crm/deal/controllers/move-deal-stage";
import setDealServices from "../crm/deal/controllers/set-deal-services";
import createSale from "../crm/sale/controllers/create-sale";
import {
  createService,
  createServiceCategory,
} from "../crm/service/controllers/catalog";
import { createSegment } from "../crm/taxonomy/controllers/taxonomy";
import db, { schema } from "../database";
import {
  type Ctx,
  daysFromNow,
  fakeCnpj,
  fakeCpf,
  monthStart,
} from "./demo-context";

export type DemoCompany = {
  id: string;
  name: string;
  contactId: string;
  status: string;
};
export type DemoCrm = {
  companies: DemoCompany[];
  services: Record<string, { id: string; priceCents: number }>;
  contractIds: string[];
  saleDealIds: string[];
  deals: number;
  contracts: number;
};

const SEGMENTS = [
  "Varejo",
  "Indústria",
  "Serviços",
  "Saúde",
  "Educação",
  "Alimentação",
];

const CATALOG = [
  {
    cat: "Marketing",
    name: "Gestão de tráfego pago",
    code: "TRAF",
    price: 250000,
    billing: "monthly",
  },
  {
    cat: "Marketing",
    name: "Social media",
    code: "SOCIAL",
    price: 180000,
    billing: "monthly",
  },
  {
    cat: "Marketing",
    name: "SEO mensal",
    code: "SEO",
    price: 150000,
    billing: "monthly",
  },
  {
    cat: "Sites",
    name: "Criação de site institucional",
    code: "SITE",
    price: 800000,
    billing: "one_time",
  },
  {
    cat: "Sites",
    name: "Landing page",
    code: "LP",
    price: 250000,
    billing: "one_time",
  },
  {
    cat: "Hospedagem",
    name: "Hospedagem Host Nerd",
    code: "HOST",
    price: 9900,
    billing: "monthly",
  },
  {
    cat: "Inteligência artificial",
    name: "Agente de IA no WhatsApp",
    code: "AGENTE",
    price: 120000,
    billing: "monthly",
  },
  {
    cat: "Consultoria",
    name: "Consultoria estratégica",
    code: "CONS",
    price: 90000,
    billing: "one_time",
  },
] as const;

const COMPANIES = [
  {
    name: "Padaria Pão Dourado",
    city: "Sorocaba",
    state: "SP",
    size: "me",
    seg: 5,
    status: "active",
  },
  {
    name: "Clínica Vida Plena",
    city: "Sorocaba",
    state: "SP",
    size: "me",
    seg: 3,
    status: "active",
  },
  {
    name: "Metalúrgica Ferraço",
    city: "Votorantim",
    state: "SP",
    size: "medium",
    seg: 1,
    status: "active",
  },
  {
    name: "Escola Aprender Mais",
    city: "São Roque",
    state: "SP",
    size: "epp",
    seg: 4,
    status: "active",
  },
  {
    name: "Vinícola Vale Dourado",
    city: "São Roque",
    state: "SP",
    size: "epp",
    seg: 5,
    status: "active",
  },
  {
    name: "Auto Peças Rodomar",
    city: "Itu",
    state: "SP",
    size: "me",
    seg: 0,
    status: "active",
  },
  {
    name: "Imobiliária Casa Nova",
    city: "Sorocaba",
    state: "SP",
    size: "epp",
    seg: 2,
    status: "active",
  },
  {
    name: "Studio Corpo em Forma",
    city: "Campinas",
    state: "SP",
    size: "mei",
    seg: 3,
    status: "inactive",
  },
  {
    name: "Transportadora Rota Segura",
    city: "Jundiaí",
    state: "SP",
    size: "medium",
    seg: 1,
    status: "churned",
  },
  {
    name: "Loja Brinquedos & Cia",
    city: "Sorocaba",
    state: "SP",
    size: "me",
    seg: 0,
    status: "prospect",
  },
  {
    name: "Consultório Dra. Helena",
    city: "Sorocaba",
    state: "SP",
    size: "mei",
    seg: 3,
    status: "prospect",
    pf: true,
  },
  {
    name: "Cervejaria Artesanal Serra",
    city: "Piedade",
    state: "SP",
    size: "epp",
    seg: 5,
    status: "prospect",
  },
] as const;

const PEOPLE = [
  ["Marcos", "Almeida"],
  ["Fernanda", "Lopes"],
  ["Ricardo", "Ferraço"],
  ["Patrícia", "Nunes"],
  ["Gustavo", "Dourado"],
  ["Aline", "Rodrigues"],
  ["Bruno", "Castro"],
  ["Camila", "Souza"],
  ["Eduardo", "Pires"],
  ["Juliana", "Matos"],
  ["Helena", "Barros"],
  ["Thiago", "Serra"],
] as const;

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export async function seedCrm(ctx: Ctx): Promise<DemoCrm> {
  const { workspaceId, userId } = ctx;

  // Catálogo
  const categories: Record<string, string> = {};
  const services: DemoCrm["services"] = {};
  for (const item of CATALOG) {
    if (!categories[item.cat]) {
      const created = await createServiceCategory({
        workspaceId,
        name: item.cat,
      });
      categories[item.cat] = created.id;
    }
    const service = await createService({
      workspaceId,
      input: {
        name: item.name,
        code: item.code,
        categoryId: categories[item.cat],
        defaultPriceCents: item.price,
        billingType: item.billing,
      },
    });
    services[item.code] = { id: service.id, priceCents: item.price };
  }

  // Segmentos e origens
  const segmentIds: string[] = [];
  for (const name of SEGMENTS) {
    const segment = await createSegment({ workspaceId, name });
    segmentIds.push(segment.id);
  }
  const sources = await db
    .select()
    .from(schema.crmSourceTable)
    .where(eq(schema.crmSourceTable.workspaceId, workspaceId))
    .orderBy(asc(schema.crmSourceTable.position));

  // Empresas e contatos
  const companies: DemoCompany[] = [];
  for (const [index, item] of COMPANIES.entries()) {
    const [first, last] = PEOPLE[index] as readonly [string, string];
    const domain = `${slug(item.name)}.demo.test`;
    const pf = "pf" in item && item.pf;
    const created = await createCompany({
      workspaceId,
      input: {
        name: item.name,
        legalName: `${item.name} Ltda`,
        taxId: pf ? fakeCpf(index) : fakeCnpj(index + 1),
        personType: pf ? "pf" : "pj",
        domain,
        website: `https://${domain}`,
        phone: `(15) 3${String(200 + index).padStart(3, "0")}-${String(1000 + index * 37).slice(0, 4)}`,
        segmentId: segmentIds[item.seg],
        sourceId: sources[index % sources.length]?.id ?? null,
        companySize: item.size,
        status: item.status,
        clientSince:
          item.status === "prospect" ? null : daysFromNow(-(200 + index * 40)),
        churnedAt: item.status === "churned" ? daysFromNow(-45) : null,
        churnReason:
          item.status === "churned" ? "Migrou para equipe interna" : null,
        billingEmail: `financeiro@${domain}`,
        paymentTerms: index % 2 === 0 ? "30" : "cash",
        billingDay: [5, 10, 15, 20][index % 4],
        paymentMethod: (["pix", "boleto", "card", "transfer"] as const)[
          index % 4
        ],
        employeeCount: 3 + index * 4,
        ownerUserId: userId,
        city: item.city,
        state: item.state,
      },
      primaryContact: {
        firstName: first,
        lastName: last,
        email: `${slug(first)}.${slug(last)}@${domain}`,
        phone: `(15) 9${String(8000 + index * 113).padStart(4, "0")}-${String(1000 + index * 211).slice(0, 4)}`,
        jobTitle: index % 3 === 0 ? "Sócio" : "Gerente",
      },
    });
    const companyId =
      (created as { id?: string; company?: { id: string } }).company?.id ??
      (created as { id: string }).id;
    const [contact] = await db
      .select({ id: schema.crmContactTable.id })
      .from(schema.crmContactTable)
      .where(eq(schema.crmContactTable.companyId, companyId))
      .limit(1);
    companies.push({
      id: companyId,
      name: item.name,
      contactId: contact?.id ?? "",
      status: item.status,
    });
    if (index < 5) {
      await createContact({
        workspaceId,
        input: {
          firstName: "Contato",
          lastName: `Financeiro ${index + 1}`,
          email: `financeiro${index + 1}@${domain}`,
          jobTitle: "Financeiro",
          companyId,
          ownerUserId: userId,
        },
      });
    }
  }
  // Contatos soltos (sem empresa)
  for (const [first, last] of [
    ["Rafael", "Teixeira"],
    ["Larissa", "Campos"],
    ["Diego", "Moraes"],
  ] as const) {
    await createContact({
      workspaceId,
      input: {
        firstName: first,
        lastName: last,
        email: `${slug(first)}.${slug(last)}@lead.demo.test`,
        phone: "(15) 99999-0000",
        ownerUserId: userId,
        notes: "Lead vindo de evento",
      },
    });
  }

  // Vendas (geram negócio ganho, contrato e contas a receber pontuais)
  const sale = (code: string, quantity = 1, unitPriceCents?: number) => ({
    serviceId: services[code]?.id,
    quantity,
    ...(unitPriceCents ? { unitPriceCents } : {}),
  });
  const saleDealIds: string[] = [];
  const contractIds: string[] = [];
  const sales = [
    {
      company: 0,
      monthsAgo: 5,
      items: [sale("TRAF"), sale("SOCIAL")],
      form: "pix" as const,
    },
    {
      company: 1,
      monthsAgo: 4,
      items: [sale("TRAF"), sale("SITE")],
      form: "boleto" as const,
    },
    {
      company: 2,
      monthsAgo: 4,
      items: [sale("SEO"), sale("HOST")],
      form: "boleto" as const,
    },
    {
      company: 3,
      monthsAgo: 3,
      items: [sale("SOCIAL"), sale("LP")],
      form: "pix" as const,
    },
    {
      company: 4,
      monthsAgo: 3,
      items: [sale("TRAF"), sale("AGENTE")],
      form: "card" as const,
    },
    {
      company: 5,
      monthsAgo: 2,
      items: [sale("SITE"), sale("HOST")],
      form: "pix" as const,
    },
    {
      company: 6,
      monthsAgo: 2,
      items: [sale("TRAF")],
      form: "boleto" as const,
    },
    { company: 7, monthsAgo: 6, items: [sale("SOCIAL")], form: "pix" as const },
    {
      company: 8,
      monthsAgo: 8,
      items: [sale("TRAF"), sale("HOST")],
      form: "boleto" as const,
    },
    {
      company: 0,
      monthsAgo: 1,
      items: [sale("CONS", 2)],
      form: "pix" as const,
    },
  ];
  for (const item of sales) {
    const company = companies[item.company] as DemoCompany;
    const soldAt = monthStart(-item.monthsAgo);
    soldAt.setUTCDate(8);
    const result = await createSale({
      workspaceId,
      actorUserId: userId,
      companyId: company.id,
      ownerUserId: userId,
      soldAt,
      items: item.items,
      paymentForm: item.form,
      billingDay: [5, 10, 15, 20][item.company % 4],
      notes: "Venda de demonstração",
    });
    saleDealIds.push(result.dealId);
    if (result.contractId) contractIds.push(result.contractId);
  }

  // Ciclo de vida de contratos: reajuste, pausa e cancelamento
  const [adjusted, paused, cancelled] = [
    contractIds[1],
    contractIds[3],
    contractIds[contractIds.length - 1],
  ];
  if (adjusted) {
    await changeContractValue({
      workspaceId,
      contractId: adjusted,
      actorUserId: userId,
      lines: [
        { serviceId: services.TRAF?.id, quantity: 1, unitPriceCents: 280000 },
      ],
      note: "Reajuste anual",
      occurredAt: daysFromNow(-30),
    });
  }
  if (paused) {
    await transitionContract({
      workspaceId,
      contractId: paused,
      actorUserId: userId,
      action: "pause",
      note: "Cliente pediu pausa de 30 dias",
      occurredAt: daysFromNow(-10),
    });
  }
  if (cancelled) {
    await transitionContract({
      workspaceId,
      contractId: cancelled,
      actorUserId: userId,
      action: "cancel",
      note: "Cancelamento a pedido do cliente",
      occurredAt: daysFromNow(-20),
    });
  }

  // Funil: negócios abertos em várias etapas, um ganho e um perdido
  const [pipeline] = await db
    .select()
    .from(schema.crmPipelineTable)
    .where(eq(schema.crmPipelineTable.workspaceId, workspaceId))
    .orderBy(asc(schema.crmPipelineTable.position))
    .limit(1);
  const stages = await db
    .select()
    .from(schema.crmStageTable)
    .where(eq(schema.crmStageTable.pipelineId, pipeline?.id ?? ""))
    .orderBy(asc(schema.crmStageTable.position));
  const open = stages.filter((s) => s.outcome === "open");
  const lostStage = stages.find((s) => s.outcome === "lost");
  const wonStage = stages.find((s) => s.outcome === "won");
  const [lostReason] = await db
    .select()
    .from(schema.crmLostReasonTable)
    .where(eq(schema.crmLostReasonTable.workspaceId, workspaceId))
    .limit(1);

  const funnel = [
    {
      company: 9,
      title: "Loja Brinquedos — e-commerce e tráfego",
      stage: 0,
      items: [sale("SITE"), sale("TRAF")],
      close: 25,
      prob: 20,
    },
    {
      company: 10,
      title: "Consultório Dra. Helena — site e SEO",
      stage: 1,
      items: [sale("SITE"), sale("SEO")],
      close: 18,
      prob: 40,
    },
    {
      company: 11,
      title: "Cervejaria Serra — redes e agente de IA",
      stage: 2,
      items: [sale("SOCIAL"), sale("AGENTE")],
      close: 12,
      prob: 60,
    },
    {
      company: 6,
      title: "Casa Nova — landing de lançamento",
      stage: 3,
      items: [sale("LP"), sale("TRAF")],
      close: 5,
      prob: 80,
    },
    {
      company: 5,
      title: "Rodomar — SEO local",
      stage: 1,
      items: [sale("SEO")],
      close: -3,
      prob: 40,
    },
    {
      company: 4,
      title: "Vale Dourado — consultoria de marca",
      stage: 2,
      items: [sale("CONS", 3)],
      close: 30,
      prob: 50,
    },
  ];
  const dealIds: string[] = [];
  for (const item of funnel) {
    const company = companies[item.company] as DemoCompany;
    const stage = open[Math.min(item.stage, open.length - 1)];
    const deal = await createDeal({
      workspaceId,
      createdByUserId: userId,
      title: item.title,
      stageId: stage?.id,
      companyId: company.id,
      primaryContactId: company.contactId || null,
      ownerUserId: userId,
      probability: item.prob,
      expectedCloseDate: daysFromNow(item.close),
      sourceId: sources[item.company % sources.length]?.id ?? null,
    });
    await setDealServices({ workspaceId, dealId: deal.id, lines: item.items });
    dealIds.push(deal.id);
  }
  // Um perdido (com motivo) e um ganho pelo funil
  if (lostStage && lostReason) {
    const company = companies[9] as DemoCompany;
    const deal = await createDeal({
      workspaceId,
      createdByUserId: userId,
      title: "Brinquedos & Cia — pacote antigo",
      companyId: company.id,
      ownerUserId: userId,
      valueCents: 480000,
    });
    await moveDealStage({
      workspaceId,
      dealId: deal.id,
      stageId: lostStage.id,
      changedByUserId: userId,
      lostReasonId: lostReason.id,
      lostReasonNote: "Escolheu concorrente com preço menor",
    });
  }
  if (wonStage) {
    const company = companies[2] as DemoCompany;
    const deal = await createDeal({
      workspaceId,
      createdByUserId: userId,
      title: "Ferraço — landing de produto",
      companyId: company.id,
      ownerUserId: userId,
    });
    await setDealServices({
      workspaceId,
      dealId: deal.id,
      lines: [sale("LP")],
    });
    await moveDealStage({
      workspaceId,
      dealId: deal.id,
      stageId: wonStage.id,
      changedByUserId: userId,
    });
  }

  // Atividades: atrasadas, de hoje, futuras e concluídas
  const activities = [
    {
      type: "call",
      subject: "Ligar para retomar proposta",
      deal: 0,
      due: -2,
      done: false,
    },
    {
      type: "meeting",
      subject: "Reunião de apresentação do orçamento",
      deal: 1,
      due: 0,
      done: false,
    },
    {
      type: "whatsapp",
      subject: "Enviar portfólio de sites",
      deal: 2,
      due: 1,
      done: false,
    },
    {
      type: "email",
      subject: "Mandar contrato para assinatura",
      deal: 3,
      due: 3,
      done: false,
    },
    {
      type: "task",
      subject: "Preparar proposta comercial",
      deal: 4,
      due: -5,
      done: false,
    },
    {
      type: "call",
      subject: "Primeiro contato",
      deal: 0,
      due: -10,
      done: true,
    },
    {
      type: "meeting",
      subject: "Diagnóstico de marketing",
      deal: 1,
      due: -7,
      done: true,
    },
    {
      type: "note",
      subject: "Cliente pediu desconto de 10%",
      deal: 3,
      due: -1,
      done: true,
    },
  ] as const;
  for (const [index, item] of activities.entries()) {
    const created = await createActivity({
      workspaceId,
      createdByUserId: userId,
      input: {
        type: item.type,
        subject: item.subject,
        dealId: dealIds[item.deal],
        companyId: companies[(index + 6) % companies.length]?.id,
        ownerUserId: userId,
        dueAt: daysFromNow(item.due),
        body: "Atividade de demonstração.",
      },
    });
    if (item.done) {
      await completeActivity({
        workspaceId,
        activityId: created.id,
        outcome: "Conversa produtiva, cliente demonstrou interesse.",
        durationMinutes: 25,
      });
    }
  }

  void and;
  return {
    companies,
    services,
    contractIds,
    saleDealIds,
    deals: dealIds.length + saleDealIds.length + 2,
    contracts: contractIds.length,
  };
}
