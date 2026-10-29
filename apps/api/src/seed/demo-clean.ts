import { sql } from "drizzle-orm";
import db from "../database";
import type { Ctx } from "./demo-context";

type Row = Record<string, unknown>;
const rows = async (query: ReturnType<typeof sql>) =>
  (await db.execute(query)).rows as Row[];
const ident = (name: string) => sql.identifier(name);
const list = (ids: string[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

/**
 * Apaga linhas e, antes, tudo que as referencia com FK "restrict"/"no action"
 * (baixas, comissões, revisões...). FKs com cascade/set null o banco resolve.
 */
async function deleteTree(table: string, column: string, ids: string[]) {
  if (ids.length === 0) return;
  const refs = await rows(sql`
    select c.conrelid::regclass::text as child, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = ${table}::regclass
      and array_length(c.conkey, 1) = 1
      and c.confdeltype in ('r', 'a')
      and c.confkey[1] = (select attnum from pg_attribute
        where attrelid = ${table}::regclass and attname = ${column})`);
  for (const ref of refs) {
    const child = String(ref.child);
    const col = String(ref.col);
    const hasId = await rows(sql`
      select 1 from pg_attribute
      where attrelid = ${child}::regclass and attname = 'id' and not attisdropped`);
    if (hasId.length > 0 && child !== table) {
      const found = await rows(
        sql`select id from ${sql.raw(child)} where ${ident(col)} in (${list(ids)})`,
      );
      await deleteTree(
        child,
        "id",
        found.map((r) => String(r.id)),
      );
    } else {
      await db.execute(
        sql`delete from ${sql.raw(child)} where ${ident(col)} in (${list(ids)})`,
      );
    }
  }
  await db.execute(
    sql`delete from ${sql.raw(table)} where ${ident(column)} in (${list(ids)})`,
  );
}

const PARTIES = [
  "Imobiliária Centro Empresarial",
  "Google Ads (repasse)",
  "Meta Ads (repasse)",
  "Ferramentas SaaS Brasil",
  "Contabilidade Souza & Filhos",
  "Lucas Designer",
  "Marina Redatora",
  "Equipe interna (folha)",
];
const CATEGORIES = [
  "Serviços recorrentes",
  "Projetos pontuais",
  "Sites e landing pages",
  "Folha e pró-labore",
  "Ferramentas e licenças",
  "Mídia paga (repasse)",
  "Infraestrutura e aluguel",
  "Impostos e taxas",
  "Freelancers",
];

const ids = (found: Row[]) => found.map((r) => String(r.id));

/** Remove o que o seed criou: empresas *.demo.test e tudo ligado a elas. */
export async function cleanDemo(ctx: Ctx) {
  const w = ctx.workspaceId;
  const companies = ids(
    await rows(
      sql`select id from crm_company where workspace_id = ${w} and domain like '%.demo.test'`,
    ),
  );
  const contracts = companies.length
    ? ids(
        await rows(
          sql`select id from crm_contract where company_id in (${list(companies)})`,
        ),
      )
    : [];
  const entries = ids(
    await rows(sql`
      select id from finance_entry where workspace_id = ${w} and (
        series_id like 'demo-seed%'
        or series_id like 'sale:%' and company_id in (select id from crm_company where domain like '%.demo.test')
        ${companies.length ? sql`or company_id in (${list(companies)})` : sql``}
        ${contracts.length ? sql`or contract_id in (${list(contracts)})` : sql``}
      )`),
  );
  await deleteTree("finance_entry", "id", entries);
  await deleteTree("crm_contract", "id", contracts);
  const deals = companies.length
    ? ids(
        await rows(
          sql`select id from crm_deal where company_id in (${list(companies)})`,
        ),
      )
    : [];
  await deleteTree("crm_deal", "id", deals);
  await deleteTree("crm_company", "id", companies);
  const projects = ids(
    await rows(
      sql`select id from project where workspace_id = ${w} and name like '[Demo] %'`,
    ),
  );
  await deleteTree("project", "id", projects);
  // Catálogo e segmentos do seed (só os sem uso restante)
  const codes = [
    "TRAF",
    "SOCIAL",
    "SEO",
    "SITE",
    "LP",
    "HOST",
    "AGENTE",
    "CONS",
  ];
  const services = ids(
    await rows(
      sql`select id from crm_service where workspace_id = ${w} and code in (${list(codes)})`,
    ),
  );
  await deleteTree("crm_service", "id", services);
  await db.execute(sql`delete from crm_service_category c where c.workspace_id = ${w}
    and c.name in ('Marketing','Sites','Hospedagem','Consultoria','Inteligência artificial')
    and not exists (select 1 from crm_service s where s.category_id = c.id)`);
  await db.execute(sql`delete from crm_segment s where s.workspace_id = ${w}
    and s.name in ('Varejo','Indústria','Serviços','Saúde','Educação','Alimentação')
    and not exists (select 1 from crm_company c where c.segment_id = s.id)`);
  // Contatos, perfis de imposto, categorias e fornecedores do seed
  await db.execute(
    sql`delete from crm_contact where workspace_id = ${w} and email like '%.demo.test'`,
  );
  const profiles = ids(
    await rows(
      sql`select id from finance_tax_profile where workspace_id = ${w} and name in ('Simples Nacional — Anexo III','Lucro presumido')`,
    ),
  );
  await deleteTree("finance_tax_profile", "id", profiles);
  const parties = ids(
    await rows(
      sql`select id from finance_party where workspace_id = ${w} and name in (${list(PARTIES)})`,
    ),
  );
  await deleteTree("finance_party", "id", parties);
  const categories = ids(
    await rows(
      sql`select id from finance_category where workspace_id = ${w} and name in (${list(CATEGORIES)})`,
    ),
  );
  await deleteTree("finance_category", "id", categories);
  console.log(
    `Removidos: ${companies.length} empresas, ${contracts.length} contratos, ${entries.length} lançamentos, ${projects.length} projetos.`,
  );
}
