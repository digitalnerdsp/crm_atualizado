import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TaxReport } from "@/fetchers/finance/taxes";
import { dateLabel, Modal, money } from "../shared";

type Saved = TaxReport["rows"][number];
export function TaxHistory({ data }: { data: TaxReport }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Saved | null>(null);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Simulações salvas ({data.total})</h2>
      <p className="text-sm text-muted-foreground">
        Cada registro preserva os parâmetros usados. Alterar ou inativar um
        perfil não modifica este histórico.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Simulação",
                "Perfil",
                "Bruto",
                "Encargos e custo",
                "Líquido",
                "Ações",
              ].map((h) => (
                <th key={h} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice((page - 1) * 25, page * 25).map((s) => (
              <tr className="border-t align-top" key={s.id}>
                <td className="min-w-48 p-3 font-medium">
                  {s.title}
                  <p className="mt-1 text-xs font-normal text-muted-foreground">
                    {dateLabel(s.date)} · {s.serviceName ?? "Sem serviço"} ·{" "}
                    {s.sellerName ?? "Sem vendedor"}
                  </p>
                </td>
                <td className="min-w-40 p-3 text-xs">
                  {s.profileName} · v{s.profileVersion}
                </td>
                <td className="whitespace-nowrap p-3">
                  {money(s.result.grossCents)}
                </td>
                <td className="min-w-44 p-3 text-xs">
                  Impostos {money(s.result.taxCents)}
                  <p>Taxas {money(s.result.feeCents)}</p>
                  <p>Comissão {money(s.result.commissionCents)}</p>
                  <p>Custo {money(s.result.costCents)}</p>
                </td>
                <td
                  className={`whitespace-nowrap p-3 ${s.result.netCents < 0 ? "text-destructive" : ""}`}
                >
                  {money(s.result.netCents)}
                </td>
                <td className="p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(s)}
                  >
                    Detalhar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.rows.length && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma simulação salva para estes filtros.
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
        {page} / {Math.max(1, Math.ceil(data.total / 25))}
        <Button
          variant="outline"
          disabled={page * 25 >= data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
      {selected && (
        <Modal
          title={selected.title}
          description={`${selected.profileName} · versão ${selected.profileVersion} · ${dateLabel(selected.date)}`}
          onClose={() => setSelected(null)}
        >
          <div className="space-y-3 text-sm">
            <p>
              {selected.input.mode === "net"
                ? "Líquido desejado"
                : "Preço informado"}
              : {money(selected.input.amountCents)}
            </p>
            <p className="font-semibold">
              Venda {money(selected.result.grossCents)} · Líquido{" "}
              {money(selected.result.netCents)}
            </p>
            {selected.result.breakdown.map((i) => (
              <p key={i.name}>
                {i.name}: {i.rateBps / 100}% + {money(i.fixedCents)} ={" "}
                {money(i.amountCents)}
              </p>
            ))}
            <p>
              Comissão {money(selected.result.commissionCents)} · Custo{" "}
              {money(selected.result.costCents)}
            </p>
            <p className="text-muted-foreground">{selected.commissionSource}</p>
            {selected.notes && (
              <p className="text-muted-foreground">{selected.notes}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Salvo em {new Date(selected.createdAt).toLocaleString("pt-BR")}.
              Este registro é uma simulação e não cria títulos no financeiro.
            </p>
          </div>
        </Modal>
      )}
    </section>
  );
}
