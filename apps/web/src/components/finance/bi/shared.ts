import type { BiMetric } from "@/fetchers/finance/bi";
import { money } from "../shared";
export const labels: Record<BiMetric, string> = {
  revenue: "Receita faturada",
  expenses: "Despesas por competência",
  received: "Recebido operacional",
  paid: "Pago operacional",
  movement: "Movimento líquido operacional",
  gross: "Lucro bruto",
  net: "Lucro líquido gerencial",
  grossMargin: "Margem bruta",
  netMargin: "Margem líquida",
  presumed: "Lucro presumido estimado",
  receivable: "Saldo a receber",
  payable: "Saldo a pagar",
  overdueReceivable: "Recebíveis vencidos",
  overduePayable: "Pagamentos vencidos",
  commission: "Comissões apuradas",
  availableCommission: "Comissões disponíveis para emissão",
  commissionOpen: "Títulos de comissão em aberto",
  commissionPaid: "Comissões pagas",
  commissionExcess: "Comissões emitidas a maior",
  tax: "Impostos lançados",
  fee: "Despesas financeiras lançadas",
  taxPaid: "Impostos pagos",
  feePaid: "Despesas financeiras pagas",
  taxOpen: "Impostos em aberto",
  feeOpen: "Despesas financeiras em aberto",
  unclassified: "Despesas não classificadas",
  expenseSlice: "Despesas do recorte específico",
  mrr: "MRR",
  contracts: "Contratos ativos",
  expiry: "Contratos terminando em até 90 dias",
  disabledBilling: "Contratos ativos sem geração financeira",
  simulation: "Cenários salvos (simulações)",
  projection: "Movimento líquido projetado em 90 dias",
};

export const counts = new Set<BiMetric>([
  "contracts",
  "expiry",
  "disabledBilling",
  "simulation",
]);
export const margins = new Set<BiMetric>(["grossMargin", "netMargin"]);
export function formatMetric(k: BiMetric, v: number | null) {
  return v === null
    ? "Não aplicável"
    : counts.has(k)
      ? v.toLocaleString("pt-BR")
      : margins.has(k)
        ? `${v.toFixed(2)}%`
        : money(v);
}
