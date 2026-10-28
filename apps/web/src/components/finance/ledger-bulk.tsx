import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  dateLabel,
  entryStatus,
  Field,
  Modal,
  money,
  remaining,
  today,
} from "@/components/finance/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type FinanceEntry, settleEntry } from "@/fetchers/finance";
import { toast } from "@/lib/toast";

/** Contas que ainda aceitam baixa: não canceladas e com saldo. */
export const canSettleEntry = (entry: FinanceEntry) =>
  !entry.cancelledAt && remaining(entry) > 0;

/** CSV em ponto e vírgula e com BOM, que o Excel brasileiro abre direto. */
export function exportEntriesCsv(
  entries: FinanceEntry[],
  partyLabel: string,
  fileName: string,
) {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const amount = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const rows = [
    [
      "Descrição",
      "Competência",
      partyLabel,
      "Vencimento",
      "Valor",
      "Saldo",
      "Situação",
    ],
    ...entries.map((e) => [
      e.description,
      e.competenceDate.slice(0, 7).split("-").reverse().join("/"),
      e.partyName ?? "",
      dateLabel(e.dueDate),
      amount(e.amountCents),
      amount(remaining(e)),
      entryStatus(e),
    ]),
  ];
  const csv = `﻿${rows.map((r) => r.map(cell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Dá baixa pelo saldo total de cada conta marcada, na data escolhida. Cada
 * baixa usa o próprio identificador de requisição; se uma falhar, as demais
 * seguem e o resumo final diz quais não passaram.
 */
export function BulkSettleDialog({
  workspaceId,
  entries,
  onClose,
  onDone,
}: {
  workspaceId: string;
  entries: FinanceEntry[];
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [progress, setProgress] = useState<number | null>(null);
  const total = entries.reduce((sum, e) => sum + remaining(e), 0);
  const busy = progress !== null;

  async function confirm() {
    const failed: string[] = [];
    setProgress(0);
    for (const [index, entry] of entries.entries()) {
      try {
        await settleEntry(workspaceId, entry.id, {
          requestId: crypto.randomUUID(),
          date,
          principalCents: remaining(entry),
          discountCents: 0,
          interestCents: 0,
          fineCents: 0,
          notes: "Baixa em lote",
        });
      } catch (error) {
        failed.push(`${entry.description}: ${(error as Error).message}`);
      }
      setProgress(index + 1);
    }
    await qc.invalidateQueries({ queryKey: ["finance", workspaceId] });
    if (failed.length) {
      toast.error(
        `${entries.length - failed.length} baixa(s) feita(s); ${failed.length} não passaram. ${failed[0]}`,
      );
    } else {
      toast.success(`${entries.length} baixa(s) registrada(s).`);
    }
    onDone();
    onClose();
  }

  return (
    <Modal
      title="Dar baixa nas contas marcadas"
      description="Cada conta é baixada pelo saldo total, sem desconto, juros ou multa."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="space-y-4 p-1">
        <p className="text-sm">
          <strong>{entries.length}</strong> conta(s) · saldo total{" "}
          <strong>{money(total)}</strong>
        </p>
        <Field label="Data da baixa">
          <Input
            type="date"
            value={date}
            max={today()}
            disabled={busy}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || !date} onClick={confirm}>
            {busy
              ? `Baixando ${progress}/${entries.length}…`
              : "Confirmar baixas"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
