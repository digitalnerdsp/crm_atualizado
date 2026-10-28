import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  createEntry,
  type EntryPayload,
  type FinanceEntry,
  type FinanceMetadata,
  updateEntry,
} from "@/fetchers/finance";
import { useFinanceMutation } from "@/hooks/mutations/finance/use-finance-mutation";
import { toast } from "@/lib/toast";
import { cents, Field, Modal, today } from "./shared";
export function EntryForm({
  workspaceId,
  metadata,
  entry,
  defaultDirection,
  onClose,
}: {
  workspaceId: string;
  metadata: FinanceMetadata;
  entry?: FinanceEntry;
  defaultDirection?: "payable" | "receivable";
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<"payable" | "receivable">(
    entry?.direction ?? defaultDirection ?? "payable",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [partyName, setPartyName] = useState(entry?.partyName ?? "");
  const [schedule, setSchedule] = useState("installments");
  const [requestId] = useState(() => crypto.randomUUID());
  const mutation = useFinanceMutation(
    workspaceId,
    async (json: EntryPayload) => {
      if (entry) {
        const {
          requestId: _r,
          count: _c,
          intervalMonths: _i,
          schedule: _s,
          ...fields
        } = json;
        return updateEntry(workspaceId, entry.id, {
          ...fields,
          version: entry.version,
        });
      }
      return createEntry(workspaceId, json);
    },
    onClose,
  );
  return (
    <Modal
      title={entry ? "Editar lançamento" : "Novo lançamento"}
      description="Cada lançamento pertence a um serviço. Divida vendas com vários serviços em lançamentos separados."
      onClose={onClose}
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const f = new FormData(event.currentTarget);
            const found: Record<string, string> = {};
            if (!String(f.get("description") ?? "").trim())
              found.description = "Informe a descrição.";
            try {
              cents(f.get("amount"));
            } catch {
              found.amount =
                "Use reais com até duas casas, sem milhar (ex.: 1500,00).";
            }
            if (!f.get("competenceDate"))
              found.competenceDate = "Informe a competência.";
            if (!f.get("dueDate")) found.dueDate = "Informe o vencimento.";
            setErrors(found);
            if (Object.keys(found).length) return;
            const id = (k: string) => String(f.get(k) ?? "") || null;
            mutation.mutate({
              requestId,
              description: String(f.get("description")),
              direction,
              kind: f.get("kind") as "operating" | "opening",
              amountCents: cents(f.get("amount")),
              competenceDate: String(f.get("competenceDate")),
              dueDate: String(f.get("dueDate")),
              categoryId: id("categoryId"),
              partyId: id("partyId"),
              partyName,
              companyId: id("companyId"),
              serviceId: id("serviceId"),
              sellerId: id("sellerId"),
              paymentMethod: f.get(
                "paymentMethod",
              ) as EntryPayload["paymentMethod"],
              notes: String(f.get("notes")),
              count: entry ? 1 : Number(f.get("count")),
              intervalMonths: Number(f.get("intervalMonths") ?? 1) as
                | 1
                | 3
                | 12,
              schedule: schedule as "installments" | "recurring",
            });
          } catch (error) {
            toast.error((error as Error).message);
          }
        }}
      >
        <Field label="Descrição" error={errors.description}>
          <Input
            name="description"
            required
            maxLength={240}
            defaultValue={entry?.description}
          />
        </Field>
        <Field label="Tipo">
          <NativeSelect
            value={direction}
            disabled={Boolean(defaultDirection)}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
          >
            <option value="payable">Conta a pagar</option>
            <option value="receivable">Conta a receber</option>
          </NativeSelect>
        </Field>
        <Field label="Natureza">
          <NativeSelect name="kind" defaultValue={entry?.kind ?? "operating"}>
            <option value="operating">Operacional</option>
            <option value="opening">Saldo inicial</option>
          </NativeSelect>
        </Field>
        <Field
          error={errors.amount}
          label={
            entry
              ? "Valor do lançamento em R$"
              : schedule === "recurring"
                ? "Valor de cada recorrência em R$"
                : "Valor total em R$"
          }
        >
          <Input
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            required
            defaultValue={
              entry ? (entry.amountCents / 100).toFixed(2) : undefined
            }
          />
        </Field>
        <Field label="Competência" error={errors.competenceDate}>
          <Input
            type="date"
            name="competenceDate"
            required
            defaultValue={entry?.competenceDate ?? today()}
          />
        </Field>
        <Field label="Vencimento" error={errors.dueDate}>
          <Input
            type="date"
            name="dueDate"
            required
            defaultValue={entry?.dueDate ?? today()}
          />
        </Field>
        <Field label="Categoria ou subcategoria">
          <NativeSelect
            key={direction}
            name="categoryId"
            defaultValue={
              entry?.direction === direction ? (entry.categoryId ?? "") : ""
            }
          >
            <option value="">Sem categoria</option>
            {metadata.categories
              .filter((c) => c.isActive && c.direction === direction)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId
                    ? `${metadata.categories.find((p) => p.id === c.parentId)?.name} / `
                    : ""}
                  {c.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label="Forma de pagamento">
          <NativeSelect
            name="paymentMethod"
            defaultValue={entry?.paymentMethod ?? "pix"}
          >
            {Object.entries({
              pix: "Pix",
              boleto: "Boleto",
              card: "Cartão",
              transfer: "Transferência",
              cash: "Dinheiro",
              other: "Outra",
            }).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Favorecido ou colaborador cadastrado">
          <NativeSelect
            key={`party-${direction}`}
            name="partyId"
            defaultValue={
              entry?.direction === direction ? (entry.partyId ?? "") : ""
            }
            onChange={(e) => {
              const p = metadata.parties.find((p) => p.id === e.target.value);
              if (p) setPartyName(p.name);
            }}
          >
            <option value="">Informar nome manualmente</option>
            {metadata.parties
              .filter(
                (p) => p.isActive && (direction === "payable" || !p.laborType),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.laborType ? ` · ${p.laborType.toUpperCase()}` : ""}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label="Nome do favorecido ou cliente">
          <Input
            required
            maxLength={180}
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
          />
        </Field>
        <Field label="Empresa cliente">
          <NativeSelect
            name="companyId"
            defaultValue={entry?.companyId ?? ""}
            onChange={(e) => {
              const c = metadata.companies.find((c) => c.id === e.target.value);
              if (c && !partyName) setPartyName(c.name);
            }}
          >
            <option value="">Sem vínculo</option>
            {metadata.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Serviço">
          <NativeSelect name="serviceId" defaultValue={entry?.serviceId ?? ""}>
            <option value="">Sem vínculo</option>
            {metadata.services.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Vendedor">
          <NativeSelect name="sellerId" defaultValue={entry?.sellerId ?? ""}>
            <option value="">Sem vínculo</option>
            {metadata.sellers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {!entry && (
          <>
            <Field label="Geração">
              <NativeSelect
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              >
                <option value="installments">Parcelar o valor total</option>
                <option value="recurring">Repetir o valor por ciclo</option>
              </NativeSelect>
            </Field>
            <Field label="Quantidade de parcelas ou ciclos">
              <Input
                name="count"
                type="number"
                min="1"
                max="120"
                required
                defaultValue="1"
              />
            </Field>
            <Field label="Intervalo">
              <NativeSelect name="intervalMonths">
                <option value="1">Mensal</option>
                <option value="3">Trimestral</option>
                <option value="12">Anual</option>
              </NativeSelect>
            </Field>
          </>
        )}
        <div className="sm:col-span-2">
          <Field label="Observações">
            <Input name="notes" maxLength={4000} defaultValue={entry?.notes} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar lançamento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
