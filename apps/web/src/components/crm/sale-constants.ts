export type PaymentForm =
  | "cash"
  | "pix"
  | "boleto"
  | "card"
  | "installments"
  | "custom";

export const PAYMENT_FORM_LABEL: Record<PaymentForm, string> = {
  cash: "À vista",
  pix: "PIX",
  boleto: "Boleto",
  card: "Cartão",
  installments: "Parcelado",
  custom: "Outra (texto livre)",
};

export const SALE_KIND_LABEL = {
  one_time: "Pagamento único",
  recurring: "Recorrente",
  mixed: "Único + recorrente",
} as const;

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  active: "Contrato ativo",
  paused: "Contrato pausado",
  cancelled: "Contrato cancelado",
  finished: "Contrato encerrado",
};
