/**
 * CPF/CNPJ com dígito verificador conferido.
 *
 * Puro e sem dependência de banco: é o tipo de código que se escreve errado
 * uma vez e ninguém percebe por meses, então precisa de teste próprio.
 */

import type { CrmPersonType } from "../../database/schema";

/** Só os dígitos: é assim que o documento é guardado e comparado. */
export function stripTaxId(value: string) {
  return value.replace(/\D/g, "");
}

function checkDigit(digits: number[], weights: number[]) {
  const sum = digits.reduce(
    (total, digit, index) => total + digit * (weights[index] ?? 0),
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: string) {
  const digits = stripTaxId(value);
  if (digits.length !== 11) return false;
  // 111.111.111-11 e afins passam no cálculo, mas não existem.
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const numbers = digits.split("").map(Number);
  const first = checkDigit(numbers.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== numbers[9]) return false;

  const second = checkDigit(
    numbers.slice(0, 10),
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return second === numbers[10];
}

export function isValidCnpj(value: string) {
  const digits = stripTaxId(value);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const numbers = digits.split("").map(Number);
  const first = checkDigit(
    numbers.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  if (first !== numbers[12]) return false;

  const second = checkDigit(
    numbers.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return second === numbers[13];
}

/**
 * Valida contra o tipo de pessoa. Documento vazio continua aceito: cadastro
 * travado é cadastro não preenchido, e muita empresa entra na base antes de
 * alguém pedir o CNPJ.
 */
export function isValidTaxId(personType: CrmPersonType, value?: string | null) {
  if (value === null || value === undefined) return true;
  const digits = stripTaxId(value);
  if (digits.length === 0) return true;
  return personType === "pf" ? isValidCpf(digits) : isValidCnpj(digits);
}

/** Máscara só na exibição; o banco guarda os dígitos. */
export function formatTaxId(value?: string | null) {
  if (!value) return "";
  const digits = stripTaxId(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
  return value;
}
