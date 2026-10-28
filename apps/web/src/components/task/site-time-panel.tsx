import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { hours } from "@/components/finance/portfolio/shared";
import { Field } from "@/components/finance/shared";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  getSiteOptions,
  getSiteSummary,
  saveTaskPlan,
} from "@/fetchers/finance/site-work";
import createTime from "@/fetchers/time-entry/create-time-entry";
import getTimes from "@/fetchers/time-entry/get-time-entries";
import updateTime from "@/fetchers/time-entry/update-time-entry";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
export function SiteTimeBadge({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const q = useQuery({
    queryKey: ["site-time", projectId],
    queryFn: () => getSiteSummary(projectId),
    staleTime: 15000,
  });
  const r = q.data?.find((t) => t.taskId === taskId);
  if (!r) return null;
  return (
    <div
      className="mt-2 rounded border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
      title={`${r.name}. Horas de todos que apontaram; responsável atual não substitui autoria histórica.`}
    >
      Site · previsto {hours(r.estimateMinutes * 60)} · feito {hours(r.seconds)}{" "}
      · {r.seconds > r.estimateMinutes * 60 ? "excedente" : "restante"}{" "}
      {hours(Math.abs(r.seconds - r.estimateMinutes * 60))}
      {r.running ? ` · ${r.running} em andamento` : ""}
    </div>
  );
}
export function SiteTimePanel({
  workspaceId,
  projectId,
  taskId,
}: {
  workspaceId: string;
  projectId: string;
  taskId: string;
}) {
  const p = useWorkspacePermission();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const options = useQuery({
    queryKey: ["site-options", taskId],
    queryFn: () => getSiteOptions(taskId),
  });
  const summary = useQuery({
    queryKey: ["site-time", projectId],
    queryFn: () => getSiteSummary(projectId),
    enabled: Boolean(options.data?.link),
    staleTime: 15000,
  });
  const times = useQuery({
    queryKey: ["time-entries", taskId],
    queryFn: () => getTimes(taskId),
    enabled: Boolean(options.data?.link),
  });
  const users = useGetActiveWorkspaceUsers(workspaceId);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["site-time", projectId] });
    qc.invalidateQueries({ queryKey: ["site-options", taskId] });
    qc.invalidateQueries({ queryKey: ["time-entries", taskId] });
    qc.invalidateQueries({ queryKey: ["finance", workspaceId] });
  };
  if (options.isError)
    return (
      <p role="alert" className="text-xs text-destructive">
        {options.error.message}
      </p>
    );
  if (!options.data) return null;
  const { link, sites } = options.data;
  const row = summary.data?.find((t) => t.taskId === taskId);
  return (
    <section className="my-4 space-y-3 rounded-xl border p-4">
      <h3 className="text-sm font-semibold">Horas do projeto de site</h3>
      <p className="text-xs text-muted-foreground">
        Somente desenvolvimento de sites. Tráfego pago e social media não entram
        neste acompanhamento. Custos e margens ficam no financeiro.
      </p>
      {p.canUpdateTasks() && (
        <form
          key={link?.version ?? 0}
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await saveTaskPlan(
                taskId,
                link?.siteId ?? String(f.get("site")),
                Math.round(Number(f.get("hours")) * 60),
                link?.version ?? 0,
              );
              refresh();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Site do cliente">
            <NativeSelect
              name="site"
              required
              defaultValue={link?.siteId ?? ""}
              disabled={Boolean(link)}
            >
              <option value="">Selecione</option>
              {link && !sites.some((s) => s.id === link.siteId) && (
                <option value={link.siteId}>
                  {row?.name ?? "Site vinculado"}
                </option>
              )}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Horas previstas no card">
            <Input
              name="hours"
              required
              type="number"
              min="0"
              max="10000"
              step="0.05"
              defaultValue={(link?.estimateMinutes ?? 0) / 60}
            />
          </Field>
          <Button
            type="submit"
            disabled={busy || (!sites.length && !link)}
            className="self-end"
          >
            Salvar planejamento
          </Button>
        </form>
      )}
      {!options.data.companyId && (
        <p className="text-xs text-muted-foreground">
          Vincule o cliente da tarefa para selecionar um projeto de site.
        </p>
      )}
      {options.data.companyId && !sites.length && !link && (
        <p className="text-xs text-muted-foreground">
          O financeiro ainda não cadastrou um projeto de site ativo para este
          cliente.
        </p>
      )}
      {link && (
        <>
          <p className="text-sm">
            Previsto{" "}
            {hours((row?.estimateMinutes ?? link.estimateMinutes) * 60)} ·
            realizado {hours(row?.seconds ?? 0)} · em andamento{" "}
            {row?.running ?? 0}
          </p>
          <div className="space-y-1">
            {row?.contributors.map((c) => (
              <p
                key={c.userId ?? "unknown"}
                className="text-xs text-muted-foreground"
              >
                {users.data?.members.find((m) => m.userId === c.userId)?.user
                  .name ?? "Colaborador"}
                : {hours(c.seconds)}
              </p>
            ))}
          </div>
          {p.canUpdateTasks() && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={
                  busy ||
                  Boolean(
                    times.data?.some(
                      (t) => t.userId === user?.id && !t.endTime,
                    ),
                  )
                }
                onClick={async () => {
                  setBusy(true);
                  try {
                    await createTime({
                      taskId,
                      startTime: new Date().toISOString(),
                      description: "Produção de site",
                    });
                    refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Iniciar meu tempo
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setManual(!manual)}
              >
                Registrar intervalo concluído
              </Button>
            </div>
          )}
          {manual && p.canUpdateTasks() && (
            <form
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                try {
                  await createTime({
                    taskId,
                    startTime: new Date(String(f.get("start"))).toISOString(),
                    endTime: new Date(String(f.get("end"))).toISOString(),
                    description: String(f.get("description") ?? ""),
                  });
                  setManual(false);
                  refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Início">
                <Input required type="datetime-local" name="start" />
              </Field>
              <Field label="Fim">
                <Input required type="datetime-local" name="end" />
              </Field>
              <Field label="Descrição">
                <Input name="description" maxLength={1000} />
              </Field>
              <Button type="submit" disabled={busy}>
                Registrar minhas horas
              </Button>
            </form>
          )}
          <div className="space-y-2">
            {times.data?.map((t) => (
              <div key={t.id} className="rounded-lg border p-2 text-xs">
                <p>
                  {users.data?.members.find((m) => m.userId === t.userId)?.user
                    .name ?? "Colaborador"}{" "}
                  · {new Date(t.startTime).toLocaleString("pt-BR")} ·{" "}
                  {t.endTime
                    ? hours(
                        Math.max(
                          0,
                          (Date.parse(t.endTime) - Date.parse(t.startTime)) /
                            1000,
                        ),
                      )
                    : "Em andamento"}
                </p>
                {t.userId === user?.id && p.canUpdateTasks() && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">
                      Corrigir meu intervalo
                    </summary>
                    <form
                      className="mt-2 grid gap-2 sm:grid-cols-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        setBusy(true);
                        try {
                          await updateTime({
                            id: t.id,
                            startTime: new Date(
                              String(f.get("start")),
                            ).toISOString(),
                            endTime: new Date(
                              String(f.get("end")),
                            ).toISOString(),
                            description: String(f.get("description")),
                          });
                          refresh();
                          toast.success(
                            "Intervalo corrigido; alteração registrada no histórico.",
                          );
                        } catch (e) {
                          toast.error((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Field label="Início">
                        <Input
                          name="start"
                          type="datetime-local"
                          required
                          defaultValue={localTime(t.startTime)}
                        />
                      </Field>
                      <Field label="Fim">
                        <Input
                          name="end"
                          type="datetime-local"
                          required
                          defaultValue={localTime(
                            t.endTime ?? new Date().toISOString(),
                          )}
                        />
                      </Field>
                      <Field label="Descrição / motivo da correção">
                        <Input
                          name="description"
                          required
                          minLength={3}
                          maxLength={1000}
                          defaultValue={t.description ?? ""}
                        />
                      </Field>
                      <Button type="submit" disabled={busy}>
                        Salvar correção
                      </Button>
                    </form>
                  </details>
                )}
                {!t.endTime && t.userId === user?.id && p.canUpdateTasks() && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await updateTime({
                          id: t.id,
                          startTime: t.startTime,
                          endTime: new Date().toISOString(),
                          description: t.description ?? "",
                        });
                        refresh();
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Concluir meu tempo
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function localTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
