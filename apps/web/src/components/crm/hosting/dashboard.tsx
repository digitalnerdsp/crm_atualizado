import { GroupedBars } from "@/components/crm/charts/grouped-bars";
import { dateLabel } from "@/components/finance/shared";
import type { HostingReport } from "@/fetchers/crm/hosting";
export function HostingDashboard({
  data,
  onThirdParty,
  onDue,
}: {
  data: HostingReport;
  onThirdParty: () => void;
  onDue: () => void;
}) {
  const metrics = [
    ["companies", "Empresas na carteira"],
    ["own", "Hospedagem nossa"],
    ["thirdParty", "Hospedagem de terceiros"],
    ["due", "Renovações em atenção"],
    ["newCompanies", "Novas empresas no período"],
    ["changes", "Atualizações de cadastro"],
    ["emailsAccepted", "E-mails aceitos pelo SMTP"],
    ["whatsappConfirmed", "WhatsApp: envio informado"],
  ] as const;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([key, label]) => {
          const value = data.current[key];
          const previous = data.previous[key];
          const unavailable =
            ["own", "thirdParty", "due"].includes(key) &&
            !data.previous.historyAvailable;
          const delta =
            previous && !unavailable
              ? ((value - previous) / Math.abs(previous)) * 100
              : null;
          return (
            <button
              key={key}
              type="button"
              className="rounded-xl border bg-card p-5 text-left"
              onClick={
                key === "due"
                  ? onDue
                  : key === "thirdParty"
                    ? onThirdParty
                    : undefined
              }
              disabled={key !== "due" && key !== "thirdParty"}
            >
              <span className="block text-sm text-muted-foreground">
                {label}
              </span>
              <strong className="mt-3 block text-2xl tabular-nums">
                {value}
              </strong>
              <span className="mt-2 block text-xs text-muted-foreground">
                {delta === null
                  ? "Comparação não aplicável"
                  : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}{" "}
                · anterior {unavailable ? "sem histórico" : previous}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Referência {dateLabel(data.referenceDate)}. Comparação com{" "}
        {dateLabel(data.previousPeriod.from)} a{" "}
        {dateLabel(data.previousPeriod.to)}. {data.current.unknown} empresas sem
        classificação de hospedagem registrada.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">
            Hospedagem própria × terceiros por mês
          </h2>
          <GroupedBars
            rows={data.months
              .filter((m) => m.historyAvailable)
              .map((m) => ({
                key: m.month,
                label: m.month,
                values: { own: m.own, third: m.thirdParty },
              }))}
            series={[
              { key: "own", label: "Nossa", color: "#2563eb" },
              { key: "third", label: "Terceiros", color: "#f59e0b" },
            ]}
            formatValue={(v) => `${v} empresas`}
            emptyLabel="Sem registros."
          />
        </section>
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">
            Novas empresas e avisos por mês
          </h2>
          <GroupedBars
            rows={data.months.map((m) => ({
              key: m.month,
              label: m.month,
              values: {
                companies: m.newCompanies,
                email: m.emailsAccepted,
                whatsapp: m.whatsappConfirmed,
              },
            }))}
            series={[
              { key: "companies", label: "Novas empresas", color: "#8b5cf6" },
              { key: "email", label: "Aceito SMTP", color: "#16a34a" },
              {
                key: "whatsapp",
                label: "WhatsApp informado",
                color: "#0d9488",
              },
            ]}
            formatValue={(v) => String(v)}
            emptyLabel="Sem registros."
          />
        </section>
      </div>
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
        {data.historyNote}
      </p>
    </div>
  );
}
