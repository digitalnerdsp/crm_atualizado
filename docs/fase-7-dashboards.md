# Fase 7 — Dashboards

## Meu painel (vendedor)
- Item "Meu painel" no menu Comercial (antes "Dashboard geral"), para quem tem acesso ao comercial.
- Mostra **somente os números de quem está logado**, mesmo para gestores:
  - vendas do mês (quantidade e valor) e vendas dos últimos 6 meses;
  - **comissão do mês**: o que o cliente já pagou no mês × o percentual gravado em cada cobrança (base "recebido");
  - **previsão do mês seguinte**: cobranças que vencem no mês seguinte × o mesmo percentual.
- API: `GET /api/crm/seller-panel?workspaceId=` (fora do cliente tipado, como os comprovantes).

## Dashboard geral no BI
- A visão geral do Comercial (negócios, vendas do período, carteira, receita recorrente, hospedagem) virou a aba **Comercial** do BI, visível a quem tem acesso ao BI e aos relatórios comerciais.
- "Relatórios comerciais" continua no menu Financeiro.
