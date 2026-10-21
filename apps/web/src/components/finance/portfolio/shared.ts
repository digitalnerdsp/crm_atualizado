export const statuses = {
  open: "Aberto",
  waiting: "Aguardando retorno",
  promised: "Pagamento prometido",
  negotiating: "Em negociação",
  done: "Acompanhamento concluído",
  snoozed: "Adiado",
};
export const origins = {
  receivable: "Cobrança",
  contract: "Contrato",
  hosting: "Hospedagem",
};
export const modes: Record<string, string> = {
  unconfigured: "Custo não configurado",
  internal: "Custo interno por hora",
  hourly: "Prestador por hora",
  fixed: "Preço fechado",
  ledger: "Custo já lançado",
};
export const draftStatuses = {
  draft: "Rascunho",
  submitted: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
};
export const hours = (seconds: number) =>
  `${(seconds / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h`;
