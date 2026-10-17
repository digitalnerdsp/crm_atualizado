import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import db from "../../../database";
import { crmCompanyTable } from "../../../database/schema";

/**
 * Autocomplete de cidade sobre o que já foi digitado no workspace.
 *
 * Resolve "São Paulo" versus "Sao Paulo" sem carregar os 5.570 municípios do
 * IBGE, que seria manutenção sem retorno enquanto ninguém precisar de código
 * IBGE. Filtrar por UF é o que faz a lista caber numa tela.
 */
async function getCities({
  workspaceId,
  state,
}: {
  workspaceId: string;
  state?: string;
}) {
  const rows = await db
    .selectDistinct({ city: crmCompanyTable.city })
    .from(crmCompanyTable)
    .where(
      and(
        eq(crmCompanyTable.workspaceId, workspaceId),
        isNotNull(crmCompanyTable.city),
        ne(crmCompanyTable.city, ""),
        state ? eq(crmCompanyTable.state, state) : undefined,
      ),
    )
    .orderBy(asc(crmCompanyTable.city))
    .limit(200);

  return rows
    .map((row) => row.city)
    .filter((city): city is string => city !== null);
}

export default getCities;
