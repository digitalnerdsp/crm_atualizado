import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type BiFilters,
  type BiMetric,
  getBiDetail,
} from "@/fetchers/finance/bi";
import { getPerformanceEntry } from "@/fetchers/finance/performance";
import { EntryDetail } from "../entry-detail";
import { dateLabel, Modal, money } from "../shared";
import { formatMetric, labels } from "./shared";
export function BiDetail({
  workspaceId,
  filters,
  metric,
  days = 90,
  onClose,
  canSettle,
  canUpdate,
}: {
  workspaceId: string;
  filters: BiFilters;
  metric: BiMetric;
  days?: number;
  onClose: () => void;
  canSettle: boolean;
  canUpdate: boolean;
}) {
  const [page, setPage] = useState(1);
  const [entry, setEntry] = useState<string | null>(null);
  const q = useQuery({
    queryKey: [
      "finance",
      workspaceId,
      "bi-detail",
      filters,
      metric,
      page,
      days,
    ],
    queryFn: () => getBiDetail(workspaceId, filters, metric, page, days),
  });
  const e = useQuery({
    queryKey: ["finance", workspaceId, "entry", entry],
    queryFn: () => getPerformanceEntry(workspaceId, entry ?? ""),
    enabled: Boolean(entry),
  });
  return (
    <>
      <Modal
        title={`${labels[metric]}${metric === "expiry" || metric === "projection" ? ` · ${days} dias` : ""}`}
        description="Composição do indicador no recorte selecionado."
        onClose={onClose}
      >
        {q.isPending ? (
          <p>Carregando composição…</p>
        ) : q.isError ? (
          <p role="alert">{q.error.message}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-2xl font-semibold">
              {formatMetric(metric, q.data.value)}
            </p>
            <p className="text-xs text-muted-foreground">
              {q.data.note} Referência: {dateLabel(q.data.referenceDate)}.
            </p>
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow className="border-b text-left">
                    <TableHead className="p-2">Origem</TableHead>
                    <TableHead className="p-2">Data</TableHead>
                    <TableHead className="p-2 text-right">
                      Valor / quantidade
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.rows.map((r) => (
                    <TableRow
                      key={`${r.kind}-${r.id}-${r.date}-${r.note}-${r.value}`}
                      className="border-b"
                    >
                      <TableCell className="max-w-72 p-2">
                        <div className="break-words">
                          {r.kind === "entry" ? (
                            <button
                              type="button"
                              className="text-left text-primary hover:underline"
                              onClick={() => setEntry(r.id)}
                            >
                              {r.label}
                            </button>
                          ) : r.kind === "contract" ? (
                            <Link
                              to="/dashboard/workspace/$workspaceId/crm/contracts/$contractId"
                              params={{ workspaceId, contractId: r.id }}
                              className="text-primary hover:underline"
                            >
                              {r.label}
                            </Link>
                          ) : (
                            <Link to="/dashboard/workspace/$workspaceId/taxes">
                              {r.label}
                            </Link>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.note}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap p-2">
                        {dateLabel(r.date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap p-2 text-right tabular-nums">
                        {[
                          "contracts",
                          "expiry",
                          "disabledBilling",
                          "simulation",
                        ].includes(metric)
                          ? r.value
                          : money(r.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!q.data.total && (
              <p className="text-sm text-muted-foreground">
                Nenhum registro compõe este indicador.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {q.data.total} registros · página {page}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={page * 25 >= q.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </div>
        )}
        {entry && e.isPending && <p>Carregando lançamento…</p>}
        {e.isError && <p role="alert">{e.error.message}</p>}
      </Modal>
      {entry && e.data && (
        <EntryDetail
          workspaceId={workspaceId}
          entry={e.data}
          canSettle={canSettle}
          canUpdate={canUpdate}
          onClose={() => setEntry(null)}
        />
      )}
    </>
  );
}
