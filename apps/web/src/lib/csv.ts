/**
 * Leitor de CSV do tamanho do problema: planilha exportada do Excel, do
 * Google Sheets ou de outro CRM.
 *
 * Escrito à mão em vez de trazer uma dependência porque o repo vem
 * encolhendo o bundle de propósito (ver os commits `perf: reduce frontend
 * bundle footprint`), e o que precisamos é aspas, quebra de linha dentro de
 * célula e separador variável.
 */

/** O Excel em português exporta com ponto e vírgula; o resto do mundo, com
 * vírgula. Decide pelo que aparece mais na primeira linha, fora das aspas. */
export function detectDelimiter(sample: string) {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t"] as const;

  let best: (typeof candidates)[number] = ",";
  let bestCount = 0;

  for (const candidate of candidates) {
    let count = 0;
    let quoted = false;
    for (const char of firstLine) {
      if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

/** Linhas de células cruas, na ordem do arquivo. */
export function parseCsv(content: string, delimiter?: string) {
  // O BOM que o Excel escreve viraria parte do nome da primeira coluna.
  const text = content.replace(/^﻿/, "");
  const separator = delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === separator) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      // \r\n conta como uma quebra só.
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Linha vazia no fim do arquivo é do exportador, não do usuário.
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

export type CsvTable = {
  headers: string[];
  rows: string[][];
  delimiter: string;
};

export function readCsvTable(content: string): CsvTable {
  const delimiter = detectDelimiter(content.replace(/^﻿/, ""));
  const [headers = [], ...rows] = parseCsv(content, delimiter);

  return {
    headers: headers.map((header) => header.trim()),
    rows,
    delimiter,
  };
}

/** Uma linha da planilha como objeto, com as chaves do mapeamento escolhido.
 * Colunas não mapeadas ficam de fora. */
export function toMappedRow(
  headers: string[],
  cells: string[],
  mapping: Record<string, string>,
) {
  const row: Record<string, string> = {};

  headers.forEach((header, index) => {
    const field = mapping[header];
    const value = cells[index]?.trim();
    if (field && value) row[field] = value;
  });

  return row;
}
