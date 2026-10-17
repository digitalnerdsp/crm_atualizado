import { defaultLocale } from "../../../../i18n/resources";
import { i18n } from "./i18n";

type DateInput = Date | string | number;

function toDate(input: DateInput) {
  return input instanceof Date ? input : new Date(input);
}

function getLocale(locale?: string) {
  return locale || i18n.resolvedLanguage || i18n.language || defaultLocale;
}

export function formatDate(
  value: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
) {
  return new Intl.DateTimeFormat(getLocale(locale), options).format(
    toDate(value),
  );
}

export function formatDateShort(value: DateInput, locale?: string) {
  return formatDate(
    value,
    {
      month: "short",
      day: "numeric",
    },
    locale,
  );
}

export function formatDateMedium(value: DateInput, locale?: string) {
  return formatDate(
    value,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
    locale,
  );
}

/** Locale-aware full date and time (for tooltips next to relative labels like "yesterday"). */
export function formatDateTime(value: DateInput, locale?: string) {
  return formatDate(
    value,
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
    locale,
  );
}

export function formatRelativeTime(
  value: DateInput,
  locale?: string,
  now = new Date(),
) {
  const target = toDate(value);
  const diffMs = target.getTime() - now.getTime();
  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];

  const formatter = new Intl.RelativeTimeFormat(getLocale(locale), {
    numeric: "auto",
  });

  for (const [unit, unitSeconds] of units) {
    if (absSeconds >= unitSeconds || unit === "second") {
      return formatter.format(Math.round(diffSeconds / unitSeconds), unit);
    }
  }

  return formatter.format(0, "second");
}

/**
 * Stage durations run from seconds to months. Rounding everything to whole days
 * would report "1d" for a stage a deal passed through in a minute.
 */
export function formatDurationShort(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/**
 * Tax ids are stored unmasked so the unique index and imports can match on
 * them; the mask is added only for display. 14 digits is a CNPJ, 11 a CPF.
 */
export function formatTaxId(taxId: string | null | undefined) {
  if (!taxId) return null;
  const digits = taxId.replace(/\D/g, "");

  if (digits.length === 14) {
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return taxId;
}
