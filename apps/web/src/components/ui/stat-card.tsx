import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type StatCardProps = {
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
  icon: Icon,
  iconClassName,
  onClick,
  className,
}: StatCardProps) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2 text-sm text-muted-foreground">
        {label}
        {onClick ? <ArrowUpRight className="size-4 shrink-0" /> : null}
        {Icon && !onClick ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
            <Icon className={cn("size-4", iconClassName)} />
          </span>
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
          {trend ? <strong className="font-medium">{trend}</strong> : null}
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
