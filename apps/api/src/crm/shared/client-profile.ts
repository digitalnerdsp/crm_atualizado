import type { CrmSourceChannel } from "../../database/schema";

/**
 * Listas fechadas do cadastro de cliente que precisam existir em tempo de
 * execução. Os tipos das demais (situação, porte, condição de pagamento)
 * ficam no schema; o Valibot da rota os valida por picklist.
 */

/** As 27 unidades federativas. UF não muda; um enum no Postgres exigiria
 * migration para qualquer ajuste e não ganharia nada. */
export const BRAZIL_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

/**
 * Semeadas na criação do workspace: uma lista vazia no primeiro uso significa
 * que ninguém preenche, e origem em branco é exatamente o dado que o
 * relatório de aquisição não consegue reconstruir depois. A migration 0005
 * semeia a mesma lista nos workspaces que já existiam.
 */
export const DEFAULT_CRM_SOURCES: ReadonlyArray<{
  name: string;
  channel: CrmSourceChannel;
}> = [
  { name: "Indicação", channel: "referral" },
  { name: "Cliente atual", channel: "referral" },
  { name: "Meta Ads", channel: "paid" },
  { name: "Google Ads", channel: "paid" },
  { name: "Busca orgânica", channel: "organic" },
  { name: "Prospecção ativa", channel: "outbound" },
  { name: "Evento", channel: "event" },
];
