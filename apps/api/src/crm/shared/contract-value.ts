import type { CrmBillingType } from "../../database/schema";

/** Quantos meses um ciclo de cobrança cobre. Pontual não entra em contrato. */
const MONTHS_PER_CYCLE = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
} as const;

export type RecurringBillingType = keyof typeof MONTHS_PER_CYCLE;

export function isRecurring(
  billingType: CrmBillingType,
): billingType is RecurringBillingType {
  return billingType !== "one_time";
}

/**
 * Quanto uma linha cobrada por ciclo contribui para o MRR. Um plano anual de
 * R$ 12.000 é R$ 1.000 de receita recorrente mensal, não R$ 12.000 no mês em
 * que é cobrado e zero nos outros onze — senão o MRR pula a cada renovação.
 */
export function monthlyEquivalentCents(
  totalCents: number,
  billingType: RecurringBillingType,
) {
  return Math.round(totalCents / MONTHS_PER_CYCLE[billingType]);
}

export function sumMonthlyEquivalents(
  lines: ReadonlyArray<{ totalCents: number; billingType: CrmBillingType }>,
) {
  return lines.reduce(
    (total, line) =>
      isRecurring(line.billingType)
        ? total + monthlyEquivalentCents(line.totalCents, line.billingType)
        : total,
    0,
  );
}
