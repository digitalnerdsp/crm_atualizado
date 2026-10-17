import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  cash,
  type Entry,
  type Filters,
  filterEntries,
  inPeriod,
  reportBalance,
  status,
} from "./model";

const labels: Record<string, string> = {
  payable: "A pagar",
  receivable: "A receber",
  open: "Em aberto",
  partial: "Parcial",
  settled: "Liquidado",
  cancelled: "Cancelado",
  due: "Vencimento",
  competence: "Competência",
  settlement: "Baixa",
  operating: "Operacional",
  opening: "Saldo inicial",
  transfer: "Transferência",
};
const money = (n: number) =>
  (n / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function exportRows(entries: Entry[], f: Filters) {
  return filterEntries(entries, f).map((e) => ({
    descricao: e.description,
    tipo: labels[e.direction] ?? e.direction,
    natureza: labels[e.kind] ?? e.kind,
    favorecido: e.partyName,
    vinculo: e.laborType?.toUpperCase() ?? "",
    categoria: e.categoryName ?? "",
    cliente: e.companyName ?? "",
    servico: e.serviceName ?? "",
    vendedor: e.sellerName ?? "",
    competencia: e.competenceDate,
    vencimento: e.dueDate,
    situacao: labels[status(e, f.view ? f.asOf : undefined)] ?? status(e),
    valor: e.amountCents / 100,
    saldo: e.cancelledAt ? 0 : reportBalance(e, f) / 100,
    baixasNoPeriodo:
      e.settlements
        .filter((s) => !s.reversedAt && inPeriod(s.date, f))
        .reduce((sum, s) => sum + cash(s), 0) / 100,
  }));
}
export async function excel(entries: Entry[], f: Filters) {
  const book = new ExcelJS.Workbook();
  book.creator = "Nortys";
  book.created = new Date();
  const info = book.addWorksheet("Filtros");
  info.addRow(["Relatório financeiro", "BRL"]);
  info.addRow(["Emissão", new Date().toISOString()]);
  for (const [k, value] of Object.entries(f)) info.addRow([k, String(value)]);
  info.addRow([
    "Saldo",
    "Saldo atual em aberto; cancelados excluídos dos totais.",
  ]);
  const sheet = book.addWorksheet("Lançamentos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headers = {
    descricao: "Descrição",
    tipo: "Tipo",
    natureza: "Natureza",
    favorecido: "Favorecido",
    vinculo: "Vínculo",
    categoria: "Categoria",
    cliente: "Cliente",
    servico: "Serviço",
    vendedor: "Vendedor",
    competencia: "Competência",
    vencimento: "Vencimento",
    situacao: "Situação",
    valor: "Valor R$",
    saldo: "Saldo R$",
    baixasNoPeriodo: "Baixas no período R$",
  };
  sheet.columns = Object.entries(headers).map(([key, header]) => ({
    key,
    header,
    width: key === "descricao" ? 38 : 22,
  }));
  const rows = exportRows(entries, f);
  for (const row of rows) sheet.addRow(row); // strings stay literal: no spreadsheet formula evaluation
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF243746" },
  };
  for (const key of ["valor", "saldo", "baixasNoPeriodo"])
    sheet.getColumn(key).numFmt = '"R$" #,##0.00';
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: 15 },
  };
  const totals = rows
    .filter((r) => r.situacao !== "Cancelado")
    .reduce(
      (t, r) => ({
        valor: t.valor + r.valor,
        saldo: t.saldo + r.saldo,
        baixasNoPeriodo: t.baixasNoPeriodo + r.baixasNoPeriodo,
      }),
      { valor: 0, saldo: 0, baixasNoPeriodo: 0 },
    );
  sheet.addRow({ descricao: "TOTAL sem cancelados", ...totals }).font = {
    bold: true,
  };
  return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function pdf(entries: Entry[], f: Filters) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([842, 595]);
  let y = 555;
  const clean = (text: string) =>
    text.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, " ");
  function draw(
    text: string,
    x: number,
    posY: number,
    size = 9,
    strong = false,
  ) {
    page.drawText(clean(text), {
      x,
      y: posY,
      size,
      font: strong ? bold : regular,
      color: rgb(0.12, 0.16, 0.2),
    });
  }
  const cols = [30, 230, 295, 435, 505, 575, 660, 738];
  const widths = [195, 60, 135, 65, 65, 80, 75, 74];
  function fitted(text: string, width: number, size = 9) {
    let value = clean(text);
    while (regular.widthOfTextAtSize(value, size) > width && value.length)
      value = value.slice(0, -1);
    return value;
  }
  const header = () => {
    draw("Nortys | Relatório financeiro em BRL", 30, 555, 16, true);
    draw(
      `${f.from} a ${f.to} | Base: ${labels[f.dateBasis]} | Emissão: ${new Date().toISOString()}`,
      30,
      535,
      9,
    );
    const filterText = Object.entries(f)
      .filter(([k]) => !["from", "to", "dateBasis"].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
    const lines = filterText.match(/.{1,145}/g) ?? [];
    let yy = 520;
    for (const line of lines) {
      draw(line, 30, yy, 8);
      yy -= 11;
    }
    y = yy - 20;
    [
      "Descrição / serviço",
      "Tipo",
      "Favorecido",
      "Vencimento",
      "Situação",
      "Valor R$",
      "Saldo R$",
      "Baixas R$",
    ].forEach((t, i) => {
      draw(t, cols[i] ?? 30, y, 8, true);
    });
    y -= 20;
  };
  const next = () => {
    draw(String(doc.getPageCount()), 800, 20, 8);
    page = doc.addPage([842, 595]);
    header();
  };
  header();
  const rows = exportRows(entries, f);
  let amount = 0;
  let left = 0;
  let paid = 0;
  for (const row of rows) {
    if (y < 60) next();
    const cells = [
      `${row.descricao}${row.servico ? ` / ${row.servico}` : ""}`,
      row.tipo,
      row.favorecido,
      row.vencimento,
      row.situacao,
      money(row.valor * 100),
      money(row.saldo * 100),
      money(row.baixasNoPeriodo * 100),
    ];
    cells.forEach((t, i) => {
      draw(fitted(t, widths[i] ?? 50), cols[i] ?? 30, y, 8);
    });
    y -= 19;
    if (row.situacao !== "Cancelado") {
      amount += row.valor;
      left += row.saldo;
      paid += row.baixasNoPeriodo;
    }
  }
  if (y < 80) next();
  draw(
    `${rows.length} registros | Total sem cancelados R$ ${money(amount * 100)} | Saldo atual R$ ${money(left * 100)} | Baixas no período R$ ${money(paid * 100)}`,
    30,
    y - 10,
    10,
    true,
  );
  draw(
    "Saldo = posição atual em aberto. Baixas = valor efetivo no período. Detalhamento completo disponível no Excel.",
    30,
    y - 28,
    8,
  );
  draw(String(doc.getPageCount()), 800, 20, 8);
  return doc.save();
}
