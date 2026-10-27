import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelEntry,
  type FinanceEntry,
  getHistory,
  reverseSettlement,
  type SettlementPayload,
  settleEntry,
} from "@/fetchers/finance";
import {
  ATTACHMENT_ACCEPT,
  checkAttachment,
  deleteAttachment,
  listAttachments,
  openAttachment,
  uploadAttachment,
} from "@/fetchers/finance/attachments";
import { useFinanceMutation } from "@/hooks/mutations/finance/use-finance-mutation";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import {
  cents,
  dateLabel,
  Field,
  Modal,
  money,
  remaining,
  today,
} from "./shared";
export function EntryDetail({
  workspaceId,
  entry,
  canSettle,
  canUpdate,
  onClose,
}: {
  workspaceId: string;
  entry: FinanceEntry;
  canSettle: boolean;
  canUpdate: boolean;
  onClose: () => void;
}) {
  const permissions = useWorkspacePermission();
  const [requestId] = useState(() => crypto.randomUUID());
  const [action, setAction] = useState<{ settlementId?: string } | null>(null);
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const qc = useQueryClient();
  const pay = useFinanceMutation(
    workspaceId,
    async (json: SettlementPayload) => {
      const settlement = await settleEntry(workspaceId, entry.id, json);
      if (proof) {
        try {
          await uploadAttachment(
            workspaceId,
            entry.id,
            proof,
            (settlement as { id?: string } | undefined)?.id,
          );
        } catch (error) {
          // A baixa já foi registrada; o comprovante pode ser reenviado.
          toast.error(
            `Baixa registrada, mas o comprovante não foi enviado: ${(error as Error).message}`,
          );
        }
      }
      return settlement;
    },
    onClose,
  );
  const attachments = useQuery({
    queryKey: ["finance", workspaceId, "attachments", entry.id],
    queryFn: () => listAttachments(workspaceId, entry.id),
  });
  const addProof = useFinanceMutation(
    workspaceId,
    async (file: File) => uploadAttachment(workspaceId, entry.id, file),
    () =>
      qc.invalidateQueries({
        queryKey: ["finance", workspaceId, "attachments", entry.id],
      }),
  );
  const removeProof = useFinanceMutation(
    workspaceId,
    async (id: string) => deleteAttachment(workspaceId, id),
    () =>
      qc.invalidateQueries({
        queryKey: ["finance", workspaceId, "attachments", entry.id],
      }),
  );
  const change = useFinanceMutation(
    workspaceId,
    async () => {
      if (!action) return;
      if (action.settlementId)
        return reverseSettlement(
          workspaceId,
          entry.id,
          action.settlementId,
          reason,
        );
      return cancelEntry(workspaceId, entry.id, reason);
    },
    onClose,
  );
  const history = useQuery({
    queryKey: ["finance", workspaceId, "history", entry.id],
    queryFn: () => getHistory(workspaceId, entry.id),
  });
  const left = remaining(entry);
  return (
    <Modal
      title={entry.description}
      description={`${entry.partyName} · Valor ${money(entry.amountCents)} · Saldo ${money(left)}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        {entry.contractId && (
          <p className="rounded-lg border p-3 text-sm">
            Cobrança vinculada a contrato. Ajuste valores, vigência ou situação
            pela gestão de contratos e recorrência.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Competência {dateLabel(entry.competenceDate)} · Vencimento{" "}
          {dateLabel(entry.dueDate)} · Parcela {entry.installment}/
          {entry.installmentCount}
        </p>
        {entry.notes && <p className="text-sm">{entry.notes}</p>}
        {canSettle && !entry.cancelledAt && left > 0 && (
          <form
            className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const f = new FormData(event.currentTarget);
                pay.mutate({
                  requestId,
                  date: String(f.get("date")),
                  principalCents: cents(f.get("principal")),
                  discountCents: cents(f.get("discount")),
                  interestCents: cents(f.get("interest")),
                  fineCents: cents(f.get("fine")),
                  notes: String(f.get("notes")),
                });
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <h3 className="font-semibold sm:col-span-2">
              Registrar{" "}
              {entry.direction === "payable" ? "pagamento" : "recebimento"}
            </h3>
            <Field label="Principal a liquidar R$">
              <Input
                name="principal"
                required
                inputMode="decimal"
                defaultValue={(left / 100).toFixed(2)}
              />
            </Field>
            <Field label="Data da baixa">
              <Input
                name="date"
                type="date"
                required
                max={today()}
                defaultValue={today()}
              />
            </Field>
            <Field label="Desconto R$">
              <Input
                name="discount"
                required
                inputMode="decimal"
                defaultValue="0,00"
              />
            </Field>
            <Field label="Juros R$">
              <Input
                name="interest"
                required
                inputMode="decimal"
                defaultValue="0,00"
              />
            </Field>
            <Field label="Multa R$">
              <Input
                name="fine"
                required
                inputMode="decimal"
                defaultValue="0,00"
              />
            </Field>
            <Field label="Justificativa dos ajustes">
              <Input name="notes" maxLength={2000} />
            </Field>
            <Field label="Comprovante (imagem ou PDF, até 10 MB)">
              <Input
                type="file"
                accept={ATTACHMENT_ACCEPT}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  try {
                    if (file) checkAttachment(file);
                    setProof(file);
                  } catch (error) {
                    toast.error((error as Error).message);
                    e.target.value = "";
                    setProof(null);
                  }
                }}
              />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Valor efetivo = principal − desconto + juros + multa. O saldo do
              título diminui pelo principal informado.
            </p>
            <Button
              type="submit"
              className="sm:col-span-2"
              disabled={pay.isPending}
            >
              {pay.isPending ? "Registrando…" : "Confirmar baixa"}
            </Button>
          </form>
        )}
        <section className="space-y-2">
          <h3 className="font-semibold">Baixas e estornos</h3>
          {entry.settlements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma baixa registrada.
            </p>
          ) : (
            entry.settlements.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p>
                    {dateLabel(s.date)} · Principal {money(s.principalCents)} ·
                    Efetivo{" "}
                    {money(
                      s.principalCents -
                        s.discountCents +
                        s.interestCents +
                        s.fineCents,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.reversedAt
                      ? `Estornado: ${s.reverseReason}`
                      : s.notes || "Sem ajustes"}
                  </p>
                </div>
                {canSettle &&
                  permissions.canReverseFinance() &&
                  !s.reversedAt && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pay.isPending || change.isPending}
                      onClick={() => {
                        setAction({ settlementId: s.id });
                        setReason("");
                      }}
                    >
                      Estornar
                    </Button>
                  )}
              </div>
            ))
          )}
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">Comprovantes</h3>
          {attachments.isLoading ? (
            <p className="text-sm">Carregando comprovantes…</p>
          ) : !attachments.data?.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhum comprovante anexado.
            </p>
          ) : (
            attachments.data.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() =>
                    openAttachment(workspaceId, a.id).catch((error) =>
                      toast.error((error as Error).message),
                    )
                  }
                >
                  {a.filename} · {(a.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                  {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                </button>
                {canSettle && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={removeProof.isPending}
                    onClick={() => removeProof.mutate(a.id)}
                  >
                    Remover
                  </Button>
                )}
              </div>
            ))
          )}
          {canSettle && (
            <Input
              type="file"
              accept={ATTACHMENT_ACCEPT}
              disabled={addProof.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  checkAttachment(file);
                  addProof.mutate(file);
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            />
          )}
        </section>
        {canUpdate &&
          permissions.canCancelFinance() &&
          !entry.contractId &&
          !entry.cancelledAt &&
          left === entry.amountCents && (
            <Button
              variant="destructive"
              disabled={change.isPending}
              onClick={() => {
                setAction({});
                setReason("");
              }}
            >
              Cancelar lançamento
            </Button>
          )}
        {action && (
          <form
            className="space-y-3 rounded-lg border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              change.mutate();
            }}
          >
            <Field
              label={
                action.settlementId
                  ? "Motivo do estorno"
                  : "Motivo do cancelamento"
              }
            >
              <Input
                required
                minLength={1}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={change.isPending || !reason.trim()}
              >
                Confirmar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAction(null)}
              >
                Voltar
              </Button>
            </div>
          </form>
        )}
        <section className="space-y-2">
          <h3 className="font-semibold">Histórico de alterações</h3>
          {history.isLoading ? (
            <p className="text-sm">Carregando histórico…</p>
          ) : history.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível carregar o histórico.
            </p>
          ) : (
            history.data?.map((row) => (
              <details key={row.id} className="rounded-lg border p-3 text-xs">
                <summary className="cursor-pointer">
                  {new Date(row.createdAt).toLocaleString("pt-BR")} ·{" "}
                  {row.actor ?? "Usuário removido"} · {row.summary}
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(
                    { antes: row.before, depois: row.after },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))
          )}
        </section>
      </div>
    </Modal>
  );
}
