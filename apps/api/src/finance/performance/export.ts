import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  classifications,
  type PerformanceFilters,
  type performanceReport,
} from "./model";

type Report = ReturnType<typeof performanceReport>;
export const metricLabels = {
  revenueCents: "Receita faturada",
  directCents: "Custos diretos",
  grossProfitCents: "Lucro bruto",
  expenseCents: "Despesas operacionais",
  taxCents: "Impostos lançados",
  financialCents: "Despesas financeiras líquidas",
  manualCommissionCents: "Comissões manuais",
  commissionCents: "Comissões apuradas",
  discountCents: "Descontos menos encargos recebidos",
  unclassifiedCents: "Despesas não classificadas",
  netProfitCents: "Lucro líquido gerencial",
  projectedProfitCents: "Resultado previsto dos títulos",
  presumedProfitCents: "Lucro presumido estimado",
  cashRevenueCents: "Recebimentos",
  cashExpenseCents: "Pagamentos",
  cashBalanceCents: "Saldo de caixa do período",
} as const;
const money = (v: number | null) =>
  v === null
    ? "Não configurado"
    : (v / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
export const reportNote =
  "Valores em BRL. Lucro bruto = receita faturada menos custos diretos. Lucro líquido gerencial inclui despesas, encargos e comissões conforme sua base; títulos de comissão gerados não são deduzidos duas vezes. Caixa usa baixas efetivas. Resultado previsto considera os títulos lançados e a comissão integral potencial. Lucro presumido estimado = receita faturada × percentual informado; não calcula tributos. Custos sem classificação comprometem a margem bruta. Filtros por vendedor/serviço restringem custos aos vínculos informados, sem rateio de despesas gerais.";
export async function exportPerformanceExcel(r: Report, f: PerformanceFilters) {
  const book = new ExcelJS.Workbook();
  book.creator = "Nortys";
  book.created = new Date();
  const info = book.addWorksheet("Resumo");
  info.columns = [{ width: 48 }, { width: 27 }, { width: 27 }];
  info.addRow(["Comissões e resultados", "Atual R$", "Anterior R$"]);
  for (const [k, v] of Object.entries(f)) info.addRow([k, v]);
  info.addRow(["Período anterior", r.previousPeriod.from, r.previousPeriod.to]);
  info.addRow([
    "Percentual de presunção",
    r.presumptionBps === null
      ? "Não configurado"
      : `${r.presumptionBps / 100}%`,
  ]);
  for (const [k, label] of Object.entries(metricLabels)) {
    const key = k as keyof typeof metricLabels;
    info.addRow([
      label,
      r.current[key] === null ? null : r.current[key] / 100,
      r.previous[key] === null ? null : r.previous[key] / 100,
    ]);
  }
  info.addRow([
    "Comissão disponível (acumulado dos títulos listados)",
    r.totals.availableCents / 100,
  ]);
  info.addRow([
    "Comissão emitida a maior / revisar",
    r.totals.overallocatedCents / 100,
  ]);
  info.addRow(["Notas", reportNote]);
  info.getColumn(2).numFmt = '"R$" #,##0.00';
  info.getColumn(3).numFmt = '"R$" #,##0.00';
  const sheet = book.addWorksheet("Comissões");
  sheet.columns = [
    "ID origem",
    "Descrição",
    "Vendedor",
    "Serviço",
    "Competência",
    "Base",
    "Percentual %",
    "Valor R$",
    "Apurado período R$",
    "Apurado acumulado R$",
    "Emitido acumulado R$",
    "Disponível R$",
    "Emitido a maior R$",
    "Pago período R$",
    "Regra",
    "Cancelado",
  ].map((header, i) => ({ header, width: i === 1 ? 44 : 24 }));
  for (const e of r.rows)
    sheet.addRow([
      e.id,
      e.description,
      e.sellerName ?? "Sem vendedor",
      e.serviceName ?? "Sem serviço",
      e.competenceDate,
      e.basis === "received" ? "Recebido sem encargos" : "Faturado",
      e.rateBps / 100,
      e.amountCents / 100,
      e.earnedPeriodCents / 100,
      e.earnedCents / 100,
      e.issuedCents / 100,
      e.availableCents / 100,
      e.overallocatedCents / 100,
      e.paidPeriodCents / 100,
      e.ruleId ?? "Não registrada",
      e.cancelled ? "Sim" : "Não",
    ]);
  for (let i = 8; i <= 14; i++) sheet.getColumn(i).numFmt = '"R$" #,##0.00';
  sheet.addRow([
    "TOTAL",
    null,
    null,
    null,
    null,
    null,
    null,
    r.rows.reduce((s, e) => s + e.amountCents, 0) / 100,
    r.rows.reduce((s, e) => s + e.earnedPeriodCents, 0) / 100,
    r.rows.reduce((s, e) => s + e.earnedCents, 0) / 100,
    r.rows.reduce((s, e) => s + e.issuedCents, 0) / 100,
    r.totals.availableCents / 100,
    r.totals.overallocatedCents / 100,
    r.totals.paidPeriodCents / 100,
  ]);
  const expenses = book.addWorksheet("Despesas");
  expenses.columns = [
    { header: "ID", width: 30 },
    { header: "Descrição", width: 48 },
    { header: "Classificação", width: 28 },
    { header: "Valor R$", width: 22 },
  ];
  for (const e of r.expenses)
    expenses.addRow([
      e.id,
      e.description,
      classifications[e.resultClass],
      e.amountCents / 100,
    ]);
  expenses.getColumn(4).numFmt = '"R$" #,##0.00';
  const linked = book.addWorksheet("Títulos de comissão");
  linked.columns = [
    "Origem",
    "Conta a pagar",
    "Vencimento",
    "Valor R$",
    "Baixado R$",
  ].map((header) => ({ header, width: 28 }));
  for (const e of r.rows)
    for (const p of e.payables)
      linked.addRow([
        e.id,
        p.id,
        p.dueDate,
        p.amountCents / 100,
        p.paidCents / 100,
      ]);
  for (const i of [4, 5]) linked.getColumn(i).numFmt = '"R$" #,##0.00';
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
export async function exportPerformancePdf(r: Report, f: PerformanceFilters) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([842, 595]);
  let y = 530;
  const clean = (s: string) => s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, " ");
  function header() {
    page.drawText("Nortys | Comissões e resultados", {
      x: 30,
      y: 558,
      size: 16,
      font: bold,
      color: rgb(0.12, 0.16, 0.2),
    });
    page.drawText(`${f.from} a ${f.to} | BRL | ${pdf.getPageCount()}`, {
      x: 30,
      y: 540,
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
  line(`Anterior: ${r.previousPeriod.from} a ${r.previousPeriod.to}`);
  for (const [k, label] of Object.entries(metricLabels)) {
    const key = k as keyof typeof metricLabels;
    line(
      `${label}: R$ ${money(r.current[key])} | anterior R$ ${money(r.previous[key])}`,
      key === "netProfitCents" || key === "grossProfitCents",
    );
  }
  line(
    `Presunção: ${r.presumptionBps === null ? "Não configurada" : `${r.presumptionBps / 100}%`}. Disponível: R$ ${money(r.totals.availableCents)}. Emitido a maior: R$ ${money(r.totals.overallocatedCents)}.`,
  );
  line(reportNote);
  y -= 10;
  for (const e of r.rows) {
    line(
      `${e.description} | ${e.sellerName ?? "Sem vendedor"} | ${e.serviceName ?? "Sem serviço"}`,
      true,
    );
    line(
      `${e.competenceDate} | ${e.rateBps / 100}% sobre ${e.basis === "received" ? "recebido sem encargos" : "faturado"} | Valor R$ ${money(e.amountCents)} | ${e.cancelled ? "Cancelado" : "Ativo"}`,
    );
    line(
      `Apurado no período R$ ${money(e.earnedPeriodCents)} | Acumulado R$ ${money(e.earnedCents)} | Emitido R$ ${money(e.issuedCents)} | Disponível R$ ${money(e.availableCents)} | A maior R$ ${money(e.overallocatedCents)} | Pago no período R$ ${money(e.paidPeriodCents)}`,
    );
    for (const p of e.payables)
      line(
        `Conta a pagar ${p.id} | ${p.dueDate} | R$ ${money(p.amountCents)} | Baixado R$ ${money(p.paidCents)}`,
      );
    y -= 8;
  }
  line("Classificação das despesas", true);
  for (const e of r.expenses)
    line(
      `${e.description} | ${classifications[e.resultClass]} | R$ ${money(e.amountCents)}`,
    );
  return pdf.save();
}
