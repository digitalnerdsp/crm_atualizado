import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  getTaxProfileHistory,
  type ProfilePayload,
  saveTaxProfile,
  type TaxConfig,
} from "@/fetchers/finance/taxes";
import { useFinanceMutation } from "@/hooks/mutations/finance/use-finance-mutation";
import { toast } from "@/lib/toast";
import { cents, Field, Modal, money } from "../shared";

type Profile = TaxConfig["profiles"][number];
export function parseRate(value: string) {
  const raw = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) >= 100)
    throw new Error(
      "Percentual deve estar entre 0 e 99,99, com até duas casas decimais.",
    );
  return Math.round(Number(raw) * 100);
}
function ProfileForm({
  workspaceId,
  profile,
  onClose,
}: {
  workspaceId: string;
  profile?: Profile;
  onClose: () => void;
}) {
  const [items, setItems] = useState(
    () =>
      profile?.items.map((i) => ({
        key: crypto.randomUUID(),
        name: i.name,
        kind: i.kind,
        rate: String(i.rateBps / 100),
        fixed: String(i.fixedCents / 100),
      })) ?? [
        {
          key: crypto.randomUUID(),
          name: "",
          kind: "tax" as "tax" | "fee",
          rate: "0",
          fixed: "0",
        },
      ],
  );
  const save = useFinanceMutation(
    workspaceId,
    (json: ProfilePayload) => saveTaxProfile(workspaceId, json, profile?.id),
    onClose,
  );
  const update = (
    key: string,
    field: "name" | "kind" | "rate" | "fixed",
    value: string,
  ) =>
    setItems((rows) =>
      rows.map((i) => (i.key === key ? { ...i, [field]: value } : i)),
    );
  return (
    <Modal
      title={
        profile
          ? "Editar perfil de taxas e impostos"
          : "Novo perfil de taxas e impostos"
      }
      description="Informe os percentuais e valores fixos aplicáveis à sua venda. Não há alíquotas fiscais preenchidas automaticamente."
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const f = new FormData(e.currentTarget);
            save.mutate({
              name: String(f.get("name")),
              notes: String(f.get("notes")),
              isActive: f.get("active") === "on",
              version: profile?.version ?? 0,
              items: items.map((i) => ({
                name: i.name,
                kind: i.kind,
                rateBps: parseRate(i.rate || "0"),
                fixedCents: cents(i.fixed || "0"),
              })),
            });
          } catch (error) {
            toast.error((error as Error).message);
          }
        }}
      >
        <Field label="Nome do perfil">
          <Input
            name="name"
            required
            maxLength={120}
            defaultValue={profile?.name ?? ""}
            placeholder="Ex.: Venda por cartão"
          />
        </Field>
        <Field label="Observações e referência dos parâmetros">
          <Input
            name="notes"
            maxLength={2000}
            defaultValue={profile?.notes ?? ""}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={profile?.isActive ?? true}
          />
          Perfil ativo para novos cálculos
        </label>
        <div className="space-y-3">
          {items.map((i) => (
            <fieldset
              key={i.key}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
            >
              <Field label="Nome do item">
                <Input
                  required
                  maxLength={80}
                  value={i.name}
                  onChange={(e) => update(i.key, "name", e.target.value)}
                />
              </Field>
              <Field label="Tipo">
                <NativeSelect
                  value={i.kind}
                  onChange={(e) => update(i.key, "kind", e.target.value)}
                >
                  <option value="tax">Imposto</option>
                  <option value="fee">Taxa</option>
                </NativeSelect>
              </Field>
              <Field label="Percentual sobre a venda (%)">
                <Input
                  inputMode="decimal"
                  value={i.rate}
                  onChange={(e) => update(i.key, "rate", e.target.value)}
                />
              </Field>
              <Field label="Valor fixo por venda (R$)">
                <Input
                  inputMode="decimal"
                  value={i.fixed}
                  onChange={(e) => update(i.key, "fixed", e.target.value)}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                className="sm:col-span-2"
                onClick={() =>
                  setItems((rows) => rows.filter((row) => row.key !== i.key))
                }
              >
                Remover {i.name || "item"}
              </Button>
            </fieldset>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={items.length >= 20}
          onClick={() =>
            setItems((rows) => [
              ...rows,
              {
                key: crypto.randomUUID(),
                name: "",
                kind: "fee",
                rate: "0",
                fixed: "0",
              },
            ])
          }
        >
          Adicionar taxa ou imposto
        </Button>
        <p className="text-xs text-muted-foreground">
          Até 20 itens. Percentuais somam sobre o mesmo preço bruto; valores
          fixos são cobrados uma vez por venda. A soma dos percentuais,
          incluindo a comissão na calculadora, deve ficar abaixo de 100%. Cada
          alteração cria uma versão e preserva as simulações salvas.
        </p>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar perfil"}
        </Button>
      </form>
    </Modal>
  );
}
function History({
  workspaceId,
  id,
  onClose,
}: {
  workspaceId: string;
  id: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["finance", workspaceId, "tax-profile", id],
    queryFn: () => getTaxProfileHistory(workspaceId, id),
  });
  return (
    <Modal title="Histórico de versões do perfil" onClose={onClose}>
      {q.isLoading ? (
        <p>Carregando…</p>
      ) : q.error ? (
        <p role="alert">{q.error.message}</p>
      ) : (
        <div className="space-y-3">
          {q.data?.revisions.map((r) => (
            <section key={r.id} className="rounded-lg border p-3">
              <h3 className="font-semibold">
                {r.name} · versão {r.sequence}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleString("pt-BR")}
              </p>
              {r.items.map((i) => (
                <p key={i.name} className="mt-2 text-sm">
                  {i.name}: {i.rateBps / 100}% + {money(i.fixedCents)} por venda
                </p>
              ))}
              {r.notes && (
                <p className="mt-2 text-sm text-muted-foreground">{r.notes}</p>
              )}
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
export function TaxProfiles({
  workspaceId,
  data,
  canManage,
}: {
  workspaceId: string;
  data: TaxConfig;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Perfis de taxas e impostos</h2>
        {canManage && (
          <Button onClick={() => setEditing("new")}>Novo perfil</Button>
        )}
      </div>
      {!data.profiles.length && (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">
          Nenhum perfil cadastrado. Crie um perfil para começar a calcular.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.profiles.map((p) => (
          <section
            key={p.id}
            className="space-y-3 rounded-xl border bg-card p-5"
          >
            <h3 className="font-semibold">{p.name}</h3>
            <p className="text-xs text-muted-foreground">
              Versão {p.version} · {p.isActive ? "Ativo" : "Inativo"}
            </p>
            {p.items.map((i) => (
              <div
                key={i.name}
                className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"
              >
                <span>
                  {i.name}{" "}
                  <span className="text-muted-foreground">
                    ({i.kind === "tax" ? "imposto" : "taxa"})
                  </span>
                </span>
                <span>
                  {i.rateBps / 100}% + {money(i.fixedCents)}
                </span>
              </div>
            ))}
            {p.notes && (
              <p className="text-sm text-muted-foreground">{p.notes}</p>
            )}
            <div className="flex gap-2">
              {canManage && (
                <Button variant="outline" onClick={() => setEditing(p)}>
                  Editar perfil
                </Button>
              )}
              <Button variant="ghost" onClick={() => setHistory(p.id)}>
                Histórico
              </Button>
            </div>
          </section>
        ))}
      </div>
      {editing && (
        <ProfileForm
          workspaceId={workspaceId}
          profile={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}{" "}
      {history && (
        <History
          workspaceId={workspaceId}
          id={history}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  );
}
