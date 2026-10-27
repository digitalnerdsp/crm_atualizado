import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { dateLabel, Field } from "@/components/finance/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getDigestConfig,
  getDigestPreview,
  retryDigestRun,
  saveDigestConfig,
} from "@/fetchers/crm/hosting";
import { useHostingMutation } from "@/hooks/mutations/crm/use-hosting-mutation";

const runStates = {
  pending: "Aguardando envio ou nova tentativa",
  sent: "Enviado à equipe",
  failed: "Falhou: reenvie manualmente",
} as const;
const deliveryStates = {
  pending: "Pendente",
  accepted: "Aceito pelo servidor de e-mail",
  failed: "Falhou",
} as const;

export function HostingDigestSettings({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const config = useQuery({
    queryKey: ["crm", "hosting-digest", workspaceId],
    queryFn: () => getDigestConfig(workspaceId),
  });
  const preview = useQuery({
    queryKey: ["crm", "hosting-digest-preview", workspaceId],
    queryFn: () => getDigestPreview(workspaceId),
  });
  const save = useHostingMutation(
    (json: Parameters<typeof saveDigestConfig>[1]) =>
      saveDigestConfig(workspaceId, json),
  );
  const retry = useHostingMutation((id: string) =>
    retryDigestRun(workspaceId, id),
  );
  const [error, setError] = useState<string | null>(null);
  if (config.isLoading) return <p>Carregando configuração…</p>;
  if (config.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {config.error.message}
      </p>
    );
  const data = config.data;
  if (!data) return null;
  const s = data.settings;
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Aviso interno de renovação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Todos os dias, a partir das 8h, a equipe escolhida recebe um e-mail
            em lista com os clientes de hospedagem de terceiros que estão perto
            de renovar, com o provedor atual de cada um, para oferecer a nossa
            hospedagem antes da renovação. Nada é enviado ao cliente.
          </p>
        </div>
        <form
          key={s.version}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const f = new FormData(e.currentTarget);
            const days = Number(f.get("days"));
            if (!Number.isInteger(days) || days < 1 || days > 365) {
              setError("Informe um número inteiro de dias entre 1 e 365.");
              return;
            }
            const marks = [days];
            save.mutate({
              enabled: f.get("enabled") === "on",
              marks,
              includeOwner: f.get("includeOwner") === "on",
              recipientUserIds: f.getAll("recipient").map(String),
              version: s.version,
            });
          }}
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
            Aviso interno ativado
          </label>
          <Field label="Dias de antecedência">
            <Input
              name="days"
              defaultValue={s.marks[0] ?? 30}
              inputMode="numeric"
              className="max-w-xs"
            />
          </Field>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">
              Quem recebe a lista completa
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.members.map((m) => (
                <label
                  key={m.userId}
                  className="flex items-start gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="recipient"
                    value={m.userId}
                    defaultChecked={data.recipientUserIds.includes(m.userId)}
                  />
                  <span>
                    {m.name}
                    <span className="block text-xs text-muted-foreground">
                      {m.email}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Estes usuários recebem todos os clientes da lista, mesmo os de
              outros responsáveis.
            </p>
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="includeOwner"
              defaultChecked={s.includeOwner}
              className="mt-1"
            />
            Enviar também ao responsável de cada empresa, apenas com as empresas
            dele
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar configuração"}
          </Button>
        </form>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">O que seria avisado hoje</h2>
        {preview.isLoading ? (
          <p className="text-sm">Calculando…</p>
        ) : preview.data?.items.length ? (
          <ul className="space-y-2 text-sm">
            {preview.data.items.map((i) => (
              <li
                key={`${i.companyId}-${i.markDays}`}
                className="rounded-lg border p-3"
              >
                <span className="font-medium">{i.companyName}</span>
                {i.domain ? ` (${i.domain})` : ""} ·{" "}
                {i.provider || "provedor não informado"}
                <span className="block text-xs text-muted-foreground">
                  Renova em {dateLabel(i.renewsOn)} ({i.daysRemaining} dias) ·
                  faixa de {i.markDays} dias
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum cliente entra no aviso de hoje.
          </p>
        )}
        {preview.data && !preview.data.enabled && (
          <p className="text-xs text-amber-600">
            O aviso está desativado: esta lista é só uma prévia e nada será
            enviado.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Histórico de envios</h2>
        {!data.runs.length && (
          <p className="text-sm text-muted-foreground">
            Nenhum aviso enviado ainda.
          </p>
        )}
        {data.runs.map((r) => (
          <article
            key={r.id}
            className="space-y-2 rounded-lg border p-3 text-sm"
          >
            <p className="font-medium">
              {new Date(r.createdAt).toLocaleString("pt-BR")} · {r.companies}{" "}
              {r.companies === 1 ? "cliente" : "clientes"} ·{" "}
              {runStates[r.status]}
            </p>
            <ul className="space-y-1 text-xs">
              {r.deliveries.map((d) => (
                <li key={d.userId}>
                  {d.name} ({d.email}): {deliveryStates[d.status]}
                  {d.error ? ` · ${d.error}` : ""}
                </li>
              ))}
            </ul>
            {r.status === "failed" && (
              <Button
                size="sm"
                variant="outline"
                disabled={retry.isPending}
                onClick={() => retry.mutate(r.id)}
              >
                Reenviar
              </Button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
