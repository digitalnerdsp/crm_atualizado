import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Cabeçalho padrão de página: título, descrição curta e ações à direita.
 * `eyebrow` é a linha pequena acima do título (o assunto da área).
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 font-semibold text-primary text-xs uppercase tracking-widest">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-semibold text-2xl md:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-muted-foreground text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
