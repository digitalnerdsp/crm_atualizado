import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateSale } from "@/hooks/mutations/crm/use-crm-sale-mutations";
import { useCrmCompanies } from "@/hooks/queries/crm/use-crm-companies";
import { useWorkspaceMembers } from "@/hooks/queries/workspace/use-workspace-members";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { toast } from "@/lib/toast";
import { PAYMENT_FORM_LABEL, type PaymentForm } from "./sale-constants";
import {
  newSaleItem,
  type SaleItemDraft,
  SaleItemsEditor,
  saleItemTotal,
} from "./sale-items-editor";

const NONE = "__none__";
const today = () => new Date().toISOString().slice(0, 10);

export function CreateSaleModal({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const { mutateAsync, isPending } = useCreateSale();
  const { data: companies } = useCrmCompanies({ workspaceId, limit: "200" });
  const { data: members = [] } = useWorkspaceMembers(workspaceId);

  const [companyId, setCompanyId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [soldAt, setSoldAt] = useState(today());
  const [items, setItems] = useState<SaleItemDraft[]>([newSaleItem()]);
  const [paymentForm, setPaymentForm] = useState<PaymentForm | "">("");
  const [paymentFormNote, setPaymentFormNote] = useState("");
  const [notes, setNotes] = useState("");
  const [contractEndsAt, setContractEndsAt] = useState("");

  const hasRecurring = items.some((item) => item.billingType !== "one_time");
  const total = items.reduce((sum, item) => sum + saleItemTotal(item), 0);
  const company = companies?.items.find((entry) => entry.id === companyId);
  const owner = members.find((member) => member.id === ownerUserId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!companyId) {
      toast.error("Escolha a empresa da venda.");
      return;
    }
    if (items.some((item) => !item.name.trim())) {
      toast.error("Informe a descrição de cada serviço.");
      return;
    }
    if (paymentForm === "custom" && !paymentFormNote.trim()) {
      toast.error("Descreva a forma de pagamento.");
      return;
    }

    try {
      await mutateAsync({
        workspaceId,
        companyId,
        ...(ownerUserId ? { ownerUserId } : {}),
        soldAt: new Date(`${soldAt}T12:00:00`).toISOString(),
        items: items.map((item) => ({
          serviceId: item.serviceId,
          name: item.name.trim(),
          billingType: item.billingType,
          quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
          unitPriceCents: parseMoneyToCents(item.unitPrice),
          notes: item.notes.trim() || null,
        })),
        notes: notes.trim() || null,
        paymentForm: paymentForm || null,
        paymentFormNote: paymentForm === "custom" ? paymentFormNote : null,
        ...(hasRecurring && contractEndsAt
          ? {
              contractEndsAt: new Date(
                `${contractEndsAt}T12:00:00`,
              ).toISOString(),
            }
          : {}),
      });
      toast.success("Venda registrada.");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível registrar.",
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova venda</DialogTitle>
          <DialogDescription>
            Registre a venda direto, sem passar pelos leads.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label>Empresa</Label>
              <Select
                value={companyId}
                onValueChange={(value) => {
                  if (typeof value === "string") setCompanyId(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {company?.name ?? "Escolha a empresa"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(companies?.items ?? []).map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-date">Data da venda</Label>
              <Input
                id="sale-date"
                type="date"
                value={soldAt}
                onChange={(event) => setSoldAt(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vendedor</Label>
            <Select
              value={ownerUserId || NONE}
              onValueChange={(value) => {
                if (typeof value === "string")
                  setOwnerUserId(value === NONE ? "" : value);
              }}
            >
              <SelectTrigger>
                <SelectValue>{owner?.name ?? "Eu"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Eu</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Serviços</Label>
            <SaleItemsEditor
              workspaceId={workspaceId}
              items={items}
              onChange={setItems}
            />
            <p className="text-right text-sm font-medium tabular-nums">
              Total: {formatMoney(total, "BRL")}
            </p>
          </div>

          {hasRecurring ? (
            <div className="space-y-2">
              <Label htmlFor="sale-ends">Fim do contrato (opcional)</Label>
              <Input
                id="sale-ends"
                type="date"
                value={contractEndsAt}
                onChange={(event) => setContractEndsAt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Os itens recorrentes geram o contrato na data da venda. Sem data
                de fim, o contrato fica sem prazo.
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select
                value={paymentForm || NONE}
                onValueChange={(value) => {
                  if (typeof value === "string")
                    setPaymentForm(
                      value === NONE ? "" : (value as PaymentForm),
                    );
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {paymentForm
                      ? PAYMENT_FORM_LABEL[paymentForm]
                      : "Não informar"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informar</SelectItem>
                  {(Object.keys(PAYMENT_FORM_LABEL) as PaymentForm[]).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {PAYMENT_FORM_LABEL[key]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            {paymentForm === "custom" ? (
              <div className="space-y-2">
                <Label htmlFor="sale-pay-note">Como foi pago</Label>
                <Input
                  id="sale-pay-note"
                  value={paymentFormNote}
                  maxLength={200}
                  placeholder="Ex.: 50% hoje e 50% na entrega"
                  onChange={(event) => setPaymentFormNote(event.target.value)}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sale-notes">Observação</Label>
            <Textarea
              id="sale-notes"
              value={notes}
              rows={3}
              placeholder="Informações do site, da hospedagem, combinados…"
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <DialogFooter className="px-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              Registrar venda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
