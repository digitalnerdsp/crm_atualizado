import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyCommissionRule,
  getPerformanceEntry,
  issueCommission,
  type PerformanceReport,
} from "@/fetchers/finance/performance";
import { useFinanceMutation } from "@/hooks/mutations/finance/use-finance-mutation";
import { EntryDetail } from "../entry-detail";
import { dateLabel, Field, Modal, money, today } from "../shared";

type Row = PerformanceReport["rows"][number];
function PayableDetail({
  workspaceId,
  id,
  canSettle,
  canUpdate,
  onClose,
}: {
  workspaceId: string;
  id: string;
  canSettle: boolean;
  canUpdate: boolean;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["finance", workspaceId, "entry", id],
    queryFn: () => getPerformanceEntry(workspaceId, id),
  });
  return q.data ? (
    <EntryDetail
      workspaceId={workspaceId}
      entry={q.data}
      canSettle={canSettle}
      canUpdate={canUpdate}
      onClose={onClose}
    />
  ) : (
    <Modal title="Cobrança financeira" onClose={onClose}>
      <p role={q.isError ? "alert" : undefined}>
        {q.error?.message ?? "Carregando…"}
      </p>
    </Modal>
  );
}
function IssueDialog({
  workspaceId,
  row,
  onClose,
}: {
  workspaceId: string;
  row: Row;
  onClose: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const issue = useFinanceMutation(
    workspaceId,
    (dueDate: string) =>
      issueCommission(workspaceId, row.id, {
        requestId,
        dueDate,
        version: row.version,
      }),
    onClose,
  );
  return (
    <Modal
      title="Gerar conta a pagar da comissão"
      description={row.description}
      onClose={onClose}
    >
      <p className="text-sm">
        Vendedor: {row.sellerName}. Comissão disponível até hoje:{" "}
        <strong>{money(row.availableTodayCents)}</strong>.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Será criada uma conta a pagar vinculada à cobrança. Registre o pagamento
        pelo financeiro. Apenas a diferença ainda não emitida será gerada; novas
        baixas podem alterar esse valor antes da confirmação.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          issue.mutate(String(new FormData(e.currentTarget).get("dueDate")));
        }}
      >
        <Field label="Vencimento da comissão">
          <Input type="date" name="dueDate" required defaultValue={today()} />
        </Field>
        <Button type="submit" disabled={issue.isPending}>
          {issue.isPending ? "Gerando…" : "Confirmar conta a pagar"}
        </Button>
      </form>
    </Modal>
  );
}
export function Commissions({
  workspaceId,
  data,
  canIssue,
  canApply,
  canSettle,
  canUpdate,
}: {
  workspaceId: string;
  data: PerformanceReport;
  canIssue: boolean;
  canApply: boolean;
  canSettle: boolean;
  canUpdate: boolean;
}) {
  const [page, setPage] = useState(1);
  const [issue, setIssue] = useState<Row | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const apply = useFinanceMutation(workspaceId, (r: Row) =>
    applyCommissionRule(workspaceId, r.id, r.version),
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Disponível acumulado", data.totals.availableCents],
          ["Pago no período", data.totals.paidPeriodCents],
          ["Emitido a maior / revisar", data.totals.overallocatedCents],
        ].map(([label, value]) => (
          <section key={String(label)} className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <strong className="mt-2 block text-xl">
              {money(Number(value))}
            </strong>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Acumulados até o fim do período nos títulos listados. A lista inclui
        saldos pendentes, competências, recebimentos ou pagamentos de comissão
        no período. Para emitir, o sistema confere o saldo disponível até hoje,
        descontando todas as contas a pagar já emitidas.
      </p>
      {data.totals.overallocatedCents > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/50 p-3 text-sm"
        >
          Há comissões emitidas acima do valor atualmente apurado após
          cancelamento ou estorno. Confira os títulos vinculados: cancele os que
          ainda não foram pagos ou registre o acerto no financeiro, conforme o
          caso.
        </p>
      )}
      <section className="rounded-xl border p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Cobrança / vendedor",
                  "Serviço / regra",
                  "Apurado no período",
                  "Acumulado / emitido",
                  "Ações",
                ].map((h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.slice((page - 1) * 25, page * 25).map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="min-w-52 p-3">
                    <button
                      type="button"
                      onClick={() => setDetail(r.id)}
                      className="text-left font-medium hover:underline"
                    >
                      {r.description}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.sellerName ?? "Sem vendedor"} ·{" "}
                      {dateLabel(r.competenceDate)}
                    </p>
                    <p className="text-xs">
                      {money(r.amountCents)}
                      {r.cancelled ? " · Cancelada" : ""}
                    </p>
                  </td>
                  <td className="min-w-44 p-3">
                    {r.serviceName ?? "Sem serviço"}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.ruleId
                        ? `${r.rateBps / 100}% sobre ${r.basis === "received" ? "recebido" : "faturado"}`
                        : "Sem regra registrada"}
                    </p>
                  </td>
                  <td className="whitespace-nowrap p-3 tabular-nums">
                    {money(r.earnedPeriodCents)}
                  </td>
                  <td className="min-w-44 p-3 text-xs">
                    Apurado {money(r.earnedCents)}
                    <p>Emitido {money(r.issuedCents)}</p>
                    <p>Disponível {money(r.availableCents)}</p>
                    {r.overallocatedCents > 0 && (
                      <p className="text-destructive">
                        A maior {money(r.overallocatedCents)}
                      </p>
                    )}
                  </td>
                  <td className="min-w-52 space-y-2 p-3">
                    {canIssue && r.availableTodayCents > 0 && (
                      <Button size="sm" onClick={() => setIssue(r)}>
                        Gerar conta a pagar
                      </Button>
                    )}
                    {canApply &&
                      !r.ruleId &&
                      !r.cancelled &&
                      r.competenceDate >= today() &&
                      r.sellerId &&
                      r.serviceId && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={apply.isPending}
                          onClick={() => apply.mutate(r)}
                        >
                          Aplicar regra vigente
                        </Button>
                      )}
                    {r.payables.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="block text-left text-xs underline"
                        onClick={() => setDetail(p.id)}
                      >
                        Comissão {money(p.amountCents)} · {dateLabel(p.dueDate)}{" "}
                        · baixado {money(p.paidCents)}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rows.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma cobrança encontrada para o período e os filtros.
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          {page} / {Math.max(1, Math.ceil(data.rows.length / 25))}
          <Button
            variant="outline"
            disabled={page * 25 >= data.rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </section>
      {issue && (
        <IssueDialog
          workspaceId={workspaceId}
          row={issue}
          onClose={() => setIssue(null)}
        />
      )}
      {detail && (
        <PayableDetail
          workspaceId={workspaceId}
          id={detail}
          canSettle={canSettle}
          canUpdate={canUpdate}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
