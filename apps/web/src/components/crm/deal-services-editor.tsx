import { Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateDeal } from "@/hooks/mutations/crm/use-crm-mutations";
import { useSetCrmDealServices } from "@/hooks/mutations/crm/use-crm-service-mutations";
import { useCrmServices } from "@/hooks/queries/crm/use-crm-services";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { toast } from "@/lib/toast";

export type BillingType = "one_time" | "monthly" | "quarterly" | "yearly";

export const BILLING_LABEL_KEY = {
  one_time: "oneTime",
  monthly: "monthly",
  quarterly: "quarterly",
  yearly: "yearly",
} as const;

type SavedLine = {
  id: string;
  serviceId: string | null;
  name: string;
  billingType: BillingType;
  quantity: number;
  unitPriceCents: number;
  discountPercent: number;
  totalCents: number;
};

type DraftLine = {
  key: string;
  serviceId: string | null;
  name: string;
  billingType: BillingType;
  quantity: string;
  unitPrice: string;
  discount: string;
};

/** Item avulso: o Select do coss não aceita valor vazio. */
const FREE = "__free__";

function centsToInput(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toNumber(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Espelho da regra do servidor (`crm/shared/deal-line.ts`), só para o total
 * aparecer enquanto se digita. Quem grava é o servidor, que recalcula. */
export function previewLineTotal(line: DraftLine) {
  const quantity = Math.max(1, toNumber(line.quantity, 1));
  const discount = Math.min(100, Math.max(0, toNumber(line.discount, 0)));
  const unit = parseMoneyToCents(line.unitPrice);
  return Math.round((quantity * unit * (100 - discount)) / 100);
}

function toDraft(line: SavedLine): DraftLine {
  return {
    key: line.id,
    serviceId: line.serviceId,
    name: line.name,
    billingType: line.billingType,
    quantity: String(line.quantity),
    unitPrice: centsToInput(line.unitPriceCents),
    discount: String(line.discountPercent),
  };
}

let draftKey = 0;
function newDraft(): DraftLine {
  draftKey += 1;
  return {
    key: `new-${draftKey}`,
    serviceId: null,
    name: "",
    billingType: "one_time",
    quantity: "1",
    unitPrice: "",
    discount: "0",
  };
}

export function DealServicesEditor({
  workspaceId,
  dealId,
  currency,
  valueCents,
  valueIsManual,
  lines,
  canEdit,
}: {
  workspaceId: string;
  dealId: string;
  currency: string;
  valueCents: number;
  valueIsManual: boolean;
  lines: SavedLine[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<DraftLine[] | null>(null);
  const [lockValue, setLockValue] = useState<string | null>(null);

  // O catálogo só é buscado quando alguém vai editar: ler a ficha não precisa.
  const { data: catalog = [] } = useCrmServices(
    drafts ? workspaceId : undefined,
  );
  const setServices = useSetCrmDealServices();
  const updateDeal = useUpdateDeal();

  const itemsSum = lines.reduce((total, line) => total + line.totalCents, 0);
  const isEditing = drafts !== null;

  function patchDraft(key: string, patch: Partial<DraftLine>) {
    setDrafts((current) =>
      (current ?? []).map((line) =>
        line.key === key ? { ...line, ...patch } : line,
      ),
    );
  }

  function pickService(key: string, value: string) {
    if (value === FREE) {
      patchDraft(key, { serviceId: null });
      return;
    }
    const service = catalog.find((item) => item.id === value);
    if (!service) return;
    // Escolher do catálogo preenche nome, preço e cobrança; tudo segue
    // editável, porque proposta negociada raramente sai no preço de tabela.
    patchDraft(key, {
      serviceId: service.id,
      name: service.name,
      billingType: service.billingType as BillingType,
      unitPrice: centsToInput(service.defaultPriceCents),
    });
  }

  async function handleSave() {
    if (!drafts) return;

    const incomplete = drafts.some((line) => !line.name.trim());
    if (incomplete) {
      toast.error(t("crm:services.nameRequired"));
      return;
    }

    try {
      await setServices.mutateAsync({
        dealId,
        payload: {
          workspaceId,
          // Nome, preço e cobrança vão sempre: é o que preserva a cópia da
          // venda antiga quando alguém salva de novo depois de o catálogo
          // mudar.
          items: drafts.map((line) => ({
            serviceId: line.serviceId,
            name: line.name.trim(),
            billingType: line.billingType,
            quantity: Math.max(1, toNumber(line.quantity, 1)),
            unitPriceCents: parseMoneyToCents(line.unitPrice),
            discountPercent: Math.min(
              100,
              Math.max(0, toNumber(line.discount, 0)),
            ),
          })),
        },
      });
      toast.success(t("crm:services.saved"));
      setDrafts(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:services.saveError"),
      );
    }
  }

  async function handleLock() {
    if (lockValue === null) return;
    try {
      await updateDeal.mutateAsync({
        dealId,
        payload: {
          workspaceId,
          valueIsManual: true,
          valueCents: parseMoneyToCents(lockValue),
        },
      });
      toast.success(t("crm:services.valueUpdated"));
      setLockValue(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:services.saveError"),
      );
    }
  }

  async function handleUnlock() {
    try {
      await updateDeal.mutateAsync({
        dealId,
        payload: { workspaceId, valueIsManual: false },
      });
      toast.success(t("crm:services.valueUpdated"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:services.saveError"),
      );
    }
  }

  const draftSum = (drafts ?? []).reduce(
    (total, line) => total + previewLineTotal(line),
    0,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t("crm:services.title")}</h2>
        {canEdit && !isEditing ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() =>
              setDrafts(lines.length > 0 ? lines.map(toDraft) : [newDraft()])
            }
          >
            <Pencil className="size-3.5" />
            {t("crm:services.edit")}
          </Button>
        ) : null}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1.5 font-normal">
                    {t("crm:services.service")}
                  </th>
                  <th className="pb-1.5 font-normal">
                    {t("crm:services.name")}
                  </th>
                  <th className="w-16 pb-1.5 font-normal">
                    {t("crm:services.quantity")}
                  </th>
                  <th className="w-28 pb-1.5 font-normal">
                    {t("crm:services.unitPrice")}
                  </th>
                  <th className="w-16 pb-1.5 font-normal">
                    {t("crm:services.discount")}
                  </th>
                  <th className="w-28 pb-1.5 text-right font-normal">
                    {t("crm:services.total")}
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {drafts.map((line) => {
                  const picked = catalog.find(
                    (service) => service.id === line.serviceId,
                  );
                  return (
                    <tr key={line.key} className="align-top">
                      <td className="py-1 pr-2">
                        <Select
                          value={line.serviceId ?? FREE}
                          onValueChange={(value) => {
                            if (typeof value === "string") {
                              pickService(line.key, value);
                            }
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-44"
                            aria-label={t("crm:services.service")}
                          >
                            <SelectValue>
                              {picked?.name ??
                                (line.serviceId
                                  ? line.name
                                  : t("crm:services.freeItem"))}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={FREE}>
                              {t("crm:services.freeItem")}
                            </SelectItem>
                            {catalog.map((service) => (
                              <SelectItem key={service.id} value={service.id}>
                                {service.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          size="sm"
                          value={line.name}
                          aria-label={t("crm:services.name")}
                          onChange={(event) =>
                            patchDraft(line.key, { name: event.target.value })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          size="sm"
                          inputMode="numeric"
                          value={line.quantity}
                          aria-label={t("crm:services.quantity")}
                          onChange={(event) =>
                            patchDraft(line.key, {
                              quantity: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          size="sm"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={line.unitPrice}
                          aria-label={t("crm:services.unitPrice")}
                          onChange={(event) =>
                            patchDraft(line.key, {
                              unitPrice: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          size="sm"
                          inputMode="numeric"
                          value={line.discount}
                          aria-label={t("crm:services.discount")}
                          onChange={(event) =>
                            patchDraft(line.key, {
                              discount: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(previewLineTotal(line), currency)}
                      </td>
                      <td className="py-1 pl-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("crm:services.remove")}
                          onClick={() =>
                            setDrafts((current) =>
                              (current ?? []).filter(
                                (item) => item.key !== line.key,
                              ),
                            )
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() =>
                setDrafts((current) => [...(current ?? []), newDraft()])
              }
            >
              <Plus className="size-3.5" />
              {t("crm:services.add")}
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {t("crm:services.itemsSum")}
                <span className="ml-2 text-sm font-medium tabular-nums text-foreground">
                  {formatMoney(draftSum, currency)}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setDrafts(null)}
                disabled={setServices.isPending}
              >
                {t("common:actions.cancel")}
              </Button>
              <Button
                size="sm"
                className="h-7"
                onClick={handleSave}
                disabled={setServices.isPending}
              >
                {t("common:actions.save")}
              </Button>
            </div>
          </div>
        </div>
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("crm:services.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {lines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-border/60 last:border-b-0"
                >
                  <td className="px-3 py-2">
                    <span>{line.name}</span>
                    <Badge variant="outline" size="sm" className="ml-2">
                      {t(`crm:services.${BILLING_LABEL_KEY[line.billingType]}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {line.quantity} ×{" "}
                    {formatMoney(line.unitPriceCents, currency)}
                    {line.discountPercent > 0
                      ? ` −${line.discountPercent}%`
                      : ""}
                  </td>
                  <td className="w-32 px-3 py-2 text-right tabular-nums">
                    {formatMoney(line.totalCents, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 text-xs">
                <td className="px-3 py-2 text-muted-foreground" colSpan={2}>
                  {t("crm:services.itemsSum")}
                </td>
                <td className="px-3 py-2 text-right text-sm font-medium tabular-nums">
                  {formatMoney(itemsSum, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* A trava só faz sentido com item: sem item o valor já é livre. */}
      {canEdit && !isEditing && lines.length > 0 ? (
        valueIsManual ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="size-3.5" />
              {t("crm:services.lockedHint")}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={handleUnlock}
              disabled={updateDeal.isPending}
            >
              <LockOpen className="size-3.5" />
              {t("crm:services.unlock")}
            </Button>
          </div>
        ) : lockValue === null ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setLockValue(centsToInput(valueCents))}
          >
            <Lock className="size-3.5" />
            {t("crm:services.lock")}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("crm:services.lockValueLabel")}
            </span>
            <Input
              size="sm"
              className="w-36"
              inputMode="decimal"
              value={lockValue}
              aria-label={t("crm:services.lockValueLabel")}
              onChange={(event) => setLockValue(event.target.value)}
              autoFocus
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setLockValue(null)}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              size="sm"
              className="h-7"
              onClick={handleLock}
              disabled={updateDeal.isPending}
            >
              {t("crm:services.lock")}
            </Button>
          </div>
        )
      ) : null}
    </section>
  );
}

export default DealServicesEditor;
