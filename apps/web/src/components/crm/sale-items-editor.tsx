import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrmServices } from "@/hooks/queries/crm/use-crm-services";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import type { BillingType } from "./deal-services-editor";

export type SaleItemDraft = {
  key: string;
  serviceId: string | null;
  name: string;
  billingType: BillingType;
  quantity: string;
  unitPrice: string;
  notes: string;
};

const FREE = "__free__";
const BILLING_LABEL: Record<BillingType, string> = {
  one_time: "Pagamento único",
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
};

let counter = 0;
export function newSaleItem(): SaleItemDraft {
  counter += 1;
  return {
    key: `item-${counter}`,
    serviceId: null,
    name: "",
    billingType: "one_time",
    quantity: "1",
    unitPrice: "",
    notes: "",
  };
}

function centsToInput(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function saleItemTotal(item: SaleItemDraft) {
  const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
  return quantity * parseMoneyToCents(item.unitPrice);
}

/** Itens da venda: escolher do catálogo preenche nome, preço e cobrança, e
 * tudo continua editável, porque o valor negociado raramente é o de tabela. */
export function SaleItemsEditor({
  workspaceId,
  items,
  onChange,
}: {
  workspaceId: string;
  items: SaleItemDraft[];
  onChange: (items: SaleItemDraft[]) => void;
}) {
  const { data: catalog = [] } = useCrmServices(workspaceId);

  function patch(key: string, change: Partial<SaleItemDraft>) {
    onChange(
      items.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  }

  function pick(key: string, value: string) {
    if (value === FREE) {
      patch(key, { serviceId: null });
      return;
    }
    const service = catalog.find((entry) => entry.id === value);
    if (!service) return;
    patch(key, {
      serviceId: service.id,
      name: service.name,
      billingType: service.billingType as BillingType,
      unitPrice: centsToInput(service.defaultPriceCents),
    });
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={item.key}
          className="space-y-2 rounded-lg border border-border p-3"
        >
          <div className="flex items-center gap-2">
            <Select
              value={item.serviceId ?? FREE}
              onValueChange={(value) => {
                if (typeof value === "string") pick(item.key, value);
              }}
            >
              <SelectTrigger size="sm" className="w-48">
                <SelectValue>
                  {catalog.find((entry) => entry.id === item.serviceId)?.name ??
                    "Item avulso"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FREE}>Item avulso</SelectItem>
                {catalog.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              size="sm"
              value={item.name}
              placeholder="Descrição do serviço"
              aria-label="Descrição do serviço"
              onChange={(event) =>
                patch(item.key, { name: event.target.value })
              }
            />
            {items.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-8 shrink-0 p-0"
                aria-label={`Remover item ${index + 1}`}
                onClick={() =>
                  onChange(items.filter((entry) => entry.key !== item.key))
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-[1fr_5rem_8rem_7rem] items-center gap-2">
            <Select
              value={item.billingType}
              onValueChange={(value) => {
                if (typeof value === "string")
                  patch(item.key, { billingType: value as BillingType });
              }}
            >
              <SelectTrigger size="sm" aria-label="Cobrança">
                <SelectValue>{BILLING_LABEL[item.billingType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(BILLING_LABEL) as BillingType[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {BILLING_LABEL[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              size="sm"
              inputMode="numeric"
              value={item.quantity}
              aria-label="Quantidade"
              onChange={(event) =>
                patch(item.key, { quantity: event.target.value })
              }
            />
            <Input
              size="sm"
              inputMode="decimal"
              value={item.unitPrice}
              placeholder="0,00"
              aria-label="Preço unitário"
              onChange={(event) =>
                patch(item.key, { unitPrice: event.target.value })
              }
            />
            <span className="text-right text-sm tabular-nums text-muted-foreground">
              {formatMoney(saleItemTotal(item), "BRL")}
            </span>
          </div>
          <Input
            size="sm"
            value={item.notes}
            placeholder="Observação do item (opcional)"
            aria-label="Observação do item"
            onChange={(event) => patch(item.key, { notes: event.target.value })}
          />
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => onChange([...items, newSaleItem()])}
      >
        <Plus className="size-3.5" />
        Adicionar serviço
      </Button>
    </div>
  );
}
