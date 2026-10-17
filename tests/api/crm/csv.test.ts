import { describe, expect, it } from "vitest";
import { csvMoney, toCsv } from "../../../apps/api/src/crm/report/csv";

describe("toCsv", () => {
  it("writes a header from the union of the keys", () => {
    const csv = toCsv([
      { service: "Tráfego", deals: 3 },
      { service: "Site", deals: 1, category: "Web" },
    ]);

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\n")).toEqual([
      "service;deals;category",
      "Tráfego;3;",
      "Site;1;Web",
      "",
    ]);
  });

  it("quotes what would break the columns", () => {
    const csv = toCsv([
      { note: 'Disse "sim"; depois sumiu', other: "linha\nquebrada" },
    ]);

    expect(csv).toContain('"Disse ""sim""; depois sumiu"');
    expect(csv).toContain('"linha\nquebrada"');
  });

  it("gives an empty file a BOM and nothing else", () => {
    expect(toCsv([])).toBe("﻿");
  });
});

describe("csvMoney", () => {
  it("writes cents with a decimal comma", () => {
    expect(csvMoney(250_000)).toBe("2500,00");
    expect(csvMoney(5)).toBe("0,05");
    expect(csvMoney(0)).toBe("0,00");
  });
});
