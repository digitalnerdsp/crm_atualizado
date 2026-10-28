import { Badge } from "@/components/ui/badge";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const variant = {
  neutral: "secondary",
  success: "success",
  warning: "warning",
  danger: "error",
  info: "info",
} as const;

/**
 * Selo de situação único do sistema. Cor só para o estado: verde = concluído,
 * âmbar = pede atenção, vermelho = atrasado/problema, azul = informativo.
 */
export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <Badge variant={variant[tone]} size="lg" className="rounded-full px-2.5">
      {children}
    </Badge>
  );
}

/** Situação de uma conta (receber/pagar). */
export function entryTone(label: string): StatusTone {
  if (label === "Liquidado") return "success";
  if (label.includes("vencido") || label === "Vencido") return "danger";
  if (label.startsWith("Parcial")) return "warning";
  if (label === "Cancelado") return "neutral";
  return "info";
}
