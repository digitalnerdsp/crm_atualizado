import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { RecurrenceFilters, recurrenceReport } from "./report";

type Report = ReturnType<typeof recurrenceReport>;
const states: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  cancelled: "Cancelado",
  finished: "Encerrado",
  not_started: "Não iniciado",
};
const frequency: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
};
const money = (v: number) =>
  (v / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export async function exportRecurrenceExcel(
  report: Report,
  filters: RecurrenceFilters,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nortys";
  workbook.created = new Date();
  const meta = workbook.addWorksheet("Filtros e indicadores");
  meta.addRow(["Nortys", "Contratos e recorrência em BRL"]);
  meta.addRow(["Emissão", new Date().toISOString()]);
  for (const [key, value] of Object.entries(filters))
    meta.addRow([key, String(value)]);
  meta.addRow(["Data de referência", report.referenceDate]);
  meta.addRow(["Nota histórica", report.historyNote]);
  for (const [key, value] of Object.entries(report.current))
    meta.addRow([key, value]);
  meta.columns = [{ width: 30 }, { width: 100 }];
  const sheet = workbook.addWorksheet("Contratos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { key: "number", header: "Contrato", width: 12 },
    { key: "company", header: "Empresa", width: 30 },
    { key: "title", header: "Título", width: 35 },
    { key: "seller", header: "Vendedor", width: 26 },
    { key: "start", header: "Início", width: 15 },
    { key: "end", header: "Término", width: 18 },
    { key: "status", header: "Situação", width: 18 },
    { key: "days", header: "Dias restantes", width: 18 },
    { key: "monthly", header: "Equivalente mensal R$", width: 24 },
    { key: "billed", header: "Cobrado no período R$", width: 24 },
    { key: "received", header: "Recebido no período R$", width: 24 },
    { key: "open", header: "Saldo em aberto R$", width: 22 },
    { key: "next", header: "Próxima cobrança", width: 20 },
    { key: "nextAmount", header: "Valor próxima R$", width: 22 },
    { key: "enabled", header: "Geração automática", width: 24 },
  ];
  const services = workbook.addWorksheet("Serviços por contrato");
  services.columns = [
    { key: "number", header: "Contrato", width: 14 },
    { key: "company", header: "Empresa", width: 30 },
    { key: "service", header: "Serviço", width: 38 },
    { key: "period", header: "Periodicidade", width: 20 },
    { key: "cycle", header: "Valor por ciclo R$", width: 24 },
    { key: "anchor", header: "Início dos ciclos", width: 20 },
  ];
  for (const row of report.rows) {
    sheet.addRow({
      number: row.number,
      company: row.companyName,
      title: row.title,
      seller: row.sellerName ?? "",
      start: row.startsOn,
      end: row.endsOn ?? "Indeterminado",
      status: states[row.status] ?? row.status,
      days: row.daysRemaining ?? "Indeterminado",
      monthly: row.monthlyValueCents / 100,
      billed: row.billedCents / 100,
      received: row.receivedCents / 100,
      open: row.outstandingCents / 100,
      next: row.nextCharge?.date ?? "",
      nextAmount: (row.nextCharge?.amountCents ?? 0) / 100,
      enabled: row.billingEnabled ? "Ativada" : "Desativada",
    });
    for (const item of row.services)
      services.addRow({
        number: row.number,
        company: row.companyName,
        service: item.name,
        period: frequency[item.billingType],
        cycle: item.amountCents / 100,
        anchor: item.anchor,
      });
  }
  sheet.addRow({
    title: "TOTAL",
    monthly: report.current.mrrCents / 100,
    billed: report.current.billedCents / 100,
    received: report.current.receivedCents / 100,
    open: report.current.outstandingCents / 100,
  }).font = { bold: true };
  for (const key of ["monthly", "billed", "received", "open", "nextAmount"])
    sheet.getColumn(key).numFmt = '"R$" #,##0.00';
  services.getColumn("cycle").numFmt = '"R$" #,##0.00';
  for (const ws of [sheet, services]) {
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF243746" },
    };
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, ws.rowCount), column: ws.columnCount },
    };
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
export async function exportRecurrencePdf(
  report: Report,
  filters: RecurrenceFilters,
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([842, 595]);
  let y = 540;
  const clean = (s: string) => s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, " ");
  function text(s: string, x: number, pos: number, size = 9, strong = false) {
    page.drawText(clean(s), {
      x,
      y: pos,
      size,
      font: strong ? bold : font,
      color: rgb(0.12, 0.16, 0.2),
    });
  }
  function wrap(s: string, width: number) {
    const words = clean(s).split(/\s+/);
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      if (font.widthOfTextAtSize(`${line} ${word}`, 9) > width && line) {
        lines.push(line);
        line = word;
      } else line = `${line} ${word}`.trim();
    }
    if (line) lines.push(line);
    return lines;
  }
  function header() {
    text("Nortys | Contratos e recorrência", 30, 558, 16, true);
    text(
      `${filters.from} a ${filters.to} | BRL | Referência ${report.referenceDate}`,
      30,
      539,
    );
    y = 522;
    for (const line of wrap(
      Object.entries(filters)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | "),
      780,
    )) {
      text(line, 30, y, 8);
      y -= 12;
    }
    y -= 10;
  }
  function next() {
    text(String(pdf.getPageCount()), 795, 20, 8);
    page = pdf.addPage([842, 595]);
    header();
  }
  function line(s: string, strong = false) {
    for (const part of wrap(s, 780)) {
      if (y < 48) next();
      text(part, 30, y, 9, strong);
      y -= 14;
    }
  }
  header();
  line(
    `MRR: R$ ${money(report.current.mrrCents)} | Cobrado: R$ ${money(report.current.billedCents)} | Recebido: R$ ${money(report.current.receivedCents)} | Saldo: R$ ${money(report.current.outstandingCents)}`,
    true,
  );
  y -= 8;
  for (const row of report.rows) {
    if (y < 135) next();
    line(`#${row.number} ${row.title} | ${row.companyName}`, true);
    line(
      `Vendedor: ${row.sellerName ?? "Sem responsável"} | ${states[row.status] ?? row.status} | ${row.startsOn} a ${row.endsOn ?? "Indeterminado"} | Dias restantes: ${row.daysRemaining ?? "Indeterminado"}`,
    );
    line(
      `Mensal equivalente: R$ ${money(row.monthlyValueCents)} | Cobrado: R$ ${money(row.billedCents)} | Recebido: R$ ${money(row.receivedCents)} | Saldo: R$ ${money(row.outstandingCents)}`,
    );
    for (const item of row.services)
      line(
        `Serviço: ${item.name} | ${frequency[item.billingType]} | R$ ${money(item.amountCents)} por ciclo`,
      );
    line(
      `Próxima cobrança: ${row.nextCharge ? `${row.nextCharge.date} - R$ ${money(row.nextCharge.amountCents)}` : "Sem ciclo programado"} | Automação: ${row.billingEnabled ? "Ativada" : "Desativada"}`,
    );
    y -= 12;
  }
  line(`${report.total} contratos. ${report.historyNote}`);
  text(String(pdf.getPageCount()), 795, 20, 8);
  return pdf.save();
}
