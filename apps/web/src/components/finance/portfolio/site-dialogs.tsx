import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { getEntries } from "@/fetchers/finance";
import {
  attachEntry,
  type PortfolioFilters,
  type PortfolioMeta,
  type Site,
  type SiteInput,
  saveRate,
  saveSite,
  saveWorker,
  type WorkerInput,
} from "@/fetchers/finance/portfolio";
import { toast } from "@/lib/toast";
import { cents, Field, Modal, money, today } from "../shared";
import { modes } from "./shared";
export function SiteEditor({
  workspaceId,
  meta,
  site,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  meta: PortfolioMeta;
  site?: Site;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState(site?.companyId ?? "");
  return (
    <Modal
      title={site ? "Configurar projeto de site" : "Novo projeto de site"}
      description="Somente desenvolvimento de sites. Não inclui tráfego pago ou social media."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const body: SiteInput = {
              name: String(f.get("name")),
              companyId: company,
              contractId: String(f.get("contract") || "") || null,
              status: String(f.get("status")) as "active" | "completed",
              includeScenario: f.get("scenario") === "on",
              version: site?.version ?? 0,
            };
            await saveSite(workspaceId, body, site?.id);
            onSaved();
            onClose();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Nome do projeto de site">
          <Input
            required
            name="name"
            maxLength={200}
            defaultValue={site?.name ?? ""}
          />
        </Field>
        <Field label="Cliente">
          <NativeSelect
            required
            value={company}
            disabled={Boolean(site)}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="">Selecione</option>
            {meta.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Contrato de referência (opcional)">
          <NativeSelect name="contract" defaultValue={site?.contractId ?? ""}>
            <option value="">Sem contrato</option>
            {meta.contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <p className="text-xs text-muted-foreground">
          O servidor confere o cliente do contrato. Vincular contrato não
          importa suas cobranças automaticamente: os títulos são conferidos e
          vinculados individualmente.
        </p>
        <Field label="Situação">
          <NativeSelect name="status" defaultValue={site?.status ?? "active"}>
            <option value="active">Em produção</option>
            <option value="completed">Concluído</option>
          </NativeSelect>
        </Field>
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            name="scenario"
            defaultChecked={site?.includeScenario ?? false}
          />
          Conferi os custos já lançados e quero habilitar o cenário que desconta
          estimativas ainda não conciliadas. Não substitui o resultado
          financeiro.
        </label>
        <Button type="submit" disabled={busy}>
          Salvar projeto de site
        </Button>
      </form>
    </Modal>
  );
}
export function RateEditor({
  workspaceId,
  meta,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  meta: PortfolioMeta;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Nova vigência de custo/hora"
      description="Taxas não podem ser editadas ou excluídas. A primeira vigência pode alcançar registros históricos; confira antes de salvar."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await saveRate(workspaceId, {
              userId: String(f.get("user")),
              effectiveOn: String(f.get("date")),
              hourlyCents: cents(f.get("amount")),
            });
            onSaved();
            onClose();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Colaborador">
          <NativeSelect required name="user">
            <option value="">Selecione</option>
            {meta.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Vigência inicial">
          <Input required type="date" name="date" defaultValue={today()} />
        </Field>
        <Field label="Custo/hora interno R$">
          <Input required inputMode="decimal" name="amount" />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" required />
          Conferi a vigência e os efeitos sobre os apontamentos existentes.
        </label>
        <Button type="submit" disabled={busy}>
          Cadastrar vigência
        </Button>
      </form>
    </Modal>
  );
}
export function CostEditor({
  workspaceId,
  site,
  meta,
  filters,
  mode,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  site: Site;
  meta: PortfolioMeta;
  filters: PortfolioFilters;
  mode: "worker" | "entry";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: [
      "finance",
      workspaceId,
      "site-entry-options",
      site.id,
      filters,
      page,
      mode,
    ],
    queryFn: () =>
      getEntries(
        workspaceId,
        {
          from: filters.from,
          to: filters.to,
          dateBasis: "competence",
          companyId: site.companyId,
          direction: mode === "worker" ? "payable" : undefined,
        },
        page,
      ),
  });
  const worker = site.workers.find((w) => w.userId === user);
  const oldSource = worker?.sourceEntryId;
  return (
    <Modal
      title={
        mode === "worker"
          ? "Origem do custo do colaborador"
          : "Vincular lançamento ao site"
      }
      description="Um título só pode pertencer a um projeto. Registre receitas e custos com o cliente correto no financeiro."
      onClose={onClose}
    >
      {q.isError && <p role="alert">{q.error.message}</p>}
      <form
        key={user}
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            if (mode === "entry")
              await attachEntry(workspaceId, site.id, String(f.get("source")));
            else {
              const body: WorkerInput = {
                userId: user,
                mode: String(f.get("mode")) as WorkerInput["mode"],
                fixedCents: cents(f.get("fixed")),
                chargedOn: String(f.get("date")),
                sourceEntryId: String(f.get("source") || "") || null,
                version: worker?.version ?? 0,
              };
              await saveWorker(workspaceId, site.id, body);
            }
            onSaved();
            onClose();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "worker" && (
          <>
            <Field label="Colaborador">
              <NativeSelect
                required
                value={user}
                onChange={(e) => setUser(e.target.value)}
              >
                <option value="">Selecione</option>
                {meta.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Modelo de custo">
              <NativeSelect
                name="mode"
                defaultValue={
                  worker?.mode === "unconfigured"
                    ? "internal"
                    : (worker?.mode ?? "internal")
                }
              >
                {Object.entries(modes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Preço fechado R$ — outros modelos usam zero">
              <Input
                required
                name="fixed"
                defaultValue={String((worker?.fixedCents ?? 0) / 100)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Data do custo fixo">
              <Input
                required
                type="date"
                name="date"
                defaultValue={worker?.chargedOn ?? today()}
              />
            </Field>
          </>
        )}
        <Field
          label={
            mode === "worker"
              ? "Conta a pagar que já representa este custo (opcional)"
              : "Lançamento financeiro"
          }
        >
          <NativeSelect
            required={mode === "entry"}
            name="source"
            defaultValue={oldSource ?? ""}
          >
            <option value="">
              {mode === "worker"
                ? "Ainda não lançado / estimativa separada"
                : "Selecione"}
            </option>
            {oldSource && !q.data?.items.some((e) => e.id === oldSource) && (
              <option value={oldSource}>Origem atual: {oldSource}</option>
            )}
            {q.data?.items
              .filter((e) => !e.cancelledAt && e.kind === "operating")
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.description} · {money(e.amountCents)} · {e.competenceDate}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <p className="text-xs text-muted-foreground">
          Opções do período filtrado: {filters.from} a {filters.to}. Ajuste o
          período da carteira para consultar outros títulos.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!q.data || page * 50 >= q.data.total}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
        {mode === "worker" && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required />
            Conferi se a conta a pagar indicada já representa o custo deste
            colaborador. Ela não será descontada novamente como estimativa.
          </label>
        )}
        <Button type="submit" disabled={busy || q.isPending}>
          Salvar vínculo
        </Button>
      </form>
    </Modal>
  );
}
