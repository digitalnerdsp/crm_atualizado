import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { GroupedBars } from "@/components/crm/charts/grouped-bars";
import type { FinanceDashboard, FinanceFilters } from "@/fetchers/finance";
import { dateLabel, money } from "./shared";
export function FinanceDashboardView({
  data,
  onInspect,
}: {
  data: FinanceDashboard;
  onInspect: (filters: Partial<FinanceFilters>) => void;
}) {
  const { current, previous } = data;
  const items: [keyof typeof current, string, Partial<FinanceFilters>][] = [
    [
      "income",
      "Recebido operacional",
      {
        direction: "receivable",
        kind: "operating",
        dateBasis: "settlement",
        status: undefined,
        view: undefined,
        asOf: undefined,
      },
    ],
    [
      "expense",
      "Pago operacional",
      {
        direction: "payable",
        kind: "operating",
        dateBasis: "settlement",
        status: undefined,
        view: undefined,
        asOf: undefined,
      },
    ],
    [
      "balance",
      "Movimento líquido do período",
      {
        dateBasis: "settlement",
        status: undefined,
        view: undefined,
        asOf: undefined,
      },
    ],
    [
      "pendingReceivable",
      "Saldo a receber",
      {
        direction: "receivable",
        dateBasis: "due",
        status: undefined,
        view: "outstanding",
        asOf: data.referenceDate,
      },
    ],
    [
      "pendingPayable",
      "Saldo a pagar",
      {
        direction: "payable",
        dateBasis: "due",
        status: undefined,
        view: "outstanding",
        asOf: data.referenceDate,
      },
    ],
    [
      "overdue",
      "Recebíveis vencidos",
      {
        direction: "receivable",
        status: undefined,
        view: "overdue",
        asOf: data.referenceDate,
        dateBasis: "due",
      },
    ],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([key, label, filters], i) => {
          const diff =
            previous[key] === 0
              ? null
              : ((current[key] - previous[key]) / Math.abs(previous[key])) *
                100;
          const Icon =
            i === 0 ? ArrowDownLeft : i === 1 ? ArrowUpRight : Wallet;
          return (
            <button
              type="button"
              key={key}
              className="rounded-xl border bg-card p-5 text-left transition-colors hover:bg-muted/40"
              onClick={() => onInspect(filters)}
            >
              <span className="flex items-center justify-between text-sm text-muted-foreground">
                {label}
                <Icon className="size-4" />
              </span>
              <span className="mt-3 block text-2xl font-semibold tabular-nums">
                {money(current[key])}
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                {diff === null
                  ? "Variação não aplicável"
                  : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`}{" "}
                · anterior {money(previous[key])}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Comparação: {dateLabel(data.previousPeriod.from)} a{" "}
        {dateLabel(data.previousPeriod.to)}. Saldos em aberto até o fim do
        período; baixas consideradas até {dateLabel(data.referenceDate)}.
        Valores históricos são reapresentados após estornos. Saldo inicial não
        compõe receita ou despesa operacional.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border p-5">
          <h2 className="mb-5 font-semibold">Receitas × despesas realizadas</h2>
          <GroupedBars
            rows={data.months.map((m) => ({
              key: m.month,
              label: m.month.split("-").reverse().join("/"),
              values: { income: m.income, expense: m.expense },
            }))}
            series={[
              { key: "income", label: "Recebido", color: "#16a34a" },
              { key: "expense", label: "Pago", color: "#e11d48" },
            ]}
            formatValue={money}
            emptyLabel="Sem movimentações neste período."
          />
        </section>
        <section className="rounded-xl border p-5">
          <h2 className="mb-5 font-semibold">Entradas previstas × recebidas</h2>
          <GroupedBars
            rows={data.months.map((m) => ({
              key: m.month,
              label: m.month.split("-").reverse().join("/"),
              values: { expected: m.expectedIncome, actual: m.income },
            }))}
            series={[
              { key: "expected", label: "Previsto", color: "#94a3b8" },
              { key: "actual", label: "Recebido", color: "#2563eb" },
            ]}
            formatValue={money}
            emptyLabel="Sem dados neste período."
          />
        </section>
        <section className="rounded-xl border p-5 xl:col-span-2">
          <h2 className="mb-5 font-semibold">Saídas previstas × pagas</h2>
          <GroupedBars
            rows={data.months.map((m) => ({
              key: m.month,
              label: m.month.split("-").reverse().join("/"),
              values: { expected: m.expectedExpense, actual: m.expense },
            }))}
            series={[
              { key: "expected", label: "Previsto", color: "#94a3b8" },
              { key: "actual", label: "Pago", color: "#e11d48" },
            ]}
            formatValue={money}
            emptyLabel="Sem dados neste período."
          />
        </section>
      </div>
    </div>
  );
}
