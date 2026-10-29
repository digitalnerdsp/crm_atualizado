import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  type LucideIcon,
  Receipt,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StatTone = "primary" | "success" | "warning" | "danger" | "info";

const chip: Record<StatTone, string> = {
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success-foreground",
  warning: "bg-warning/15 text-warning-foreground",
  danger: "bg-destructive/15 text-destructive-foreground",
  info: "bg-info/15 text-info-foreground",
};

/** Ícone e cor padrão pelo assunto do rótulo, para os cartões ficarem coerentes. */
function visualFor(label: string): { icon: LucideIcon; tone: StatTone } {
  const l = label.toLowerCase();
  if (/vencid|atras|inadimpl|promessa|risco/.test(l))
    return { icon: AlertTriangle, tone: "danger" };
  if (/despesa|custo|imposto|comiss|pagar|pago/.test(l))
    return { icon: Receipt, tone: "warning" };
  if (/receita|receb|faturamento|venda|ticket|entrada/.test(l))
    return { icon: TrendingUp, tone: "success" };
  if (/renova|contrato|cliente|hospedag|ativ/.test(l))
    return { icon: RefreshCw, tone: "info" };
  return { icon: BarChart3, tone: "primary" };
}

type StatCardProps = {
  /** Cor do ícone e do destaque do cartão. */
  tone?: StatTone;
  label: string;
  value: ReactNode;
  /** Linha de apoio abaixo do valor (período anterior, base de cálculo…). */
  detail?: ReactNode;
  /** Variação em relação ao período anterior, já formatada (ex.: "+8,2%"). */
  trend?: string;
  /** Pinta o valor de vermelho (resultado negativo, saldo devedor). */
  negative?: boolean;
  /** Ícone no canto, para cartões de visão geral. */
  icon?: LucideIcon;
  iconClassName?: string;
  /** Com onClick o cartão vira botão e abre o detalhamento do número. */
  onClick?: () => void;
  className?: string;
};

/**
 * Cartão de indicador do sistema: rótulo, valor, detalhe e variação. É o único
 * formato de número em destaque — telas novas não devem montar o próprio.
 */
export function StatCard({
  label,
  value,
  detail,
  trend,
  negative,
  icon,
  tone: toneProp,
  iconClassName,
  onClick,
  className,
}: StatCardProps) {
  const auto = visualFor(label);
  const Icon = icon ?? auto.icon;
  const tone = toneProp ?? (icon ? "primary" : auto.tone);
  const body = (
    <>
      <span className="flex items-start justify-between gap-2 text-sm text-muted-foreground">
        {label}
        {Icon ? (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              chip[tone],
            )}
          >
            <Icon className={cn("size-4", iconClassName)} />
          </span>
        ) : onClick ? (
          <ArrowUpRight className="size-4 shrink-0" />
        ) : null}
      </span>
      <span
        className={cn(
          "mt-3 block break-words font-semibold text-2xl tabular-nums tracking-tight",
          negative && "text-destructive",
        )}
      >
        {value}
      </span>
      {trend || detail ? (
        <span className="mt-2 block text-muted-foreground text-xs">
          {trend ? (
            <strong
              className={cn(
                "font-medium",
                trend.trim().startsWith("-") || trend.trim().startsWith("−")
                  ? "text-destructive-foreground"
                  : trend.trim().startsWith("+")
                    ? "text-success-foreground"
                    : "",
              )}
            >
              {trend}
            </strong>
          ) : null}
          {trend && detail ? " · " : null}
          {detail}
        </span>
      ) : null}
    </>
  );
  const base = cn(
    "block min-w-0 rounded-xl border bg-card p-4 text-left",
    className,
  );
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "transition hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring",
      )}
    >
      {body}
    </button>
  );
}
