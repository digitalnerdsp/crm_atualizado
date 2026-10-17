import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { TaxFilters, taxReport } from "./model";

type Report = ReturnType<typeof taxReport>;
export const taxMetricLabels = {
  simulationCount: "Simulações salvas",
  simulatedGrossCents: "Vendas simuladas",
  simulatedNetCents: "Líquido simulado",
  simulatedTaxCents: "Impostos simulados",
  simulatedFeeCents: "Taxas simuladas",
  simulatedCommissionCents: "Comissões simuladas",
  taxAccruedCents: "Impostos lançados",
  financialAccruedCents: "Despesas financeiras lançadas",
  taxPaidCents: "Impostos pagos",
  financialPaidCents: "Despesas financeiras pagas",
} as const;
const money = (n: number) =>
  (n / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const calculationNote =
  "Simulação gerencial em BRL. Percentuais incidem de forma aditiva sobre o preço bruto e valores fixos incidem uma vez por venda. Comissão sobre recebimentos presume recebimento integral sem descontos. Não calcula tributos por regime, retenções, créditos, faixas, parcelamento ou tributação por dentro. Os valores não geram lançamentos financeiros automaticamente.";
export async function exportTaxExcel(r: Report, f: TaxFilters) {
  const book = new ExcelJS.Workbook();
  book.creator = "Nortys";
  book.created = new Date();
  const info = book.addWorksheet("Resumo");
  info.columns = [{ width: 44 }, { width: 28 }, { width: 28 }];
  info.addRow(["Taxas e impostos", "Atual", "Anterior"]);
  for (const [k, v] of Object.entries(f)) info.addRow([k, v]);
  info.addRow(["Período anterior", r.previousPeriod.from, r.previousPeriod.to]);
  for (const [k, label] of Object.entries(taxMetricLabels)) {
    const key = k as keyof typeof taxMetricLabels;
    const divisor = key === "simulationCount" ? 1 : 100;
    info.addRow([label, r.current[key] / divisor, r.previous[key] / divisor]);
  }
  info.addRow(["Lançamentos", r.ledgerNote]);
  info.addRow(["Cálculo", calculationNote]);
  const sheet = book.addWorksheet("Simulações");
  sheet.columns = [
    "ID",
    "Título",
    "Data",
    "Perfil",
    "Versão",
    "Serviço",
    "Vendedor",
    "Modo",
    "Valor informado R$",
    "Bruto R$",
    "Impostos R$",
    "Taxas R$",
    "Comissão R$",
    "Custo R$",
    "Líquido R$",
    "Comissão %",
    "Origem comissão",
    "Observações do perfil",
  ].map((header, i) => ({
    header,
    width: i === 1 || i === 16 || i === 17 ? 45 : 24,
  }));
  const items = book.addWorksheet("Itens dos cálculos");
  items.columns = [
    "Simulação",
    "Título",
    "Item",
    "Tipo",
    "Percentual %",
    "Fixo R$",
    "Calculado R$",
  ].map((header) => ({ header, width: 28 }));
  for (const s of r.rows) {
    sheet.addRow([
      s.id,
      s.title,
      s.date,
      s.profileName,
      s.profileVersion,
      s.serviceName ?? "",
      s.sellerName ?? "",
      s.input.mode === "net" ? "Líquido desejado" : "Preço de venda",
      s.input.amountCents / 100,
      s.result.grossCents / 100,
      s.result.taxCents / 100,
      s.result.feeCents / 100,
      s.result.commissionCents / 100,
      s.result.costCents / 100,
      s.result.netCents / 100,
      s.input.commissionRateBps / 100,
      s.commissionSource,
      s.notes,
    ]);
    for (const i of s.result.breakdown)
      items.addRow([
        s.id,
        s.title,
        i.name,
        i.kind === "tax" ? "Imposto" : "Taxa",
        i.rateBps / 100,
        i.fixedCents / 100,
        i.amountCents / 100,
      ]);
  }
  for (let n = 9; n <= 15; n++) sheet.getColumn(n).numFmt = '"R$" #,##0.00';
  for (const n of [6, 7]) items.getColumn(n).numFmt = '"R$" #,##0.00';
  const ledger = book.addWorksheet("Lançamentos reais");
  ledger.columns = [
    "ID",
    "Descrição",
    "Classificação",
    "Competência",
    "Valor R$",
  ].map((header) => ({ header, width: 30 }));
  for (const e of r.ledger)
    ledger.addRow([
      e.id,
      e.description,
      e.classification === "tax" ? "Imposto" : "Despesa financeira",
      e.competenceDate,
      e.amountCents / 100,
    ]);
  ledger.getColumn(5).numFmt = '"R$" #,##0.00';
  for (const ws of book.worksheets) {
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF243746" },
    };
    if (ws !== info)
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, ws.rowCount), column: ws.columnCount },
      };
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function exportTaxPdf(r: Report, f: TaxFilters) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([842, 595]);
  let y = 520;
  const clean = (s: string) => s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, " ");
  function header() {
    page.drawText("Nortys | Taxas e impostos", {
      x: 30,
      y: 558,
      size: 16,
      font: bold,
    });
    page.drawText(`${f.from} a ${f.to} | BRL | Página ${pdf.getPageCount()}`, {
      x: 30,
      y: 539,
      size: 9,
      font,
    });
    y = 520;
  }
  function line(value: string, strong = false) {
    let part = "";
    const lines: string[] = [];
    for (const char of clean(value)) {
      if (font.widthOfTextAtSize(part + char, 9) > 780) {
        lines.push(part);
        part = "";
      }
      part += char;
    }
    if (part) lines.push(part);
    for (const text of lines) {
      if (y < 45) {
        page = pdf.addPage([842, 595]);
        header();
      }
      page.drawText(text, { x: 30, y, size: 9, font: strong ? bold : font });
      y -= 14;
    }
  }
  header();
  line(
    Object.entries(f)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | "),
  );
  line(`Período anterior: ${r.previousPeriod.from} a ${r.previousPeriod.to}`);
  for (const [k, label] of Object.entries(taxMetricLabels)) {
    const key = k as keyof typeof taxMetricLabels;
    line(
      `${label}: ${key === "simulationCount" ? r.current[key] : `R$ ${money(r.current[key])}`} | anterior ${key === "simulationCount" ? r.previous[key] : `R$ ${money(r.previous[key])}`}`,
    );
  }
  line(r.ledgerNote);
  line(calculationNote);
  y -= 8;
  for (const s of r.rows) {
    line(
      `${s.title} | ${s.date} | ${s.profileName} v${s.profileVersion}`,
      true,
    );
    line(
      `${s.serviceName ?? "Sem serviço"} | ${s.sellerName ?? "Sem vendedor"} | ${s.input.mode === "net" ? "Líquido desejado" : "Preço informado"}: R$ ${money(s.input.amountCents)}`,
    );
    line(
      `Venda R$ ${money(s.result.grossCents)} | Impostos R$ ${money(s.result.taxCents)} | Taxas R$ ${money(s.result.feeCents)} | Comissão R$ ${money(s.result.commissionCents)} | Custo R$ ${money(s.result.costCents)} | Líquido R$ ${money(s.result.netCents)}`,
    );
    for (const i of s.result.breakdown)
      line(
        `${i.name} (${i.kind === "tax" ? "imposto" : "taxa"}): ${i.rateBps / 100}% + R$ ${money(i.fixedCents)} = R$ ${money(i.amountCents)}`,
      );
    line(s.commissionSource);
    if (s.notes) line(`Observações: ${s.notes}`);
    y -= 8;
  }
  line("Lançamentos reais por competência", true);
  for (const e of r.ledger)
    line(
      `${e.description} | ${e.competenceDate} | ${e.classification === "tax" ? "Imposto" : "Despesa financeira"} | R$ ${money(e.amountCents)}`,
    );
  return pdf.save();
}
