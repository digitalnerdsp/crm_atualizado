# Fase 3 — Leads e Vendas

- **Leads**: o Funil do menu Comercial passou a se chamar Leads. As etapas e o cadastro rápido continuam os mesmos; lead não precisa de empresa.
- **Vendas** (`/crm/sales`, API `GET/POST /crm/sale`): venda = negócio ganho. Tabela com data, empresa, serviços, tipo (único, recorrente ou misto), valor, vendedor e situação; filtros de período, vendedor, busca e ordenação. A linha abre a ficha do negócio.
- **Nova venda direta** (sem passar pelos leads): empresa obrigatória, um ou mais serviços (do catálogo ou avulsos, com tipo de cobrança), vendedor, data, observação da venda e de cada item, forma de pagamento (à vista, PIX, boleto, cartão, parcelado ou texto livre — só informação, sem cobrança por parcela). Itens recorrentes geram o contrato na data da venda; se algum passo falha, a venda é desfeita por inteiro.
- **Empresa obrigatória para fechar venda**: mover um lead para a etapa de ganho, ou criar direto como ganho, exige empresa vinculada.
- **Menu Comercial**: Negócios e Contratos saíram. Contratos continuam acessíveis pela venda, pela ficha da empresa e por Financeiro → Contratos e recorrência.
- **Migração `0017_sale-fields`**: só adiciona colunas (`notes`, `payment_form`, `payment_form_note` em `crm_deal`; `notes` em `crm_deal_service`).
- **Fica para a Fase 4**: a conta a receber automática da venda de pagamento único (depende de Contas a receber) e o comprovante na baixa.
- Sem dados reais no sistema, não houve migração de negócios ou contratos antigos nem lista de pendências.
