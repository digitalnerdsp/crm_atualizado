import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { assemble } from "./controller";

type Report = ReturnType<typeof assemble>;
export async function exportPortfolio(r: Report, format: "xlsx" | "pdf") {
  if (format === "xlsx") {
    const b = new ExcelJS.Workbook();
    b.creator = "Nortys";
    const sheet = (name: string, headers: string[], rows: unknown[][]) => {
      const s = b.addWorksheet(name);
      s.columns = headers.map((header) => ({ header, width: 28 }));
      rows.forEach((row) => {
        s.addRow(row);
      });
      s.views = [{ state: "frozen", ySplit: 1 }];
      s.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, s.rowCount), column: headers.length },
      };
    };
    sheet(
      "Contexto",
      ["Campo", "Valor"],
      [
        ...Object.entries(r.filters),
        ["Referência da fila", r.referenceDate],
        ["Gerado em", r.generatedAt],
        ["Custos sem cliente R$", r.unassignedExpenseCents / 100],
        [
          "Regra",
          "Estimativas de horas são separadas do resultado financeiro. Cenário exige conciliação explícita. Horas abertas não custeadas. Sem taxa/acordo aparece pendência. Fechar acompanhamento não baixa/renova a origem.",
        ],
      ],
    );
    sheet(
      "Fila",
      [
        "Origem",
        "ID",
        "Cliente",
        "Descrição",
        "Data",
        "Valor R$",
        "Situação",
        "Responsável ID",
        "Próxima ação",
        "Próxima data",
        "Promessa",
        "Promessa R$",
      ],
      r.queue.map((x) => [
        x.sourceKind,
        x.sourceId,
        x.companyName,
        x.title,
        x.sourceDate,
        x.amountCents / 100,
        x.status,
        x.follow?.ownerUserId,
        x.follow?.nextAction,
        x.follow?.nextOn,
        x.follow?.promiseOn,
        (x.follow?.promiseCents ?? 0) / 100,
      ]),
    );
    sheet(
      "Histórico da carteira",
      [
        "ID",
        "Cliente",
        "Origem",
        "Data da origem",
        "Situação",
        "Fora da fila atual",
        "Próxima ação",
        "Data",
      ],
      r.caseHistory.map((c) => [
        c.id,
        c.companyName,
        c.sourceKind,
        c.sourceDate,
        c.status,
        c.resolved ? "Sim" : "Não",
        c.follow.nextAction,
        c.follow.nextOn,
      ]),
    );
    sheet(
      "Clientes",
      [
        "ID",
        "Cliente",
        "Receita R$",
        "Resultado R$",
        "Margem %",
        "Vencido R$",
        "Custo estimado sites R$",
        "Horas sites",
        "Horas sem custo",
      ],
      r.companies.map((c) => [
        c.id,
        c.name,
        c.revenueCents / 100,
        c.resultCents / 100,
        c.margin,
        c.overdueCents / 100,
        c.estimatedLaborCents / 100,
        c.seconds / 3600,
        c.missingSeconds / 3600,
      ]),
    );
    sheet(
      "Sites",
      [
        "ID",
        "Site",
        "Cliente",
        "Receita período R$",
        "Resultado período R$",
        "Resultado total R$",
        "Estimativa execução período R$",
        "Estimativa total R$",
        "Cenário período R$",
        "Cenário total R$",
        "Horas estimadas",
        "Horas realizadas",
      ],
      r.sites.map((x) => [
        x.id,
        x.name,
        x.companyName,
        x.finance.revenueCents / 100,
        x.finance.netProfitCents / 100,
        x.totalFinancial.netProfitCents / 100,
        x.estimatedLaborCents / 100,
        x.totalEstimatedLaborCents / 100,
        x.scenarioCents === null ? null : x.scenarioCents / 100,
        x.totalScenarioCents === null ? null : x.totalScenarioCents / 100,
        x.estimateMinutes / 60,
        x.seconds / 3600,
      ]),
    );
    sheet(
      "Colaboradores",
      [
        "Site",
        "Colaborador",
        "Modelo",
        "Horas período",
        "Horas totais",
        "Estimativa R$",
        "Estimativa total R$",
        "Já lançado R$",
        "Origem financeira",
        "Horas sem custo",
      ],
      r.sites.flatMap((x) =>
        x.workers.map((w) => [
          x.name,
          w.name,
          w.mode,
          w.seconds / 3600,
          w.totalSeconds / 3600,
          w.estimatedCents / 100,
          w.totalEstimatedCents / 100,
          w.bookedCents / 100,
          w.sourceEntryId,
          w.missingSeconds / 3600,
        ]),
      ),
    );
    sheet(
      "Minutas",
      [
        "ID",
        "Cliente ID",
        "Título",
        "Situação",
        "Proposto R$",
        "Texto",
        "Decisão",
      ],
      r.drafts.map((x) => [
        x.id,
        x.companyId,
        x.title,
        x.status,
        x.proposedCents / 100,
        x.body,
        x.decision,
      ]),
    );
    return new Uint8Array(await b.xlsx.writeBuffer());
  }
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let p = doc.addPage();
  let y = 790;
  const clean = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, " ");
  const line = (text: string) => {
    for (const s of clean(text).match(/.{1,100}/g) ?? [""]) {
      if (y < 45) {
        p = doc.addPage();
        y = 790;
      }
      p.drawText(s, { x: 35, y, size: 10, font });
      y -= 16;
    }
  };
  line("NORTYS - GESTAO DA CARTEIRA");
  line(
    `${r.filters.from} a ${r.filters.to} | Fila em ${r.referenceDate} | ${r.generatedAt}`,
  );
  line("RESULTADOS DOS CLIENTES (BRL)");
  for (const c of r.companies)
    line(
      `${c.name}: receita ${(c.revenueCents / 100).toFixed(2)} | resultado ${(c.resultCents / 100).toFixed(2)} | estimativa sites ${(c.estimatedLaborCents / 100).toFixed(2)} | sem custo: ${(c.missingSeconds / 3600).toFixed(2)}h`,
    );
  line("COBRANCAS E RENOVACOES");
  for (const q of r.queue)
    line(
      `${q.sourceDate} | ${q.companyName} | ${q.title} | R$ ${(q.amountCents / 100).toFixed(2)} | ${q.status} | ${q.follow?.nextAction ?? "Sem proxima acao"}`,
    );
  line("HISTORICO DOS ACOMPANHAMENTOS");
  for (const x of r.caseHistory)
    line(
      `${x.sourceDate} | ${x.companyName} | ${x.status} | ${x.resolved ? "Origem resolvida/alterada" : "Origem ativa"} | ${x.follow.nextAction}`,
    );
  line("MINUTAS E DECISOES INTERNAS");
  for (const x of r.drafts) {
    line(
      `${x.title} | ${x.status} | R$ ${(x.proposedCents / 100).toFixed(2)} | ${x.decision ?? ""}`,
    );
    line(x.body);
  }
  line("SITES / COLABORADORES");
  for (const x of r.sites) {
    line(
      `${x.name}: resultado total R$ ${(x.totalFinancial.netProfitCents / 100).toFixed(2)} | horas ${(x.seconds / 3600).toFixed(2)} | custo estimado total R$ ${(x.totalEstimatedLaborCents / 100).toFixed(2)}`,
    );
    for (const w of x.workers)
      line(
        `  ${w.name} | ${w.mode} | ${(w.seconds / 3600).toFixed(2)}h periodo | R$ ${(w.estimatedCents / 100).toFixed(2)} estimados | origem ${w.sourceEntryId ?? "Nao conciliada"}`,
      );
  }
  line(
    "Estimativas separadas de caixa e resultado financeiro. Projetos sem dados de custo suficientes nao recebem cenario completo. Fechar acompanhamento nao quita nem renova a origem. Minuta aprovada nao altera automaticamente contratos ou cobrancas. Detalhes completos no Excel.",
  );
  return doc.save();
}
