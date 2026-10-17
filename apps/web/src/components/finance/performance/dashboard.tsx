import type { PerformanceReport } from "@/fetchers/finance/performance";
import { dateLabel, money } from "../shared";
export const metrics = {
  revenueCents: "Receita faturada",
  directCents: "Custos diretos",
  grossProfitCents: "Lucro bruto",
  expenseCents: "Despesas operacionais",
  taxCents: "Impostos lançados",
  financialCents: "Despesas financeiras líquidas",
  manualCommissionCents: "Comissões manuais",
  commissionCents: "Comissões apuradas",
  discountCents: "Descontos menos encargos recebidos",
  unclassifiedCents: "Despesas não classificadas",
  netProfitCents: "Lucro líquido gerencial",
  projectedProfitCents: "Resultado previsto dos títulos",
  presumedProfitCents: "Lucro presumido estimado",
  cashRevenueCents: "Recebimentos",
  cashExpenseCents: "Pagamentos",
  cashBalanceCents: "Saldo de caixa do período",
} as const;
export function SignedBars({
  rows,
}: {
  rows: {
    label: string;
    values: { label: string; value: number; color: string }[];
  }[];
}) {
  const max = Math.max(
    1,
    ...rows.flatMap((r) => r.values.map((v) => Math.abs(v.value))),
  );
  return (
    <div className="space-y-5">
      {rows.map((r) => (
        <div key={r.label} className="space-y-2">
          <p className="text-xs text-muted-foreground">{r.label}</p>
          {r.values.map((v) => (
            <div
              key={v.label}
              className="grid grid-cols-[5.5rem_1fr] gap-2 text-xs"
            >
              <span>{v.label}</span>
              <div>
                <div className="relative h-5 rounded bg-muted">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/40" />
                  <div
                    title={`${v.label}: ${money(v.value)}`}
                    className="absolute top-1 h-3 rounded"
                    style={{
                      left:
                        v.value < 0
                          ? `${50 - (Math.abs(v.value) / max) * 50}%`
                          : "50%",
                      width: `${(Math.abs(v.value) / max) * 50}%`,
                      backgroundColor: v.color,
                    }}
                  />
                </div>
                <span
                  className={
                    v.value < 0 ? "text-destructive" : "text-muted-foreground"
                  }
                >
                  {money(v.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
export function PerformanceDashboard({ data }: { data: PerformanceReport }) {
  const keys = [
    "grossProfitCents",
    "netProfitCents",
    "projectedProfitCents",
    "presumedProfitCents",
    "commissionCents",
    "cashBalanceCents",
  ] as const;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {keys.map((k) => {
          const value = data.current[k];
          const prev = data.previous[k];
          const delta =
            value !== null && prev !== null && prev !== 0
              ? ((value - prev) / Math.abs(prev)) * 100
              : null;
          return (
            <section key={k} className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">{metrics[k]}</p>
              <strong
                className={`mt-3 block text-2xl tabular-nums ${value !== null && value < 0 ? "text-destructive" : ""}`}
              >
                {value === null ? "Não configurado" : money(value)}
              </strong>
              <p className="mt-2 text-xs text-muted-foreground">
                {delta === null
                  ? "Comparação não aplicável"
                  : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}{" "}
                · anterior {prev === null ? "não configurado" : money(prev)}
              </p>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Comparação com {dateLabel(data.previousPeriod.from)} a{" "}
        {dateLabel(data.previousPeriod.to)}. Valores em BRL. O lucro líquido é
        gerencial; o saldo de caixa considera as baixas efetivas.
      </p>
      {data.current.unclassifiedCount > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/50 p-3 text-sm"
        >
          {data.current.unclassifiedCount} despesas sem classificação (
          {money(data.current.unclassifiedCents)}). Estão deduzidas do lucro
          líquido; classifique os custos diretos para conferir o lucro bruto.
        </p>
      )}
      {data.unassignedExpenseCount > 0 && (
        <p className="rounded-lg border p-3 text-sm">
          {data.unassignedExpenseCount} despesas ficaram fora dos vínculos
          escolhidos. O resultado filtrado não inclui rateio de despesas gerais.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">Lucro bruto e líquido por mês</h2>
          <SignedBars
            rows={data.months.map((m) => ({
              label: m.month.split("-").reverse().join("/"),
              values: [
                { label: "Bruto", value: m.grossProfitCents, color: "#2563eb" },
                {
                  label: "Líquido",
                  value: m.netProfitCents,
                  color: m.netProfitCents < 0 ? "#ef4444" : "#16a34a",
                },
              ],
            }))}
          />
        </section>
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">Comissões: atual × anterior</h2>
          <SignedBars
            rows={[
              {
                label: "Períodos de mesma duração",
                values: [
                  {
                    label: "Atual",
                    value: data.current.commissionCents,
                    color: "#8b5cf6",
                  },
                  {
                    label: "Anterior",
                    value: data.previous.commissionCents,
                    color: "#94a3b8",
                  },
                ],
              },
            ]}
          />
          <h3 className="mb-4 mt-8 font-semibold">Caixa por mês</h3>
          <SignedBars
            rows={data.months.map((m) => ({
              label: m.month,
              values: [
                {
                  label: "Recebido",
                  value: m.cashRevenueCents,
                  color: "#16a34a",
                },
                { label: "Pago", value: -m.cashExpenseCents, color: "#f59e0b" },
              ],
            }))}
          />
        </section>
      </div>
      <section className="rounded-xl border p-4">
        <h2 className="mb-4 font-semibold">Demonstrativo gerencial</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="py-2 text-left">Indicador</th>
                <th className="text-right">Atual</th>
                <th className="text-right">Anterior</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics).map(([key, label]) => {
                const k = key as keyof typeof metrics;
                return (
                  <tr className="border-t" key={key}>
                    <td className="py-2 pr-4">{label}</td>
                    <td className="whitespace-nowrap px-3 text-right tabular-nums">
                      {data.current[k] === null
                        ? "Não configurado"
                        : money(data.current[k])}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {data.previous[k] === null
                        ? "Não configurado"
                        : money(data.previous[k])}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Como os resultados são calculados
        </summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            Lucro bruto = receita faturada − custos diretos. Lucro líquido deduz
            despesas, impostos lançados, encargos e comissões apuradas. Títulos
            de comissão gerados não são deduzidos novamente.
          </p>
          <p>
            Resultado previsto usa os títulos já lançados e a comissão integral
            potencial. Lucro presumido estimado = receita faturada × percentual
            informado nas regras; é uma simulação gerencial, sem cálculo de
            tributos.
          </p>
          <p>
            A comissão sobre recebimentos usa principal menos desconto, sem
            juros ou multas. O arredondamento considera o acumulado de cada
            cobrança, evitando diferenças entre baixas parciais.
          </p>
        </div>
      </details>
    </div>
  );
}
