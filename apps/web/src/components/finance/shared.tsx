import { cloneElement, type ReactElement, type ReactNode, useId } from "react";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FinanceEntry } from "@/fetchers/finance";
export const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
export const dateLabel = (s: string) =>
  s.slice(0, 10).split("-").reverse().join("/");
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function cents(value: FormDataEntryValue | null) {
  const raw = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new Error(
      "Informe valores em reais, sem separador de milhar e com até duas casas decimais.",
    );
  const n = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(n) || n > 1e12)
    throw new Error("Valor fora do limite permitido.");
  return n;
}
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactElement<{ id?: string; "aria-invalid"?: boolean }>;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
    >
      {label}
      {cloneElement(children, { id, "aria-invalid": error ? true : undefined })}
      {error && (
        <span role="alert" className="text-xs font-normal text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}
export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "Confira os dados antes de confirmar."}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </DialogPopup>
    </Dialog>
  );
}
export function remaining(
  e: Pick<FinanceEntry, "amountCents" | "settlements">,
) {
  return (
    e.amountCents -
    e.settlements
      .filter((s) => !s.reversedAt)
      .reduce((sum, s) => sum + s.principalCents, 0)
  );
}
export function entryStatus(e: FinanceEntry) {
  if (e.cancelledAt) return "Cancelado";
  const left = remaining(e);
  if (!left) return "Liquidado";
  if (e.dueDate < today())
    return left < e.amountCents ? "Parcial · vencido" : "Vencido";
  return left < e.amountCents ? "Parcial" : "Em aberto";
}
