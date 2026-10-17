/**
 * CSV para o gestor levar a reunião. Sem isso ele tira print da tela, e um
 * print não soma nem filtra.
 *
 * Separador ponto e vírgula e BOM: é o que faz o Excel em português abrir o
 * arquivo em colunas em vez de jogar tudo na coluna A.
 */
export function toCsv(rows: ReadonlyArray<Record<string, unknown>>) {
  if (rows.length === 0) return "﻿";

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  const cell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = value instanceof Date ? value.toISOString() : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [
    columns.join(";"),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(";")),
  ];

  return `﻿${lines.join("\n")}\n`;
}

/** Centavos viram "1234,56": o Excel em português lê vírgula como decimal. */
export function csvMoney(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
