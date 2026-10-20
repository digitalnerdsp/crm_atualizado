import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { type BiReport, labels, type Metric } from "./model";

const countKeys = new Set([
  "contracts",
  "expiry",
  "disabledBilling",
  "simulation",
]);
const marginKeys = new Set(["grossMargin", "netMargin"]);
const formatted = (k: string, v: number | null) =>
  v === null
    ? "Não aplicável"
    : countKeys.has(k)
      ? String(v)
      : marginKeys.has(k)
        ? `${v.toFixed(2)}%`
        : (v / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
export async function excelBi(r: BiReport) {
  const book = new ExcelJS.Workbook();
  book.creator = "Nortys";
  book.created = new Date(r.generatedAt);
  function sheet(
    name: string,
    headers: string[],
    rows: unknown[][],
    moneyColumns: number[] = [],
  ) {
    const s = book.addWorksheet(name);
    s.columns = headers.map((header) => ({ header, width: 28 }));
    for (const row of rows) s.addRow(row);
    s.views = [{ state: "frozen", ySplit: 1 }];
    s.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, s.rowCount), column: headers.length },
    };
    for (const c of moneyColumns)
      s.getColumn(c).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    s.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    return s;
  }
  sheet(
    "Contexto",
    ["Parâmetro", "Valor"],
    [
      ...Object.entries(r.filters),
      ["Data de referência", r.referenceDate],
      ["Gerado em", r.generatedAt],
      ["Comparativo início", r.previousPeriod.from],
      ["Comparativo fim", r.previousPeriod.to],
      ...r.warnings.map((v) => ["Regra", v]),
    ],
  );
  sheet(
    "Indicadores",
    ["Indicador", "Atual", "Anterior", "Unidade"],
    Object.entries(labels).map(([k, label]) => [
      label,
      formatted(k, r.current[k as Metric]),
      formatted(k, r.previous[k as Metric]),
      countKeys.has(k) ? "Quantidade" : marginKeys.has(k) ? "%" : "BRL",
    ]),
  );
  sheet(
    "Evolução",
    [
      "Período",
      "Receita",
      "Despesa títulos",
      "Lucro líquido",
      "Recebido",
      "Pago",
      "Previsto receber",
      "Previsto pagar",
      "MRR",
    ],
    r.months.map((m) => [
      m.label,
      m.revenue / 100,
      m.expenses / 100,
      m.net / 100,
      m.received / 100,
      m.paid / 100,
      m.expectedIncome / 100,
      m.expectedExpense / 100,
      m.mrr === null ? null : m.mrr / 100,
    ]),
    [2, 3, 4, 5, 6, 7, 8, 9],
  );
  for (const [k, title] of [
    ["services", "Serviços"],
    ["companies", "Clientes"],
    ["sellers", "Vendedores"],
  ] as const)
    sheet(
      title,
      ["ID", "Nome", "Receita", "Resultado vinculado", "Vencido", "Comissão"],
      r.rankings[k].map((x) => [
        x.id,
        x.name,
        x.revenue / 100,
        x.result / 100,
        x.overdue / 100,
        x.commission / 100,
      ]),
      [3, 4, 5, 6],
    );
  sheet(
    "Despesas",
    ["Classificação", "Valor"],
    r.composition.map((x) => [x.label, x.value / 100]),
    [2],
  );
  sheet(
    "Categorias",
    ["Categoria do recorte", "Valor"],
    r.expenseCategories.map((x) => [x.label, x.value / 100]),
    [2],
  );
  sheet(
    "Colaboradores",
    ["Vínculo do recorte", "Valor"],
    r.labor.map((x) => [x.label, x.value / 100]),
    [2],
  );
  sheet(
    "Vencimentos",
    ["Faixa", "Quantidade", "Saldo"],
    r.aging.map((x) => [x.label, x.count, x.value / 100]),
    [3],
  );
  sheet(
    "Projeções",
    ["Dias", "Início", "Fim", "Entradas", "Saídas", "Movimento líquido"],
    r.projection.map((x) => [
      x.days,
      x.from,
      x.to,
      x.income / 100,
      x.expense / 100,
      x.net / 100,
    ]),
    [4, 5, 6],
  );
  sheet(
    "Alertas",
    ["Alerta", "Quantidade", "Valor"],
    r.alerts.map((x) => [x.label, x.count, formatted(x.metric, x.value)]),
  );
  sheet(
    "Simulações - resumo",
    ["Indicador de cenários", "Valor"],
    Object.entries(r.simulationSummary)
      .filter(([key]) => key.startsWith("simulat"))
      .map(([key, value]) => [
        key,
        key === "simulationCount" ? value : Number(value) / 100,
      ]),
  );
  for (const [index, group] of [
    [
      1,
      [
        "revenue",
        "expenses",
        "received",
        "paid",
        "movement",
        "gross",
        "net",
        "presumed",
      ],
    ],
    [
      2,
      [
        "receivable",
        "payable",
        "overdueReceivable",
        "overduePayable",
        "commission",
        "availableCommission",
        "commissionOpen",
        "commissionPaid",
        "commissionExcess",
        "tax",
        "fee",
        "taxPaid",
        "feePaid",
        "taxOpen",
        "feeOpen",
        "unclassified",
        "expenseSlice",
      ],
    ],
    [
      3,
      [
        "mrr",
        "contracts",
        "expiry",
        "disabledBilling",
        "simulation",
        "projection",
      ],
    ],
  ] as const) {
    const rows = group.flatMap((key) =>
      r.details[key].map((x) => [
        labels[key],
        x.kind,
        x.id,
        x.label,
        x.date,
        x.value / (countKeys.has(key) ? 1 : 100),
        countKeys.has(key) ? "Quantidade" : "BRL",
        x.note,
      ]),
    );
    sheet(
      `Composição ${index}`,
      [
        "Indicador",
        "Origem",
        "ID",
        "Descrição",
        "Data",
        "Valor assinado",
        "Unidade",
        "Observação",
      ],
      rows,
    );
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function pdfBi(r: BiReport) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([842, 595]);
  let y = 550;
  const clean = (v: string) =>
    v
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, " ");
  const text = (s: string, x: number, yy: number, size = 10, b = false) =>
    page.drawText(clean(s), {
      x,
      y: yy,
      size,
      font: b ? bold : regular,
      color: rgb(0.1, 0.16, 0.24),
    });
  const next = (title: string) => {
    page = doc.addPage([842, 595]);
    y = 550;
    text(title, 35, y, 17, true);
    y -= 30;
  };
  const line = (s: string) => {
    const chunks = clean(s).match(/.{1,140}(?:\s|$)|.{1,140}/g) ?? [""];
    for (const c of chunks) {
      if (y < 45) next("BI financeiro - continuacao");
      text(c, 35, y, 9);
      y -= 14;
    }
  };
  text("Nortys | BI financeiro", 35, y, 21, true);
  y -= 30;
  line(
    `${r.filters.from} a ${r.filters.to} | Referencia ${r.referenceDate} | Gerado ${r.generatedAt}`,
  );
  line(`Comparacao ${r.previousPeriod.from} a ${r.previousPeriod.to}`);
  for (const [k, v] of Object.entries(r.filters)) line(`${k}: ${v}`);
  y -= 10;
  for (const [k, label] of Object.entries(labels)) {
    if (y < 50) next("Indicadores financeiros");
    text(label, 35, y, 10);
    text(formatted(k, r.current[k as Metric]), 440, y, 10, true);
    text(`Anterior: ${formatted(k, r.previous[k as Metric])}`, 610, y, 9);
    y -= 18;
  }
  const chart = (
    title: string,
    keys: { key: string; label: string; color: [number, number, number] }[],
  ) => {
    next(title);
    const data = r.months;
    const size = Math.max(1, Math.ceil(data.length / 18));
    for (let offset = 0; offset < data.length; offset += 18) {
      if (offset) next(`${title} - continuacao`);
      const rows = data.slice(offset, offset + 18);
      const max = Math.max(
        1,
        ...rows.flatMap((m) =>
          keys.map((k) => Math.abs(Number(m[k.key as keyof typeof m] ?? 0))),
        ),
      );
      const width = 730 / Math.max(1, rows.length);
      const zero = 300;
      page.drawLine({
        start: { x: 40, y: zero },
        end: { x: 800, y: zero },
        thickness: 1,
        color: rgb(0.65, 0.65, 0.65),
      });
      rows.forEach((m, i) => {
        keys.forEach((k, j) => {
          const value = Number(m[k.key as keyof typeof m] ?? 0);
          const h = (Math.abs(value) / max) * 150;
          page.drawRectangle({
            x: 45 + i * width + j * (width / (keys.length + 1)),
            y: value >= 0 ? zero : zero - h,
            width: Math.max(2, width / (keys.length + 1) - 2),
            height: h,
            color: rgb(...k.color),
          });
        });
        text(m.label, 43 + i * width, 120, 7);
      });
      keys.forEach((k, i) => {
        text(`${k.label} (R$)`, 45 + i * 230, 500, 10, true);
      });
      y = 85;
      line(
        `Escala maxima R$ ${(max / 100).toFixed(2)}. Barras abaixo do eixo representam valores negativos. ${size > 1 ? "Grafico dividido por periodos." : ""}`,
      );
    }
  };
  chart("Receita, despesas e resultado", [
    { key: "revenue", label: "Receita", color: [0.15, 0.4, 0.8] },
    {
      key: "expenses",
      label: "Despesas dos titulos",
      color: [0.85, 0.25, 0.3],
    },
    { key: "net", label: "Lucro liquido gerencial", color: [0.1, 0.65, 0.45] },
  ]);
  chart("Recebimentos e pagamentos", [
    { key: "received", label: "Recebido", color: [0.1, 0.65, 0.45] },
    { key: "paid", label: "Pago", color: [0.85, 0.25, 0.3] },
  ]);
  chart("Evolucao do MRR", [
    { key: "mrr", label: "MRR ate a data atual", color: [0.4, 0.3, 0.8] },
  ]);
  next("Projecoes e alertas");
  for (const p of r.projection)
    line(
      `${p.days} dias (${p.from} a ${p.to}): entradas ${formatted("revenue", p.income)} | saidas ${formatted("expenses", p.expense)} | movimento ${formatted("movement", p.net)}`,
    );
  for (const a of r.alerts)
    line(`${a.label}: ${a.count} registros | ${formatted(a.metric, a.value)}`);
  if (!r.alerts.length) line("Nenhum alerta para o recorte selecionado.");
  next(
    `Rankings - 10 maiores por ${{ revenue: "receita", result: "resultado vinculado", overdue: "saldo vencido", commission: "comissoes" }[r.filters.ranking ?? "revenue"]}`,
  );
  for (const [key, title] of [
    ["services", "Servicos"],
    ["companies", "Clientes"],
    ["sellers", "Vendedores"],
  ] as const) {
    line(title);
    for (const x of r.rankings[key].slice(0, 10))
      line(
        `${x.name}: receita ${formatted("revenue", x.revenue)} | resultado vinculado ${formatted("net", x.result)} | vencido ${formatted("overdueReceivable", x.overdue)}`,
      );
    y -= 10;
  }
  next("Regras e qualidade dos dados");
  for (const w of r.warnings) line(w);
  line(
    "Rankings completos e composicao dos indicadores estao no Excel. Simulacoes sao cenarios independentes, sem efeito no resultado realizado.",
  );
  doc.getPages().forEach((p, i) => {
    p.drawText(`${i + 1} / ${doc.getPageCount()}`, {
      x: 770,
      y: 20,
      size: 8,
      font: regular,
    });
  });
  return doc.save();
}
