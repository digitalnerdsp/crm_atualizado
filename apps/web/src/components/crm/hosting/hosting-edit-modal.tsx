import { useQuery } from "@tanstack/react-query";
import { Field, Modal } from "@/components/finance/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getHostingDetail,
  type HostingPayload,
  saveHosting,
} from "@/fetchers/crm/hosting";
import { useHostingMutation } from "@/hooks/mutations/crm/use-hosting-mutation";

/**
 * Hospedagem de terceiros de uma empresa: marcação, provedor, domínio e
 * vencimento. A empresa só aparece na lista da Hospedagem enquanto estiver
 * marcada como de terceiros.
 */
export function HostingEditModal({
  workspaceId,
  companyId,
  onClose,
}: {
  workspaceId: string;
  companyId: string;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["crm", "hosting", workspaceId, companyId],
    queryFn: () => getHostingDetail(workspaceId, companyId),
  });
  const save = useHostingMutation(
    (json: HostingPayload) => saveHosting(workspaceId, companyId, json),
    onClose,
  );
  const data = detail.data;
  const h = data?.hosting;
  // As marcas de serviço feitas à mão são preservadas; as que vêm de contrato
  // são recalculadas pela API.
  const keep =
    h?.services.filter((s) => !s.fromContract).map((s) => s.id) ?? [];
  const send = (mode: HostingPayload["mode"], form?: FormData) => {
    if (!h) return;
    save.mutate({
      mode,
      provider: String(form?.get("provider") ?? h.provider),
      domain: String(form?.get("domain") ?? h.domain).trim(),
      renewsOn: form ? String(form.get("renewsOn") || "") || null : h.renewsOn,
      contactId: h.contactId,
      notes: String(form?.get("notes") ?? h.notes),
      serviceIds: keep,
      version: h.version,
    });
  };
  return (
    <Modal
      title={`Hospedagem de terceiros${data ? ` · ${data.company.name}` : ""}`}
      onClose={onClose}
    >
      {detail.isLoading ? (
        <p>Carregando…</p>
      ) : detail.error ? (
        <p role="alert" className="text-sm text-destructive">
          {detail.error.message}
        </p>
      ) : (
        h && (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              send("third_party", new FormData(e.currentTarget));
            }}
          >
            <Field label="Provedor atual">
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
            <Field label="Vencimento da hospedagem">
              <Input
                type="date"
                name="renewsOn"
                defaultValue={h.renewsOn ?? ""}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Observações">
                <textarea
                  name="notes"
                  maxLength={2000}
                  defaultValue={h.notes}
                  className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              O Nortys só sinaliza o vencimento para a equipe interna; a
              cobrança da hospedagem é feita em outro sistema.
            </p>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Salvando…" : "Salvar"}
              </Button>
              {h.mode === "third_party" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => send("unknown")}
                >
                  Remover da lista
                </Button>
              )}
            </div>
          </form>
        )
      )}
    </Modal>
  );
}
