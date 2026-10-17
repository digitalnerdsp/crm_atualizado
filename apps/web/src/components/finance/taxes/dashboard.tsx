import type { TaxReport } from "@/fetchers/finance/taxes";
import { SignedBars } from "../performance/dashboard";
import { dateLabel, money } from "../shared";
export function TaxDashboard({ data }: { data: TaxReport }) {
  const actual = [
    "taxAccruedCents",
    "taxPaidCents",
    "financialAccruedCents",
    "financialPaidCents",
  ] as const;
  const planned = [
    "simulationCount",
    "simulatedGrossCents",
    "simulatedNetCents",
    "simulatedTaxCents",
    "simulatedFeeCents",
    "simulatedCommissionCents",
  ] as const;
  const labels = {
    taxAccruedCents: "Impostos lançados",
    taxPaidCents: "Impostos pagos",
    financialAccruedCents: "Despesas financeiras lançadas",
    financialPaidCents: "Despesas financeiras pagas",
    simulationCount: "Simulações salvas",
    simulatedGrossCents: "Vendas simuladas",
    simulatedNetCents: "Líquido simulado",
    simulatedTaxCents: "Impostos simulados",
    simulatedFeeCents: "Taxas simuladas",
    simulatedCommissionCents: "Comissões simuladas",
  };
  function cards(keys: readonly (keyof typeof labels)[]) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {keys.map((k) => {
          const value = data.current[k];
          const prior = data.previous[k];
          const count = k === "simulationCount";
          const delta = prior
            ? ((value - prior) / Math.abs(prior)) * 100
            : null;
          return (
            <section className="rounded-xl border bg-card p-5" key={k}>
              <p className="text-sm text-muted-foreground">{labels[k]}</p>
              <strong
                className={`mt-3 block text-2xl tabular-nums ${value < 0 ? "text-destructive" : ""}`}
              >
                {count ? value : money(value)}
              </strong>
              <p className="mt-2 text-xs text-muted-foreground">
                {delta === null
                  ? "Comparação não aplicável"
                  : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}{" "}
                · anterior {count ? prior : money(prior)}
              </p>
            </section>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <h2 className="font-semibold">Financeiro registrado</h2>
      {cards(actual)}
      <p className="text-xs text-muted-foreground">
        Competência para valores lançados; data da baixa para pagamentos.
        Despesas financeiras incluem os valores classificados dessa forma no
        financeiro.
      </p>
      <h2 className="font-semibold">Planejamento de vendas</h2>
      {cards(planned)}
      <p className="text-xs text-muted-foreground">
        Simulações salvas no período, pela data informada na calculadora. Cada
        cenário salvo é contado, incluindo alternativas para a mesma venda.
        Comparação com {dateLabel(data.previousPeriod.from)} a{" "}
        {dateLabel(data.previousPeriod.to)}.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">
            Impostos: lançado × pago por mês
          </h2>
          <SignedBars
            rows={data.months.map((m) => ({
              label: m.month,
              values: [
                {
                  label: "Lançado",
                  value: m.taxAccruedCents,
                  color: "#f59e0b",
                },
                { label: "Pago", value: m.taxPaidCents, color: "#2563eb" },
              ],
            }))}
          />
        </section>
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">Simulações: bruto × líquido</h2>
          <SignedBars
            rows={data.months.map((m) => ({
              label: m.month,
              values: [
                {
                  label: "Bruto",
                  value: m.simulatedGrossCents,
                  color: "#8b5cf6",
                },
                {
                  label: "Líquido",
                  value: m.simulatedNetCents,
                  color: m.simulatedNetCents < 0 ? "#ef4444" : "#16a34a",
                },
              ],
            }))}
          />
        </section>
      </div>
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
        {data.ledgerNote}
      </p>
    </div>
  );
}
