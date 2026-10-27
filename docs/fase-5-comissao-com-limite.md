# Fase 5 — Comissão com limite

Cada serviço tem duas porcentagens, configuradas em Financeiro > Desempenho > Regras (com histórico de versões):

- **Na venda (%)**: vale na primeira cobrança (ou no valor total de uma venda avulsa).
- **Na recorrência (%)**: vale nas cobranças seguintes, por **N meses** configuráveis (vazio = sem limite). Depois disso, 0%.

A base é sempre **recebido**: a comissão é liberada quando o financeiro dá baixa no pagamento. A opção "faturado" foi removida.

Exemplo: contrato de 6 meses, 10% na venda e 5% por 2 meses → cobrança 1 = 10%, cobranças 2 e 3 = 5%, cobranças 4 a 6 = 0%.

## Regras de transição
- Migração `0018_commission-limit`: o % atual vira "na venda"; "na recorrência" começa igual, sem limite de meses.
- Cobranças já geradas mantêm a regra com que nasceram; o percentual do ciclo é fixado na geração.

## Pendente em outras fases
- Comissão única da hospedagem vendida e recebível automático de venda avulsa: Fases 4 e 6.
