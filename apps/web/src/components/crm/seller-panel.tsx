import { useQuery } from "@tanstack/react-query";
import { getSellerPanel } from "@/fetchers/crm/seller-panel";
import { formatMoney } from "@/lib/money";

const monthLabel = (m: string) => {
  const [year, month] = m.split("-");
  const names = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${names[Number(month) - 1]}/${String(year).slice(2)}`;
};

/** Só os números de quem está logado; o painel geral fica no BI. */
export function SellerPanelView({ workspaceId }: { workspaceId: string }) {
  const panel = useQuery({
    queryKey: ["crm", "seller-panel", workspaceId],
    queryFn: () => getSellerPanel(workspaceId),
  });
  if (panel.isLoading)
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  if (panel.error || !panel.data)
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {panel.error?.message ?? "Não foi possível carregar o painel."}
      </p>
    );
  const d = panel.data;
  const current = d.sales[d.sales.length - 1];
  const max = Math.max(1, ...d.sales.map((s) => s.valueCents));
  const cards = [
    {
      label: `Vendas em ${monthLabel(d.month)}`,
      value: String(current?.count ?? 0),
      hint: formatMoney(current?.valueCents ?? 0),
    },
    {
      label: `Comissão de ${monthLabel(d.month)}`,
      value: formatMoney(d.commission.monthCents),
      hint: "Sobre o que o cliente já pagou no mês",
    },
    {
      label: `Previsão para ${monthLabel(d.nextMonth)}`,
      value: formatMoney(d.commission.forecastCents),
      hint: "Sobre as cobranças que vencem no mês seguinte",
    },
  ];
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-5 py-6">
      <div>
        <h1 className="text-xl font-semibold">Meu painel</h1>
        <p className="text-sm text-muted-foreground">
          Suas vendas e sua comissão. Os números da equipe ficam no BI.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5">
            <span className="block text-sm text-muted-foreground">
              {c.label}
            </span>
            <strong className="mt-3 block text-2xl tabular-nums">
              {c.value}
            </strong>
            <span className="mt-2 block text-xs text-muted-foreground">
              {c.hint}
            </span>
          </div>
        ))}
      </div>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Vendas por mês</h2>
        <ul className="mt-4 space-y-3">
          {d.sales.map((s) => (
            <li
              key={s.month}
              className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 text-sm"
            >
              <span className="text-muted-foreground">
                {monthLabel(s.month)}
              </span>
              <span className="h-3 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(s.valueCents / max) * 100}%` }}
                />
              </span>
              <span className="tabular-nums">
                {s.count} · {formatMoney(s.valueCents)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
