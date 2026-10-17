import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FinanceMetadata } from "@/fetchers/finance";
import {
  type BillingPayload,
  configureBilling,
  generateBilling,
  getBillingDetail,
  renewBillingContract,
} from "@/fetchers/finance/recurrence";
import { useFinanceMutation } from "@/hooks/mutations/finance/use-finance-mutation";
import {
  dateLabel,
  Field,
  Modal,
  money,
  remaining,
  selectClass,
  today,
} from "./shared";
export function BillingDialog({
  workspaceId,
  contractId,
  metadata,
  canManage,
  canRenew,
  onClose,
}: {
  workspaceId: string;
  contractId: string;
  metadata: FinanceMetadata;
  canManage: boolean;
  canRenew: boolean;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["finance", workspaceId, "contract", contractId],
    queryFn: () => getBillingDetail(workspaceId, contractId),
  });
  const qc = useQueryClient();
  const save = useFinanceMutation(workspaceId, (data: BillingPayload) =>
    configureBilling(workspaceId, contractId, data),
  );
  const generate = useFinanceMutation(workspaceId, () =>
    generateBilling(workspaceId, contractId),
  );
  const renew = useFinanceMutation(
    workspaceId,
    (data: { endsOn: string; note: string }) =>
      renewBillingContract(workspaceId, contractId, data.endsOn, data.note),
    () => {
      qc.invalidateQueries({ queryKey: ["crm"] });
    },
  );
  const data = query.data;
  const busy = save.isPending || generate.isPending || renew.isPending;
  return (
    <Modal
      title={
        data
          ? `Contrato #${data.contract.number} · ${data.contract.title}`
          : "Financeiro do contrato"
      }
      description={
        data?.contract.companyName ?? "Carregando dados do contrato."
      }
      onClose={onClose}
    >
      {query.isLoading ? (
        <p>Carregando…</p>
      ) : query.isError ? (
        <p role="alert" className="text-destructive">
          {query.error.message}
        </p>
      ) : (
        data && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Vigência {dateLabel(data.contract.startsOn)} a{" "}
              {data.contract.endsOn
                ? dateLabel(data.contract.endsOn)
                : "prazo indeterminado"}
              . Equivalente mensal {money(data.contract.monthlyValueCents)}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/dashboard/workspace/$workspaceId/crm/contracts/$contractId"
                params={{ workspaceId, contractId }}
                className="text-sm underline"
              >
                Abrir contrato no comercial
              </Link>
              <Link
                to="/dashboard/workspace/$workspaceId/finance"
                params={{ workspaceId }}
                search={{ contractId }}
                className="text-sm underline"
              >
                Consultar e baixar cobranças
              </Link>
            </div>
            {data.config?.lastWarning && (
              <p
                role="alert"
                className="rounded-lg border border-amber-500/50 p-3 text-sm"
              >
                {data.config.lastWarning}
              </p>
            )}
            <form
              key={`${contractId}-${data.config?.version ?? 0}`}
              className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                save.mutate({
                  enabled: f.get("enabled") === "on",
                  startsOn: String(f.get("startsOn")),
                  horizonMonths: Number(f.get("horizon")),
                  prorateFinal: f.get("prorate") === "on",
                  categoryId: String(f.get("category") ?? "") || null,
                  version: data.config?.version ?? 0,
                });
              }}
            >
              <h3 className="font-semibold sm:col-span-2">
                Geração de contas a receber
              </h3>
              <Field label="Gerar ciclos a partir de">
                <Input
                  type="date"
                  name="startsOn"
                  required
                  min={
                    data.contract.startsOn > today()
                      ? data.contract.startsOn
                      : today()
                  }
                  defaultValue={
                    data.config?.startsOn ??
                    (data.contract.startsOn > today()
                      ? data.contract.startsOn
                      : today())
                  }
                  readOnly={Boolean(data.config)}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Horizonte de geração">
                <select
                  className={selectClass}
                  name="horizon"
                  defaultValue={String(data.config?.horizonMonths ?? 3)}
                  disabled={!canManage}
                >
                  {[1, 3, 6, 12, 24].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "mês" : "meses"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Categoria de receita">
                <select
                  className={selectClass}
                  name="category"
                  defaultValue={data.config?.categoryId ?? ""}
                  disabled={!canManage}
                >
                  <option value="">Sem categoria</option>
                  {metadata.categories
                    .filter((c) => c.direction === "receivable" && c.isActive)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              <div className="space-y-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={data.config?.enabled ?? false}
                    disabled={!canManage}
                  />
                  Ativar geração automática
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="prorate"
                    defaultChecked={data.config?.prorateFinal ?? false}
                    disabled={!canManage}
                  />
                  Último ciclo proporcional aos dias de vigência
                </label>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                A data escolhida inicia o primeiro ciclo integral. Serviços
                anuais geram o valor anual por ciclo. Pausas não cobram ciclos
                iniciados durante a suspensão; a retomada respeita o calendário
                original. Baixas e ciclos anteriores a hoje são preservados.
                Revise lançamentos manuais existentes antes de ativar.
              </p>
              {canManage && (
                <>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" required />
                    Conferi a data inicial e as cobranças manuais para evitar
                    sobreposição.
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <Button type="submit" disabled={busy}>
                      {save.isPending ? "Salvando…" : "Salvar e sincronizar"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !data.config?.enabled}
                      onClick={() => generate.mutate()}
                    >
                      Gerar ou conferir cobranças agora
                    </Button>
                  </div>
                </>
              )}
              {data.config?.lastGeneratedAt && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Última sincronização:{" "}
                  {new Date(data.config.lastGeneratedAt).toLocaleString(
                    "pt-BR",
                  )}
                  . Rotina automática também executa na inicialização e a cada
                  hora.
                </p>
              )}
            </form>
            {canRenew && data.contract.status !== "cancelled" && (
              <form
                className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  renew.mutate({
                    endsOn: String(f.get("endsOn")),
                    note: String(f.get("note")),
                  });
                }}
              >
                <h3 className="font-semibold sm:col-span-2">
                  Renovar vigência
                </h3>
                <Field label="Novo término">
                  <Input
                    type="date"
                    name="endsOn"
                    required
                    min={data.contract.endsOn ?? today()}
                  />
                </Field>
                <Field label="Motivo ou observação">
                  <Input name="note" required maxLength={1000} />
                </Field>
                <Button type="submit" disabled={busy} className="sm:col-span-2">
                  Renovar contrato
                </Button>
              </form>
            )}
            <section className="space-y-2">
              <h3 className="font-semibold">
                Cobranças geradas ({data.entryCount})
              </h3>
              <p className="text-xs text-muted-foreground">
                Até 120 registros recentes. A listagem financeira permite
                consultar todos e registrar baixas.
              </p>
              {!data.entries.length ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma cobrança gerada.
                </p>
              ) : (
                data.entries.map((e) => (
                  <div key={e.id} className="rounded-lg border p-3 text-sm">
                    <p>{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Vencimento {dateLabel(e.dueDate)} · Valor{" "}
                      {money(e.amountCents)} · Saldo{" "}
                      {money(e.cancelledAt ? 0 : remaining(e))}
                      {e.cancelledAt ? " · Cancelada" : ""}
                    </p>
                  </div>
                ))
              )}
            </section>
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Versões financeiras ({data.revisions.length})
              </summary>
              <div className="mt-3 space-y-2">
                {data.revisions.map((r) => (
                  <div className="rounded-lg border p-3 text-xs" key={r.id}>
                    Versão {r.sequence} · efeito em {dateLabel(r.effectiveDate)}{" "}
                    · {r.status} · {r.items.length} serviços ·{" "}
                    {r.sellerName ?? "Sem vendedor"}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )
      )}
    </Modal>
  );
}
