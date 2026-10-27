# Fase 4 — Financeiro em tabelas

## Contas a receber e Contas a pagar
- O Financeiro tem as abas **Resumo**, **Contas a receber**, **Contas a pagar** e **Cadastros**.
- Filtros simples: período, situação, ordenação (vencimento, valor, descrição) e pesquisa. Os filtros avançados saíram da tela (a API continua aceitando).
- Cobranças recorrentes aparecem mês a mês (coluna Competência) com o botão **Dar baixa**. A baixa parcial e o estorno continuam como antes.
- "Ver cobranças" em Contratos e recorrência abre Contas a receber já filtrada pelo contrato.

## Comprovante de pagamento
- Imagem ou PDF de até 10 MB, anexado na baixa ou depois, na janela do lançamento.
- Gravado no disco da VPS, na pasta `LOCAL_UPLOAD_DIR` (volume `nortys_uploads`), em `finance/<workspace>/`.
- A API confere o conteúdo do arquivo (não só a extensão) e só entrega o arquivo para quem tem acesso financeiro ao workspace.
- Migração `0019_finance-attachment`.
- As rotas ficam fora do cliente tipado (`finance/attachment-routes.ts`), pois a cadeia de rotas do financeiro já está no limite de tipos.

## Venda avulsa
- Cada item pontual de uma venda gera uma conta a receber na data da venda, com vendedor e serviço, para a comissão "na venda" ser liberada na baixa.

## Telas simplificadas
- Contratos e recorrência: sem cartões de resumo; filtros de período, situação e cliente.
- Comissões: sem aba Resumo; filtros de período e vendedor.
- Taxas: sem aba Resumo; filtros de período e perfil.
- Os painéis de resumo de comissões e taxas ficaram sem uso na tela; o painel geral vai para o BI na Fase 7.
