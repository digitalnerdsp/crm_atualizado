import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type CaseInput,
  confirmNotice,
  getCase,
  type NoticeInput,
  type PortfolioMeta,
  previewNotice,
  type QueueRow,
  saveCase,
  sendNotice,
} from "@/fetchers/finance/portfolio";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { cents, dateLabel, Field, Modal, money, selectClass } from "../shared";
import { origins, statuses } from "./shared";
export function CaseDialog({
  workspaceId,
  row,
  members,
  profit,
  onClose,
}: {
  workspaceId: string;
  row: QueueRow;
  members: PortfolioMeta["members"];
  profit?: import("@/fetchers/finance/portfolio").Portfolio["companies"][number];
  onClose: () => void;
}) {
  const p = useWorkspacePermission();
  const qc = useQueryClient();
  const [caseId, setCaseId] = useState(row.id);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(false);
  const q = useQuery({
    queryKey: ["finance", workspaceId, "portfolio-case", caseId],
    queryFn: () => getCase(workspaceId, caseId ?? ""),
    enabled: Boolean(caseId),
  });
  const c = q.data?.case ?? row.follow;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance", workspaceId] });
  };
  return (
    <>
      <Modal
        title={`${origins[row.sourceKind]} — ${row.companyName}`}
        description="Acompanhamento não altera a conta ou a vigência do contrato."
        onClose={onClose}
      >
        {profit && (
          <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm">
            <p>
              Resultado do cliente no período:{" "}
              <strong>{money(profit.resultCents)}</strong> · margem{" "}
              {profit.margin === null ? "N/A" : `${profit.margin.toFixed(1)}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Receita {money(profit.revenueCents)} · estimativa sites{" "}
              {money(profit.estimatedLaborCents)} · vencido{" "}
              {money(profit.overdueCents)}
            </p>
          </div>
        )}
        <p className="mb-4 text-sm">
          {row.title} · {dateLabel(row.sourceDate)} · {money(row.amountCents)}
        </p>
        {q.isError && <p role="alert">{q.error.message}</p>}
        <form
          key={c?.version ?? 0}
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const body: CaseInput = {
                sourceKind: row.sourceKind,
                sourceId: row.sourceId,
                sourceDate: row.sourceDate,
                version: c?.version ?? 0,
                status: String(f.get("status")) as CaseInput["status"],
                ownerUserId: String(f.get("owner") || "") || null,
                nextOn: String(f.get("nextOn") || "") || null,
                nextAction: String(f.get("nextAction") || ""),
                promiseOn: String(f.get("promiseOn") || "") || null,
                promiseCents: f.get("promiseAmount")
                  ? cents(f.get("promiseAmount"))
                  : null,
                note: String(f.get("note")),
              };
              const saved = await saveCase(workspaceId, body);
              setCaseId(saved.id);
              refresh();
              toast.success("Acompanhamento registrado.");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Situação">
            <select
              name="status"
              className={selectClass}
              defaultValue={c?.status ?? "open"}
              disabled={!(p.canManagePortfolio() && !row.resolved)}
            >
              {Object.entries(statuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <select
              name="owner"
              className={selectClass}
              defaultValue={c?.ownerUserId ?? ""}
              disabled={!(p.canManagePortfolio() && !row.resolved)}
            >
              <option value="">Não atribuído</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Próxima ação">
            <Input
              name="nextAction"
              maxLength={1000}
              defaultValue={c?.nextAction ?? ""}
              disabled={!(p.canManagePortfolio() && !row.resolved)}
            />
          </Field>
          <Field label="Próxima data">
            <Input
              type="date"
              name="nextOn"
              defaultValue={c?.nextOn ?? ""}
              disabled={!(p.canManagePortfolio() && !row.resolved)}
            />
          </Field>
          {row.sourceKind === "receivable" && (
            <>
              <Field label="Promessa de pagamento — data">
                <Input
                  type="date"
                  name="promiseOn"
                  defaultValue={c?.promiseOn ?? ""}
                />
              </Field>
              <Field label="Promessa — valor R$">
                <Input
                  name="promiseAmount"
                  inputMode="decimal"
                  defaultValue={
                    c?.promiseCents ? String(c.promiseCents / 100) : ""
                  }
                />
              </Field>
            </>
          )}
          {p.canManagePortfolio() && !row.resolved && (
            <>
              <label className="space-y-1 text-sm sm:col-span-2">
                Registro do contato / observação
                <textarea
                  required
                  name="note"
                  maxLength={4000}
                  className="min-h-24 w-full rounded-md border bg-background p-2"
                />
              </label>
              <Button type="submit" disabled={busy} className="sm:col-span-2">
                Salvar acompanhamento
              </Button>
            </>
          )}
        </form>
        {!caseId && (
          <p className="mt-3 text-xs text-muted-foreground">
            Salve o primeiro acompanhamento para habilitar avisos e histórico.
          </p>
        )}
        {caseId && !row.resolved && p.canNotifyPortfolio() && (
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => setNotice(true)}
          >
            Preparar aviso ao cliente
          </Button>
        )}
        <div className="mt-5 space-y-3">
          <h3 className="font-medium">Histórico</h3>
          {q.data?.events.map((event) => (
            <div key={event.id} className="rounded-lg border p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{event.note}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <h3 className="font-medium">Avisos registrados</h3>
          {q.data?.notices.map((n) => (
            <div key={n.id} className="rounded-lg border p-3 text-sm">
              <p>
                {n.channel} · {n.recipient}
              </p>
              <p className="text-xs text-muted-foreground">
                {
                  {
                    sending: "Em processamento — confira antes de repetir",
                    accepted: "Aceito pelo SMTP; entrega não comprovada",
                    failed: "Não enviado",
                    uncertain: "Confirmação indisponível — confira o provedor",
                    prepared: "WhatsApp preparado; envio manual pendente",
                    confirmed: "Envio informado pelo usuário",
                  }[n.status]
                }
              </p>
              {n.error && <p className="text-xs text-destructive">{n.error}</p>}
              {n.status === "prepared" && p.canNotifyPortfolio() && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await confirmNotice(workspaceId, n.id);
                      refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <label className="mt-2 flex items-start gap-2 text-xs">
                    <input required type="checkbox" />
                    Concluí o envio no WhatsApp e quero registrar essa
                    informação.
                  </label>
                  <Button type="submit" variant="outline" className="mt-2">
                    Registrar envio manual
                  </Button>
                </form>
              )}
            </div>
          ))}
        </div>
      </Modal>
      {notice && caseId && q.data && (
        <NoticeDialog
          workspaceId={workspaceId}
          caseId={caseId}
          contacts={q.data.contacts}
          onClose={() => {
            setNotice(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
function NoticeDialog({
  workspaceId,
  caseId,
  contacts,
  onClose,
}: {
  workspaceId: string;
  caseId: string;
  contacts: Awaited<ReturnType<typeof getCase>>["contacts"];
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<NoticeInput | null>(null);
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof previewNotice>
  > | null>(null);
  const [sent, setSent] = useState<Awaited<
    ReturnType<typeof sendNotice>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <Modal
      title="Aviso ao cliente"
      description="E-mail via SMTP; WhatsApp assistido com envio concluído pelo usuário."
      onClose={onClose}
    >
      {!preview ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const body: NoticeInput = {
              caseId,
              contactId: String(f.get("contact")),
              channel: String(f.get("channel")) as "email" | "whatsapp",
              subject: String(f.get("subject") ?? ""),
              body: String(f.get("body") ?? ""),
            };
            setBusy(true);
            try {
              setPreview(await previewNotice(workspaceId, body));
              setPayload(body);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Contato do cliente">
            <select name="contact" required className={selectClass}>
              <option value="">Selecione</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.firstName, c.lastName].filter(Boolean).join(" ")} ·{" "}
                  {c.email || c.mobile || c.phone || "Sem canal"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Canal">
            <select name="channel" className={selectClass}>
              <option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp assistido</option>
            </select>
          </Field>
          <Field label="Assunto — vazio usa sugestão">
            <Input name="subject" maxLength={200} />
          </Field>
          <label className="block text-sm">
            Mensagem — vazio usa sugestão
            <textarea
              name="body"
              maxLength={6000}
              className="mt-1 min-h-28 w-full rounded-md border bg-background p-2"
            />
          </label>
          <Button type="submit" disabled={busy}>
            Revisar destinatário e mensagem
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="break-all text-sm">
            Destinatário: <strong>{preview.recipient}</strong>
          </p>
          <p className="font-medium">{preview.subject}</p>
          <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm">
            {preview.body}
          </p>
          {!sent ? (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!payload) return;
                setBusy(true);
                try {
                  setSent(
                    await sendNotice(workspaceId, {
                      ...payload,
                      requestId,
                      signature: preview.signature,
                      confirmed: true,
                    }),
                  );
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" required />
                Conferi o destinatário e o conteúdo e tenho autorização para
                usar este canal.
              </label>
              <Button type="submit" disabled={busy}>
                {preview.channel === "email"
                  ? "Enviar e-mail revisado"
                  : "Preparar conversa de WhatsApp"}
              </Button>
            </form>
          ) : (
            <div>
              <p role="status" className="text-sm">
                {sent.notice.status === "accepted"
                  ? "Aceito pelo SMTP. Isso não comprova entrega na caixa de entrada."
                  : sent.notice.status === "prepared"
                    ? "Conversa preparada. Abra o WhatsApp para concluir o envio."
                    : (sent.notice.error ??
                      "Aviso registrado. Confira o estado no histórico.")}
              </p>
              {sent.whatsappUrl && (
                <a
                  href={sent.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-primary underline"
                >
                  Abrir conversa no WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
