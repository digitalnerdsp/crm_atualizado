import { useQuery } from "@tanstack/react-query";
import { BiChart } from "@/components/finance/bi/charts";
import { hours } from "@/components/finance/portfolio/shared";
import { money } from "@/components/finance/shared";
import { StatCard } from "@/components/ui/stat-card";
import { getPortfolio } from "@/fetchers/finance/portfolio";

/**
 * Resumo da carteira dentro do BI: cobranças vencidas, renovações, promessas
 * quebradas e rentabilidade. A fila e o trabalho de cobrança ficam em
 * "Gestão da carteira"; aqui só se lê.
 */
export function PortfolioSummary({
  workspaceId,
  from,
  to,
}: {
  workspaceId: string;
  from: string;
  to: string;
}) {
  const report = useQuery({
    queryKey: [
      "finance",
      workspaceId,
      "portfolio",
      { from, to, horizon: "90" },
      1,
    ],
    queryFn: () => getPortfolio(workspaceId, { from, to, horizon: "90" }, 1),
  });
  const d = report.data;
  const metric = (label: string, value: string, detail: string) => (
    <StatCard label={label} value={value} detail={detail} />
  );
  if (report.isError) return <p role="alert">{report.error.message}</p>;
  if (!d) return <p className="text-sm">Carregando carteira…</p>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metric(
          "Recebíveis vencidos",
          money(d.summary.overdueCents),
          `${d.summary.receivableCount} cobranças no recorte da fila`,
        )}
        {metric(
          "Renovações em atenção",
          String(d.summary.renewals),
          "Contratos e hospedagens de terceiros",
        )}
        {metric(
          "Resultado gerencial",
          money(d.current.netProfitCents),
          `Anterior ${money(d.previous.netProfitCents)}`,
        )}
        {metric(
          "Promessas vencidas",
          String(d.summary.brokenPromises),
          "Conferir pagamento e retomar o contato",
        )}
      </div>

      <BiChart
        title="Receita e resultado gerencial por mês"
        rows={d.months.map((m) => ({
          key: m.month,
          label: m.month,
          values: {
            revenue: m.revenueCents,
            result: m.netProfitCents,
          },
        }))}
        series={[
          {
            key: "revenue",
            label: "Receita faturada",
            color: "var(--info)",
          },
          {
            key: "result",
            label: "Resultado gerencial",
            color: "var(--success)",
          },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {metric(
          "Clientes com resultado negativo",
          String(d.summary.lowMarginClients),
          "Sem rateio de despesas gerais",
        )}
        {metric(
          "Horas sem base de custo",
          hours(d.summary.missingSeconds),
          "Cadastre modelo e vigência antes de avaliar o cenário",
        )}
        {metric(
          "Despesas sem cliente",
          money(d.unassignedExpenseCents),
          "Não distribuídas automaticamente entre clientes",
        )}
      </div>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Atenção da equipe</h2>
        <div className="mt-3 space-y-2">
          {d.alerts.slice(0, 20).map((a) => (
            <p
              key={a.key}
              className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <span>{a.label}</span>
              <strong>{money(a.value)}</strong>
            </p>
          ))}
          {!d.alerts.length && (
            <p className="text-sm text-muted-foreground">
              Sem alertas adicionais neste recorte.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
