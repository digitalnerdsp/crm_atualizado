import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, readCsvTable, toMappedRow } from "./csv";

describe("detectDelimiter", () => {
  it("picks the separator the file actually uses", () => {
    expect(detectDelimiter("nome;cnpj;cidade")).toBe(";");
    expect(detectDelimiter("name,taxid,city")).toBe(",");
    expect(detectDelimiter("name\ttaxid\tcity")).toBe("\t");
  });

  it("ignores separators inside quotes", () => {
    expect(detectDelimiter('"Souza, Silva e Cia";11222333000181')).toBe(";");
  });
});

describe("parseCsv", () => {
  it("keeps quoted commas, escaped quotes and line breaks inside a cell", () => {
    const rows = parseCsv(
      'nome,obs\n"Souza, Silva","Disse ""sim"" ontem"\n"Duas\nlinhas",ok',
    );

    expect(rows).toEqual([
      ["nome", "obs"],
      ["Souza, Silva", 'Disse "sim" ontem'],
      ["Duas\nlinhas", "ok"],
    ]);
  });

  it("survives the BOM and CRLF that Excel writes", () => {
    const rows = parseCsv("﻿nome;cidade\r\nPadaria;Santos\r\n");
    expect(rows).toEqual([
      ["nome", "cidade"],
      ["Padaria", "Santos"],
    ]);
  });

  it("drops the empty trailing line instead of importing a blank row", () => {
    expect(parseCsv("nome\nPadaria\n\n")).toEqual([["nome"], ["Padaria"]]);
  });
});

describe("readCsvTable", () => {
  it("separates the header from the body", () => {
    const table = readCsvTable("Nome ;CNPJ\nPadaria;11222333000181");
    expect(table.headers).toEqual(["Nome", "CNPJ"]);
    expect(table.rows).toEqual([["Padaria", "11222333000181"]]);
    expect(table.delimiter).toBe(";");
  });
});

describe("toMappedRow", () => {
  it("keeps only the mapped columns, trimmed", () => {
    const row = toMappedRow(
      ["Nome", "CNPJ", "Observação"],
      [" Padaria do Zé ", "11222333000181", "ignorar"],
      { Nome: "name", CNPJ: "taxId" },
    );

    expect(row).toEqual({ name: "Padaria do Zé", taxId: "11222333000181" });
  });

  it("leaves an empty cell out, so it does not overwrite with blank", () => {
    const row = toMappedRow(["Nome", "Cidade"], ["Padaria", "  "], {
      Nome: "name",
      Cidade: "city",
    });
    expect(row).toEqual({ name: "Padaria" });
  });
});
