import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  type DraftInput,
  decideDraft,
  type Portfolio,
  type PortfolioMeta,
  saveDraft,
} from "@/fetchers/finance/portfolio";
import { toast } from "@/lib/toast";
import { cents, Field, Modal, money } from "../shared";
export function DraftEditor({
  workspaceId,
  meta,
  draft,
  approve = false,
  readOnly = false,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  meta: Pick<PortfolioMeta, "companies" | "contracts">;
  draft?: Portfolio["drafts"][number];
  approve?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const locked = readOnly || approve || draft?.status === "approved";
  return (
    <Modal
      title={approve ? "Decisão sobre minuta" : "Minuta comercial / jurídica"}
      description="Elaboração e aprovação interna. Não assina documentos, altera contratos ou gera cobranças automaticamente."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            if (approve && draft)
              await decideDraft(workspaceId, draft.id, {
                version: draft.version,
                status: String(f.get("decisionStatus")) as
                  | "approved"
                  | "rejected",
                decision: String(f.get("decision")),
              });
            else {
              const body: DraftInput = {
                companyId: String(f.get("company")),
                contractId: String(f.get("contract") || "") || null,
                title: String(f.get("title")),
                body: String(f.get("body")),
                proposedCents: cents(f.get("amount")),
                status: String(f.get("status")) as "draft" | "submitted",
                version: draft?.version ?? 0,
              };
              await saveDraft(workspaceId, body, draft?.id);
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
        <Field label="Cliente">
          <NativeSelect
            required
            disabled={locked}
            name="company"
            defaultValue={draft?.companyId ?? ""}
          >
            <option value="">Selecione</option>
            {meta.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Contrato de referência">
          <NativeSelect
            disabled={locked}
            name="contract"
            defaultValue={draft?.contractId ?? ""}
          >
            <option value="">Sem contrato</option>
            {meta.contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Título">
          <Input
            required
            disabled={locked}
            name="title"
            maxLength={200}
            defaultValue={draft?.title ?? ""}
          />
        </Field>
        <Field label="Valor proposto R$">
          <Input
            required
            disabled={locked}
            name="amount"
            inputMode="decimal"
            defaultValue={String((draft?.proposedCents ?? 0) / 100)}
          />
        </Field>
        <label className="block text-sm">
          Texto da minuta
          <textarea
            required
            readOnly={locked}
            name="body"
            maxLength={30000}
            defaultValue={draft?.body ?? ""}
            className="mt-1 min-h-60 w-full rounded-md border bg-background p-3"
          />
        </label>
        {approve ? (
          <>
            <Field label="Decisão">
              <NativeSelect name="decisionStatus">
                <option value="approved">Aprovar</option>
                <option value="rejected">Rejeitar</option>
              </NativeSelect>
            </Field>
            <label className="block text-sm">
              Justificativa
              <textarea
                required
                name="decision"
                maxLength={4000}
                className="mt-1 min-h-24 w-full rounded-md border bg-background p-2"
              />
            </label>
            <Button type="submit" disabled={busy}>
              Registrar decisão
            </Button>
          </>
        ) : readOnly || draft?.status === "approved" ? (
          <p className="text-sm">
            {draft &&
              `${draft.status === "approved" ? "Minuta aprovada" : "Consulta"} · ${money(draft.proposedCents)} · ${draft.decision ?? ""}`}
          </p>
        ) : (
          <>
            <Field label="Situação">
              <NativeSelect
                name="status"
                defaultValue={
                  draft?.status === "submitted" ? "submitted" : "draft"
                }
              >
                <option value="draft">Rascunho</option>
                <option value="submitted">Submeter para aprovação</option>
              </NativeSelect>
            </Field>
            <Button type="submit" disabled={busy}>
              Salvar minuta
            </Button>
          </>
        )}
      </form>
    </Modal>
  );
}
