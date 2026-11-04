/** CSV em ponto e vírgula e com BOM, que o Excel brasileiro abre direto. */
export function downloadCsv(rows: string[][], fileName: string) {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = `﻿${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
