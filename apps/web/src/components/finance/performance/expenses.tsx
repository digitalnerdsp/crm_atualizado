import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type ClassPayload,
  classifyExpense,
  type PerformanceReport,
} from "@/fetchers/finance/performance";
import { useFinanceMutation } from "@/hooks/mutations/finance/use-finance-mutation";
import { money, selectClass } from "../shared";

const labels = {
  unclassified: "Não classificado",
  direct: "Custo direto",
  operating: "Despesa operacional",
  tax: "Impostos",
  financial: "Despesa financeira",
  commission: "Comissão manual",
};
export function PerformanceExpenses({
  workspaceId,
  data,
  canUpdate,
}: {
  workspaceId: string;
  data: PerformanceReport;
  canUpdate: boolean;
}) {
  const [page, setPage] = useState(1);
  const save = useFinanceMutation(
    workspaceId,
    (input: { id: string; json: ClassPayload }) =>
      classifyExpense(workspaceId, input.id, input.json),
  );
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <h2 className="font-semibold">Classificação de custos e despesas</h2>
      <p className="text-sm text-muted-foreground">
        Custos diretos reduzem o lucro bruto. Todas as despesas, inclusive não
        classificadas, reduzem o lucro líquido. A classificação altera apenas a
        apresentação gerencial e fica no histórico; valores e baixas são
        preservados. Comissões geradas pela apuração são classificadas
        automaticamente e não aparecem nesta lista.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Despesa</th>
              <th className="p-3">Valor</th>
              <th className="p-3">Classificação</th>
            </tr>
          </thead>
          <tbody>
            {data.expenses.slice((page - 1) * 25, page * 25).map((e) => (
              <tr key={e.id} className="border-t">
                <td className="min-w-48 p-3">{e.description}</td>
                <td className="whitespace-nowrap p-3">
                  {money(e.amountCents)}
                </td>
                <td className="min-w-52 p-3">
                  <select
                    aria-label={`Classificação de ${e.description}`}
                    className={selectClass}
                    value={e.resultClass}
                    disabled={!canUpdate || save.isPending}
                    onChange={(event) =>
                      save.mutate({
                        id: e.id,
                        json: {
                          resultClass: event.target
                            .value as ClassPayload["resultClass"],
                          version: e.version,
                        },
                      })
                    }
                  >
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.expenses.length && (
        <p className="py-6 text-sm text-muted-foreground">
          Sem despesas para classificar neste período.
        </p>
      )}
      <div className="flex items-center justify-end gap-2 text-sm">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        {page}
        <Button
          variant="outline"
          disabled={page * 25 >= data.expenses.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </section>
  );
}
