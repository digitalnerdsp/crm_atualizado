import { and, eq, inArray, ne } from "drizzle-orm";
import type db from "../../database";
import { crmCompanyTable, crmContractTable } from "../../database/schema";

/** O `db` ou uma transação aberta: a situação do cliente muda junto da
 * escrita que a causou, ou não muda. */
type Executor = Pick<typeof db, "select" | "update">;

/**
 * Situação do cliente movida pelo que acontece com ele. Automática, mas não
 * definitiva: a pessoa pode corrigir à mão na ficha, porque um cliente sem
 * contrato ativo que segue comprando projeto pontual não é churn, e só ela
 * sabe disso.
 */

/**
 * Um negócio ganho ou um contrato novo fazem do cliente um cliente ativo. O
 * "cliente desde" só é gravado na primeira vez: um cliente que volta depois de
 * um churn continua cliente desde a primeira compra.
 */
export async function markCompanyActive(
  executor: Executor,
  companyId: string,
  since: Date,
) {
  const [company] = await executor
    .select({
      status: crmCompanyTable.status,
      clientSince: crmCompanyTable.clientSince,
    })
    .from(crmCompanyTable)
    .where(eq(crmCompanyTable.id, companyId))
    .limit(1);

  // Já ativo e com data: nada a fazer. Já ativo e sem data acontece quando
  // alguém marcou a situação à mão antes de existir negócio ou contrato — e
  // aí a primeira venda é o que preenche "cliente desde".
  if (!company) return;
  if (company.status === "active" && company.clientSince) return;

  await executor
    .update(crmCompanyTable)
    .set({
      status: "active",
      clientSince: company.clientSince ?? since,
      churnedAt: null,
    })
    .where(eq(crmCompanyTable.id, companyId));
}

/**
 * Depois que um contrato termina: se não sobrou nenhum ativo ou pausado, o
 * cliente saiu. Cancelamento é churn; fim natural de um contrato de prazo
 * fixo deixa o cliente inativo — ele não foi perdido, o escopo acabou.
 */
export async function settleCompanyAfterContractEnd(
  executor: Executor,
  {
    companyId,
    endedContractId,
    kind,
    reason,
    at,
  }: {
    companyId: string;
    endedContractId: string;
    kind: "cancelled" | "finished";
    reason?: string | null;
    at: Date;
  },
) {
  const [remaining] = await executor
    .select({ id: crmContractTable.id })
    .from(crmContractTable)
    .where(
      and(
        eq(crmContractTable.companyId, companyId),
        ne(crmContractTable.id, endedContractId),
        inArray(crmContractTable.status, ["active", "paused"]),
      ),
    )
    .limit(1);

  if (remaining) return;

  await executor
    .update(crmCompanyTable)
    .set(
      kind === "cancelled"
        ? { status: "churned", churnedAt: at, churnReason: reason ?? null }
        : { status: "inactive" },
    )
    .where(eq(crmCompanyTable.id, companyId));
}
