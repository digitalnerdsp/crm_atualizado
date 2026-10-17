import { eq, max } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { crmContractTable, crmDealTable } from "../../database/schema";
import { isUniqueViolation } from "./unique-violation";

const MAX_ATTEMPTS = 5;

type Sequence = {
  table: PgTable;
  number: AnyPgColumn;
  workspaceId: AnyPgColumn;
  constraint: string;
  label: string;
};

/**
 * Negócios e contratos levam um número legível por workspace, como tarefas
 * levam por projeto. Ler o máximo atual e gravar o próximo é inerentemente
 * concorrente, então a constraint única é a guarda de verdade e isto tenta de
 * novo quando ela dispara.
 */
async function withNextNumber<T>(
  sequence: Sequence,
  workspaceId: string,
  insert: (nextNumber: number) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const [row] = await db
      .select({ maxNumber: max(sequence.number) })
      .from(sequence.table)
      .where(eq(sequence.workspaceId, workspaceId));

    try {
      return await insert(Number(row?.maxNumber ?? 0) + 1);
    } catch (error) {
      if (
        attempt < MAX_ATTEMPTS &&
        isUniqueViolation(error, sequence.constraint)
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new HTTPException(409, {
    message: `Could not allocate a ${sequence.label} number, please retry`,
  });
}

export function withNextDealNumber<T>(
  workspaceId: string,
  insert: (dealNumber: number) => Promise<T>,
) {
  return withNextNumber(
    {
      table: crmDealTable,
      number: crmDealTable.number,
      workspaceId: crmDealTable.workspaceId,
      constraint: "crm_deal_workspace_number_unique",
      label: "deal",
    },
    workspaceId,
    insert,
  );
}

export function withNextContractNumber<T>(
  workspaceId: string,
  insert: (contractNumber: number) => Promise<T>,
) {
  return withNextNumber(
    {
      table: crmContractTable,
      number: crmContractTable.number,
      workspaceId: crmContractTable.workspaceId,
      constraint: "crm_contract_workspace_number_unique",
      label: "contract",
    },
    workspaceId,
    insert,
  );
}
