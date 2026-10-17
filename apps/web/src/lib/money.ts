/**
 * Money crosses the wire as integer cents so nothing is lost to float. These
 * are the only two places that convert, so a stray `/100` never shows up in a
 * component.
 */
export function formatMoney(
  valueCents: number,
  currency = "BRL",
  locale = "pt-BR",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(valueCents / 100);
}

/** Shortens to 1,2 mi / 340 mil for card and column headers. */
export function formatMoneyCompact(
  valueCents: number,
  currency = "BRL",
  locale = "pt-BR",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(valueCents / 100);
}

export function parseMoneyToCents(input: string) {
  const digits = input.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "");
  const normalized = digits.replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}
