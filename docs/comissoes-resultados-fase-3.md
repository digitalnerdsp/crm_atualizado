# Fase 3 — Comissões e resultados

Entrega cumulativa do Nortys: preserva o financeiro da fase 1 e os contratos/recorrências da fase 2. Novo acesso: **Financeiro → Comissões e resultados**.

## Entrega

- Resumo com receita faturada, lucro bruto, lucro líquido gerencial, resultado previsto dos títulos, lucro presumido estimado, comissões e caixa; comparação com período anterior de mesma duração.
- Gráficos de lucro bruto/líquido por mês, comissões atual × anterior e recebimentos/pagamentos. Prejuízos aparecem como valores negativos, com eixo central.
- Apuração por período, vendedor e serviço; listagem paginada com origem, percentual, base, valores apurados, emitidos, pagos, disponíveis e emitidos a maior.
- Histórico de regras de comissão por serviço, vigência, percentual e base (faturado ou recebido).
- Geração de conta a pagar ao vendedor pelo saldo de comissão disponível, com vencimento escolhido. O título e a cobrança de origem podem ser abertos na própria apuração para consultar baixas, pagar, estornar ou cancelar conforme as permissões existentes.
- Classificação gerencial de custos e despesas, com preservação dos valores/baixas e auditoria da alteração.
- Relatórios Excel `.xlsx` e PDF com todos os resultados filtrados, independente da página na tela. Excel contém resumo, comissões, despesas e vínculos dos títulos gerados.

## Regras de comissão

O vendedor é o usuário indicado na cobrança financeira, não o contato do cliente. A cobrança precisa ser operacional, a receber, com serviço e vendedor. A regra é cadastrada por serviço, com percentual entre 0% e 100%, precisão de duas casas e vigência de hoje em diante. Cada alteração cria uma versão; 0% interrompe a comissão nas novas cobranças. A data de uma nova versão não pode anteceder a última regra cadastrada, inclusive quando houver vigência futura.

Novas cobranças manuais e recorrências registram a regra vigente na competência **no momento em que são criadas**. A regra, o percentual e a base ficam na cobrança; mudanças posteriores não reescrevem o histórico, inclusive em títulos futuros já emitidos. Os nomes do serviço e do vendedor também são preservados nas cobranças capturadas. O percentual continua aplicado quando o valor de um título não pago é corrigido, respeitados os bloqueios de edição.

A comissão é por cobrança/ciclo, incluindo contratos recorrentes; não é restrita à primeira venda. Parcelamentos seguem cada título emitido. Não há split entre vendedores, metas, faixas progressivas, prêmio fixo ou comissão por negócio ainda não lançado no financeiro nesta etapa.

- **Faturado:** percentual sobre o valor nominal, reconhecido na competência da cobrança. Descontos posteriores não alteram essa base.
- **Recebido:** percentual sobre principal baixado menos desconto; juros e multas não integram a base. Considera baixas ativas e suas datas. O cálculo usa o acumulado de cada cobrança e arredondamento em centavos, evitando sobras ao dividir recebimentos.
- Uma cobrança cancelada não gera comissão disponível. Estornar uma baixa reduz a comissão atualmente apurada sobre recebimentos.

Títulos antigos começam sem comissão e não são alterados automaticamente pela migração. A ação **Aplicar regra vigente** permite incluir explicitamente uma cobrança de competência atual/futura, com serviço e vendedor, sem regra registrada e sem baixa ativa. Não aplica comissão retroativa em cobranças passadas nem troca uma regra já registrada.

## Contas a pagar e conferência

A emissão calcula a diferença positiva entre a comissão acumulada **até hoje** e todos os títulos de comissão ativos já gerados para a origem. Não emite comissões de competências futuras antes da data, mesmo quando o relatório consulta um período futuro. O vendedor deve continuar pertencendo ao workspace para gerar um novo título.

A operação usa transação, bloqueio da cobrança e chave idempotente. Repetir a mesma solicitação retorna o mesmo título; gerar novamente só emite uma diferença adicional efetivamente disponível. Novas baixas parciais podem habilitar outra emissão.

O pagamento acontece pelas baixas do financeiro. Não significa transferência bancária automática. A edição manual do valor de uma comissão gerada é bloqueada; para corrigir um título ainda sem baixa, cancele-o e gere novamente com outra solicitação. Títulos pagos precisam do fluxo normal de estorno antes de cancelamento. Comissões manuais antigas continuam como despesas independentes; não duplique uma comissão automática em lançamento manual.

Se um recebimento for estornado ou a origem cancelada depois da emissão, o título de comissão **não é apagado nem reduzido automaticamente**. A tela indica o valor emitido a maior. É necessário conferir os vínculos, cancelar o título não pago ou registrar o acerto financeiro conforme o caso. A sincronização contratual preserva títulos com baixa ou comissão ativa emitida e grava aviso. Também é bloqueada a edição manual de uma origem com comissão ativa emitida.

Os saldos acumulados respeitam o fim do período consultado. A lista inclui movimentações do período e títulos com saldo de comissão pendente ou emitido a maior, mesmo que sua competência seja antiga. Os títulos cancelados de comissão deixam de consumir saldo; seu histórico permanece no financeiro e na auditoria.

## Resultados gerenciais

Somente lançamentos de natureza operacional participam. Saldos iniciais e transferências ficam fora. Valores em BRL, em centavos inteiros.

| Indicador | Cálculo |
| --- | --- |
| Receita faturada | Contas a receber não canceladas, por competência |
| Lucro bruto | Receita faturada menos custos diretos, por competência |
| Lucro líquido gerencial | Lucro bruto menos despesas operacionais, impostos lançados, despesas financeiras, despesas sem classificação, comissões manuais e comissões apuradas; ajustes das baixas entram na data da baixa |
| Resultado previsto dos títulos | Mesmo demonstrativo, substituindo a comissão apurada pela comissão integral potencial dos títulos de receita da competência |
| Lucro presumido estimado | Receita faturada × percentual de presunção informado pelo usuário |
| Saldo de caixa do período | Recebimentos efetivos menos pagamentos efetivos, pelas datas das baixas, incluindo ajustes |

Contas a pagar geradas pela apuração não são deduzidas novamente pelo principal no lucro gerencial: a despesa já está na comissão apurada. Juros, multas e descontos de seus pagamentos compõem ajustes financeiros. O caixa inclui os pagamentos reais desses títulos.

As despesas podem ser classificadas como custo direto, despesa operacional, imposto, despesa financeira ou comissão manual. Novos e antigos lançamentos manuais começam como **não classificados** e reduzem o lucro líquido; o dashboard alerta que a classificação dos custos diretos é necessária para conferir o lucro bruto. A classificação é uma organização gerencial e pode ser corrigida com auditoria, inclusive em títulos baixados.

O resultado previsto contempla **títulos já lançados**, incluindo os ciclos emitidos pela fase 2. Não estima receitas de oportunidades nem contratos sem cobranças geradas. Comissões sobre recebimento seguem as datas das baixas; por isso, podem aparecer em período diferente da competência da receita.

O percentual de presunção começa vazio, pode ser removido ou configurado de 0% a 100%, e aplica-se ao período selecionado e ao comparativo anterior. Trata-se de simulação gerencial, não de apuração do regime tributário Lucro Presumido: não calcula IRPJ, CSLL ou alíquotas legais, nem oferece um percentual padrão. A etapa de taxas/impostos continua separada.

Filtros por vendedor e serviço restringem receitas e despesas aos vínculos preenchidos. Custos gerais sem esses vínculos não são rateados; a tela informa quantas despesas foram excluídas. Para visão global da empresa, mantenha os filtros em Todos. O período máximo por consulta é de 731 dias; a proteção existente de até 50.000 lançamentos por workspace é mantida.

## Permissões e API

Todas as rotas ficam sob `/api/finance/:workspaceId/performance`, com isolamento de workspace e `finance.read`. Configurações usam `finance.manage`; classificação usa `finance.update`; aplicação explícita de regra exige ambos; geração exige `finance.manage` e `finance.create`. Exportação exige `finance.export`. Baixas e estornos mantêm `finance.settle`/permissões existentes. Padrões restritos a administrador/proprietário são mantidos.

Principais rotas: `GET /report`, `GET /configuration`, `POST /rules`, `PUT /settings`, `PUT /entries/:id/classification`, `POST /entries/:id/apply-rule`, `POST /entries/:id/issue`, `GET /export/:format`. Acrescentado `GET /api/finance/:workspaceId/entries/:id` para abrir títulos vinculados com validação de acesso.

## Instalação e ativação

1. Fazer backup do PostgreSQL e substituir o código pela entrega cumulativa.
2. Usar o ambiente de Node.js compatível com o projeto e pnpm 10.32.1. Executar `pnpm install --frozen-lockfile` e `pnpm build`.
3. Aplicar a migração `0011_commissions-results-phase-three` pelo fluxo Drizzle do projeto: `pnpm --filter @kaneo/api db:migrate`. O diário e o snapshot estão incluídos. Não executar novamente o SQL fora do controle de migrações.
4. Reiniciar API e frontend, preservando as configurações de ambiente da instalação. A imagem Docker substitui os marcadores de URL pelo `env.sh`; para hospedagem estática, informar VITE_API_URL e VITE_CLIENT_URL antes do build.
5. Abrir **Comissões e resultados → Regras**, cadastrar percentuais e base por serviço. Conferir vendedores nas cobranças e classificar despesas. A partir daí, novas cobranças registram as regras; aplicar explicitamente nos títulos existentes elegíveis, se necessário.
6. Homologar os percentuais e as classificações com os responsáveis financeiros antes da operação real.

Nenhum banco de produção foi alterado durante o desenvolvimento. As instruções das fases anteriores continuam em `docs/financeiro-fase-1.md` e `docs/contratos-recorrencia-fase-2.md`.

## Validação

Testes de cálculo cobrem recebimentos líquidos, arredondamento acumulado, reconhecimento por faturamento/recebimento, prejuízo, caixa/competência, classificação, presunção, saldos antigos e não duplicação de despesas. Integração aplica as migrações em PostgreSQL embutido (PGlite) e cobre histórico de regras, emissão idempotente, baixas parciais, estorno, cancelamento/regeneração, bloqueios, permissões, isolamento, contratos e arquivos Excel/PDF.

O typecheck isolado geral da API mantém os erros preexistentes registrados na fase 1; o frontend e o módulo financeiro da API são verificados separadamente. O teste visual usa dados simulados e não substitui a homologação com o banco da instalação.

Verificação da entrega: **423 testes da suíte principal e 87 de integração aprovados (510 no total)**. Build dos cinco pacotes concluído, lint dos arquivos alterados sem erros, typecheck do frontend e do módulo financeiro da API sem erros. Telas de resumo, comissão, classificação e regras verificadas em desktop/celular com dados simulados, sem erros de JavaScript ou transbordamento horizontal da página.
