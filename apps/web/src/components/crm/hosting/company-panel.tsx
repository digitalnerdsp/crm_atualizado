import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  dateLabel,
  Field,
  Modal,
  selectClass,
} from "@/components/finance/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmHostingWhatsApp,
  getHostingDetail,
  getHostingMetadata,
  type HostingPayload,
  saveHosting,
} from "@/fetchers/crm/hosting";
import { useHostingMutation } from "@/hooks/mutations/crm/use-hosting-mutation";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { HostingNoticeDialog } from "./notice-dialog";
import { hostingModes, noticeStates } from "./shared";
export function CompanyHostingPanel({
  workspaceId,
  companyId,
}: {
  workspaceId: string;
  companyId: string;
}) {
  const permissions = useWorkspacePermission();
  const enabled =
    !permissions.isCheckingPermissions && permissions.canViewCompanies();
  const detail = useQuery({
    queryKey: ["crm", "hosting", workspaceId, companyId],
    queryFn: () => getHostingDetail(workspaceId, companyId),
    enabled,
  });
  const meta = useQuery({
    queryKey: ["crm", "hosting-metadata", workspaceId],
    queryFn: () => getHostingMetadata(workspaceId),
    enabled,
  });
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<"email" | "whatsapp" | null>(null);
  const save = useHostingMutation(
    (json: HostingPayload) => saveHosting(workspaceId, companyId, json),
    () => setEditing(false),
  );
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirm = useHostingMutation(
    (id: string) => confirmHostingWhatsApp(workspaceId, id),
    () => setConfirmId(null),
  );
  const data = detail.data;
  if (!enabled) return null;
  if (detail.isLoading) return <p>Carregando hospedagem e serviços…</p>;
  if (detail.error || meta.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {detail.error?.message ?? meta.error?.message}
      </p>
    );
  if (!data) return null;
  const h = data.hosting;
  const canUpdate = permissions.canUpdateCompanies() && !data.company.archived;
  const canNotify =
    permissions.canNotifyCompanies() &&
    data.company.status === "active" &&
    !data.company.archived &&
    h.mode === "third_party";
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Hospedagem e serviços</h2>
        {canUpdate && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            Editar hospedagem e serviços
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-3 py-1">
          {hostingModes[h.mode]}
        </span>
        {h.services.map((s) => (
          <span className="rounded-full border px-3 py-1" key={s.id}>
            {s.name}
          </span>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {h.provider || "Provedor não informado"} ·{" "}
        {h.domain || "Domínio não informado"} · Renovação{" "}
        {h.renewsOn ? dateLabel(h.renewsOn) : "não informada"}
      </p>
      <p className="text-xs text-muted-foreground">
        As flags de serviços são marcadores da carteira. Não criam contratos ou
        cobranças.
      </p>
      {h.notes && <p className="text-sm">{h.notes}</p>}
      <div className="flex flex-wrap gap-2">
        {canNotify && (
          <>
            <Button
              disabled={!h.emailAllowed}
              onClick={() => setNotice("email")}
            >
              Avisar por e-mail
            </Button>
            <Button
              variant="outline"
              disabled={!h.whatsappAllowed}
              onClick={() => setNotice("whatsapp")}
            >
              Preparar WhatsApp
            </Button>
          </>
        )}
        <Link
          className="self-center text-sm underline"
          to="/dashboard/workspace/$workspaceId/crm/hosting"
          params={{ workspaceId }}
        >
          Abrir carteira e dashboard
        </Link>
      </div>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Histórico de avisos ({data.notices.length}
          {data.hasMoreNotices ? "+" : ""}) e versões
        </summary>
        <div className="mt-3 space-y-3">
          {!data.notices.length && (
            <p className="text-sm text-muted-foreground">
              Nenhum aviso registrado.
            </p>
          )}
          {data.notices.map((n) => (
            <section key={n.id} className="rounded-lg border p-3 text-xs">
              <p className="font-medium">
                {noticeStates[n.status]} ·{" "}
                {new Date(n.createdAt).toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 break-all">{n.recipient}</p>
              <p className="mt-2 whitespace-pre-wrap break-words">{n.body}</p>
              {n.error && <p className="mt-2 text-amber-600">{n.error}</p>}
              {permissions.canNotifyCompanies() && n.status === "prepared" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmId(n.id)}
                >
                  Registrar envio realizado
                </Button>
              )}
            </section>
          ))}
          {data.hasMoreNotices && (
            <p className="text-xs text-muted-foreground">
              Exibindo os 100 avisos mais recentes.
            </p>
          )}
          <h3 className="font-medium">Versões do cadastro</h3>
          {data.revisions.map((r) => (
            <p className="text-xs text-muted-foreground" key={r.id}>
              v{r.sequence} · {new Date(r.createdAt).toLocaleString("pt-BR")} ·{" "}
              {hostingModes[r.snapshot.mode]} ·{" "}
              {r.snapshot.services.map((s) => s.name).join(", ") ||
                "Sem flags de serviços"}
            </p>
          ))}
        </div>
      </details>
      {confirmId && (
        <Modal
          title="Registrar envio pelo WhatsApp"
          onClose={() => setConfirmId(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              confirm.mutate(confirmId);
            }}
          >
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" required className="mt-1" />
              Concluí o envio no WhatsApp e quero registrar essa informação.
              Este registro não é confirmação de entrega pelo provedor.
            </label>
            <Button type="submit" disabled={confirm.isPending}>
              Confirmar registro de envio
            </Button>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={`Hospedagem e serviços · ${data.company.name}`}
          onClose={() => setEditing(false)}
        >
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save.mutate({
                mode: String(f.get("mode")) as HostingPayload["mode"],
                provider: String(f.get("provider") || ""),
                domain: String(f.get("domain") || "").trim(),
                renewsOn: String(f.get("renewsOn") || "") || null,
                leadDays: Number(f.get("leadDays")),
                contactId: String(f.get("contact") || "") || null,
                emailAllowed: f.get("emailAllowed") === "on",
                whatsappAllowed: f.get("whatsappAllowed") === "on",
                notes: String(f.get("notes") || ""),
                serviceIds: f.getAll("service").map(String),
                version: h.version,
              });
            }}
          >
            <Field label="Hospedagem">
              <select name="mode" className={selectClass} defaultValue={h.mode}>
                {Object.entries(hostingModes).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Provedor">
              <Input
                name="provider"
                maxLength={180}
                defaultValue={h.provider}
              />
            </Field>
            <Field label="Domínio (sem https://)">
              <Input
                name="domain"
                maxLength={253}
                defaultValue={h.domain}
                placeholder="exemplo.com.br"
              />
            </Field>
            <Field label="Data de renovação">
              <Input
                type="date"
                name="renewsOn"
                defaultValue={h.renewsOn ?? ""}
              />
            </Field>
            <Field label="Avisar na lista com antecedência (dias)">
              <Input
                type="number"
                name="leadDays"
                required
                min={0}
                max={365}
                defaultValue={h.leadDays}
              />
            </Field>
            <Field label="Contato para avisos">
              <select
                name="contact"
                className={selectClass}
                defaultValue={h.contactId ?? ""}
              >
                <option value="">Selecione</option>
                {data.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName ?? ""} ·{" "}
                    {c.email || c.mobile || c.phone || "sem canal cadastrado"}
                  </option>
                ))}
              </select>
            </Field>
            <div className="space-y-3 text-sm sm:col-span-2">
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  name="emailAllowed"
                  defaultChecked={h.emailAllowed}
                />
                Contato habilitado para estes avisos por e-mail
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  name="whatsappAllowed"
                  defaultChecked={h.whatsappAllowed}
                />
                Contato habilitado para estes avisos por WhatsApp
              </label>
              <p className="text-xs text-muted-foreground">
                Use e-mail e telefone do contato cadastrado na empresa. Para
                WhatsApp, informe DDI e DDD no contato (ex.: +55 15…). A opção
                de não receber e-mails do contato é respeitada.
              </p>
            </div>
            <fieldset className="space-y-2 rounded-lg border p-3 sm:col-span-2">
              <legend className="px-1 text-sm font-medium">
                Flags de serviços
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {meta.data?.services
                  .filter(
                    (s) =>
                      !s.archivedAt || h.services.some((v) => v.id === s.id),
                  )
                  .map((s) => (
                    <label
                      key={s.id}
                      className="flex items-start gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="service"
                        value={s.id}
                        defaultChecked={h.services.some((v) => v.id === s.id)}
                      />
                      {s.name}
                      {s.archivedAt ? " (arquivado)" : ""}
                    </label>
                  ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Field label="Observações">
                <textarea
                  name="notes"
                  maxLength={2000}
                  defaultValue={h.notes}
                  className="min-h-20 rounded-md border bg-background p-3 text-sm"
                />
              </Field>
            </div>
            <Button
              type="submit"
              disabled={save.isPending}
              className="sm:col-span-2"
            >
              {save.isPending ? "Salvando…" : "Salvar hospedagem e serviços"}
            </Button>
          </form>
        </Modal>
      )}
      {notice && (
        <HostingNoticeDialog
          workspaceId={workspaceId}
          companyId={companyId}
          channel={notice}
          onClose={() => setNotice(null)}
        />
      )}
    </section>
  );
}
