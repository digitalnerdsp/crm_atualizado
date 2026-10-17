import { useState } from "react";
import { Field, Modal } from "@/components/finance/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmHostingWhatsApp,
  type HostingNoticeResult,
  type HostingPreview,
  type NoticePreviewPayload,
  previewHostingNotice,
  sendHostingNotice,
} from "@/fetchers/crm/hosting";
import { useHostingMutation } from "@/hooks/mutations/crm/use-hosting-mutation";
import { noticeStates } from "./shared";
export function HostingNoticeDialog({
  workspaceId,
  companyId,
  channel,
  onClose,
}: {
  workspaceId: string;
  companyId: string;
  channel: "email" | "whatsapp";
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<HostingPreview | null>(null);
  const [result, setResult] = useState<HostingNoticeResult | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const review = useHostingMutation(
    (json: NoticePreviewPayload) =>
      previewHostingNotice(workspaceId, companyId, json),
    (value) => setPreview(value),
  );
  const send = useHostingMutation(
    () => {
      if (!preview) throw new Error("Revise o aviso antes de enviar.");
      return sendHostingNotice(workspaceId, companyId, {
        ...preview,
        requestId,
      });
    },
    (value) => setResult(value),
  );
  const confirm = useHostingMutation(
    () => {
      if (!result) throw new Error("Prepare o aviso primeiro.");
      return confirmHostingWhatsApp(workspaceId, result.notice.id);
    },
    (notice) =>
      setResult((current) => (current ? { ...current, notice } : null)),
  );
  return (
    <Modal
      title={
        channel === "email"
          ? "Aviso de hospedagem por e-mail"
          : "Aviso de hospedagem por WhatsApp"
      }
      description="Confira o destinatário e a mensagem. Os avisos são direcionados ao contato habilitado no cadastro."
      onClose={onClose}
    >
      {!result ? (
        <>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              review.mutate({
                channel,
                subject: String(f.get("subject") || ""),
                body: String(f.get("body") || ""),
              });
            }}
            onChange={() => setPreview(null)}
          >
            <Field label="Assunto (opcional)">
              <Input
                name="subject"
                maxLength={180}
                placeholder="Usar assunto padrão"
                disabled={send.isPending}
              />
            </Field>
            <Field label="Mensagem (opcional)">
              <textarea
                name="body"
                maxLength={3000}
                className="min-h-28 w-full rounded-md border bg-background p-3 text-sm"
                placeholder="Deixe em branco para usar o texto padrão de conferência da hospedagem."
                disabled={send.isPending}
              />
            </Field>
            <Button type="submit" disabled={review.isPending || send.isPending}>
              Revisar destinatário e mensagem
            </Button>
          </form>
          {preview && (
            <form
              className="mt-4 space-y-3 rounded-lg border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <p className="break-all text-sm">
                <strong>Destinatário:</strong> {preview.recipient}
              </p>
              <p className="text-sm font-medium">{preview.subject}</p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {preview.body}
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input required type="checkbox" className="mt-1" />
                Conferi o contato e o conteúdo deste aviso.
              </label>
              <Button type="submit" disabled={send.isPending}>
                {send.isPending
                  ? "Processando…"
                  : channel === "email"
                    ? "Enviar este e-mail"
                    : "Preparar conversa de WhatsApp"}
              </Button>
            </form>
          )}
        </>
      ) : (
        <section className="space-y-4">
          <p
            role="status"
            className="rounded-lg border p-3 text-sm font-medium"
          >
            {noticeStates[result.notice.status]}
          </p>
          <p className="break-all text-sm">
            Destinatário: {result.notice.recipient}
          </p>
          {result.notice.error && (
            <p role="alert" className="text-sm text-amber-600">
              {result.notice.error}
            </p>
          )}
          {channel === "email" && (
            <p className="text-sm text-muted-foreground">
              Aceitação pelo SMTP não confirma entrega na caixa de entrada.
              Avisos em processamento ou sem confirmação precisam de conferência
              no provedor antes de repetir.
            </p>
          )}
          {result.whatsappUrl && (
            <>
              <p className="text-sm text-muted-foreground">
                O link abre a conversa com o texto preenchido. O envio precisa
                ser concluído no WhatsApp; preparar a conversa não envia a
                mensagem.
              </p>
              <a
                href={result.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-md border px-4 py-2 text-sm font-medium"
              >
                Abrir conversa no WhatsApp
              </a>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-sm">
                {result.notice.body}
              </p>
              {result.notice.status === "prepared" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    confirm.mutate();
                  }}
                  className="space-y-3"
                >
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" required className="mt-1" />
                    Concluí o envio no WhatsApp e quero registrar essa
                    informação.
                  </label>
                  <Button type="submit" disabled={confirm.isPending}>
                    Registrar envio realizado
                  </Button>
                </form>
              )}
            </>
          )}
        </section>
      )}
    </Modal>
  );
}
