export type Ctx = {
  workspaceId: string;
  workspaceName: string;
  userId: string;
};

export const DAY = 86_400_000;
export const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);
export const civil = (date: Date) => date.toISOString().slice(0, 10);
export const civilFromNow = (days: number) => civil(daysFromNow(days));
/** Primeiro dia do mês, `offset` meses a partir de hoje. */
export function monthStart(offset: number) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
  );
}
export const pick = <T>(items: readonly T[], index: number) =>
  items[index % items.length] as T;

function digitsFrom(seed: number, length: number) {
  let n = seed * 7919 + 104729;
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    out.push(n % 10);
  }
  return out;
}
function cd(digits: number[], weights: number[]) {
  const r = digits.reduce((s, d, i) => s + d * (weights[i] ?? 0), 0) % 11;
  return r < 2 ? 0 : 11 - r;
}
/** CNPJ com dígitos verificadores válidos, determinístico pelo número. */
export function fakeCnpj(seed: number) {
  const base = [...digitsFrom(seed, 8), 0, 0, 0, 1];
  const d1 = cd(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = cd([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join("");
}
export function fakeCpf(seed: number) {
  const base = digitsFrom(seed + 500, 9);
  if (base.every((d) => d === base[0])) base[0] = ((base[0] ?? 0) + 1) % 10;
  const d1 = cd(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = cd([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join("");
}
