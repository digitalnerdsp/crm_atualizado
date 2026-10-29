import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";

const OPEN_KEY = "nortys:ledger-filters-open";
/** Valores que definem o recorte base da tela e não contam como filtro ativo. */
const BASE_KEYS = new Set([
  "from",
  "to",
  "direction",
  "contractId",
  "view",
  "asOf",
  "grouping",
  "horizon",
  "ranking",
  "sort",
  "page",
]);

const dateLabel = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Filtros recolhidos atrás de um botão, com contagem de filtros ativos. O
 * estado aberto/fechado é lembrado e vale para todas as telas.
 * Renderize o formulário de filtros como filho; ele continua montado quando
 * recolhido, então não perde o que foi digitado.
 */
export function FilterPanel({
  values,
  extraActive = 0,
  children,
}: {
  values: Record<string, unknown>;
  /** Para filtros que não estão em `values` (ex.: período diferente do padrão). */
  extraActive?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setOpen((current) => {
      try {
        localStorage.setItem(OPEN_KEY, current ? "0" : "1");
      } catch {
        // sem armazenamento: só não lembra
      }
      return !current;
    });
  const active =
    Object.entries(values).filter(
      ([key, value]) =>
        !BASE_KEYS.has(key) &&
        value !== undefined &&
        value !== "" &&
        value !== null,
    ).length + extraActive;
  const from = typeof values.from === "string" ? values.from : null;
  const to = typeof values.to === "string" ? values.to : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          onClick={toggle}
        >
          <SlidersHorizontal className="size-4" />
          Filtros
          {active > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-primary-foreground text-xs">
              {active}
            </span>
          )}
        </Button>
        {!open && from && to && (
          <span className="text-muted-foreground text-sm">
            {dateLabel(from)} a {dateLabel(to)}
          </span>
        )}
      </div>
      <div hidden={!open}>{children}</div>
    </div>
  );
}
