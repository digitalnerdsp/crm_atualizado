/**
 * Dados fictícios para validar todas as operações do sistema.
 *
 * Uso (na raiz da API):
 *   dev:   pnpm --filter @kaneo/api db:seed:demo -- --workspace=<slug|id>
 *   prod:  node dist/seed/demo.js --workspace=<slug|id>
 *
 * Sem --workspace usa o primeiro workspace. Tudo é criado pelos mesmos
 * controladores das telas, então as regras de negócio rodam de verdade.
 * Empresas de demonstração usam domínio *.demo.test; para apagar tudo que o
 * seed criou, rode com --clean.
 */
import { and, eq, like } from "drizzle-orm";
import { seedCrmDefaults } from "../crm/shared/seed-workspace";
import db, { schema } from "../database";
import { cleanDemo } from "./demo-clean";
import type { Ctx } from "./demo-context";
import { seedCrm } from "./demo-crm";
import { seedFinance } from "./demo-finance";
import { seedHosting } from "./demo-hosting";
import { seedTasks } from "./demo-tasks";

function arg(name: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function resolveContext(): Promise<Ctx> {
  const wanted = arg("workspace");
  const workspaces = await db.select().from(schema.workspaceTable);
  const workspace = wanted
    ? workspaces.find((w) => w.id === wanted || w.slug === wanted)
    : workspaces[0];
  if (!workspace) {
    throw new Error(
      wanted
        ? `Workspace "${wanted}" não encontrado.`
        : "Nenhum workspace existe ainda. Crie um pelo sistema e rode de novo.",
    );
  }
  const members = await db
    .select()
    .from(schema.workspaceUserTable)
    .where(eq(schema.workspaceUserTable.workspaceId, workspace.id));
  const owner =
    members.find((m) => m.role === "owner") ??
    members.find((m) => m.role === "admin") ??
    members[0];
  if (!owner) throw new Error("O workspace não tem membros.");
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    userId: owner.userId,
  };
}

async function main() {
  const ctx = await resolveContext();
  console.log(`Workspace: ${ctx.workspaceName} (${ctx.workspaceId})`);
  if (process.argv.includes("--clean")) {
    await cleanDemo(ctx);
    console.log("Dados de demonstração removidos.");
    return;
  }
  const already = await db
    .select({ id: schema.crmCompanyTable.id })
    .from(schema.crmCompanyTable)
    .where(
      and(
        eq(schema.crmCompanyTable.workspaceId, ctx.workspaceId),
        like(schema.crmCompanyTable.domain, "%.demo.test"),
      ),
    )
    .limit(1);
  if (already.length > 0 && !process.argv.includes("--force")) {
    console.log(
      "Já existem dados de demonstração. Use --clean antes ou --force.",
    );
    return;
  }
  await seedCrmDefaults(ctx.workspaceId);
  const crm = await seedCrm(ctx);
  console.log(
    `CRM: ${crm.companies.length} empresas, ${crm.deals} negócios, ${crm.contracts} contratos`,
  );
  const fin = await seedFinance(ctx, crm);
  console.log(
    `Financeiro: ${fin.entries} lançamentos, ${fin.settlements} baixas`,
  );
  const host = await seedHosting(ctx, crm);
  console.log(`Hospedagem: ${host} cadastros`);
  const tasks = await seedTasks(ctx, crm);
  console.log(`Tarefas: ${tasks} tarefas`);
  console.log("Pronto.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
