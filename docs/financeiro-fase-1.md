# Financeiro do Nortys — fase 1

Esta entrega acrescenta o módulo **Financeiro → Resumo e lançamentos** ao workspace. Cada etapa tem dashboard, funcionalidades, testes e validação próprios. A geração automática de contas a partir de contratos, comissões e apuração de lucro pertence às etapas seguintes.

## Funcionalidades implementadas

- Dashboard com recebido operacional, pago operacional, movimento líquido no período, saldo a receber, saldo a pagar e recebíveis vencidos. Comparação com o período anterior de igual duração, com variação percentual; base anterior zero gera “não aplicável”.
- Gráficos mensais de receitas versus despesas, entradas previstas versus recebidas e saídas previstas versus pagas. KPIs abrem o detalhamento da consulta.
- Contas a pagar e receber, competência, vencimento, categoria/subcategoria, favorecido, cliente, vendedor, serviço, natureza, forma de pagamento e observações.
- Categorias com um nível de subcategoria; cadastro de favorecidos e colaboradores PJ, Freelance ou CLT, com ativação/desativação.
- Lançamento único, parcelamento exato do total e repetição manual do valor por ciclo mensal, trimestral ou anual, com até 120 ciclos. A criação é finita; não há cobrança de contratos nem agendamento automático nesta etapa.
- Baixas parciais/totais com desconto, juros, multa, justificativa e data. Registro do principal liquidado separado do valor efetivo movimentado.
- Estorno e cancelamento com motivo obrigatório e trilha de auditoria. Edição apenas sem baixas ativas; versão impede sobrescrita concorrente. Cancelamento exige estornar as baixas antes.
- Proteção transacional contra sobrepagamento e idempotência por solicitação na criação e nas baixas.
- Filtros combinados por período/base de datas, tipo, situação, categoria/subcategoria, colaborador/vínculo, cliente, serviço, vendedor, natureza e texto. Listagem paginada de 50 registros.
- Excel **.xlsx** e PDF verdadeiros com todos os registros filtrados, sem limitação à página atual. Excel mantém colunas de detalhamento e filtros; PDF é um resumo paginado e remete ao Excel para textos longos.

## Instalação

1. Faça backup do banco e do código em uso. Homologue em uma cópia antes de aplicar em produção.
2. Atualize os arquivos do projeto preservando o arquivo `.env` e os dados persistentes da instalação.
3. Use **Node.js compatível com o projeto e pnpm 10.32.1**, fixado no `packageManager`. Execute `pnpm install --frozen-lockfile` na raiz.
4. Execute `pnpm build` na raiz.
5. Para aplicar a migração antes do reinício, execute `pnpm --filter @kaneo/api db:migrate`. A API também executa as migrações automaticamente na inicialização.
6. Reinicie a API e publique o novo build do frontend pelo processo de implantação já utilizado.
7. Acesse um workspace como administrador e abra **Financeiro**. Cadastre as categorias e os colaboradores antes de lançar as despesas.

A migração `0009_finance-phase-one.sql` cria quatro tabelas e seus índices, chaves e restrições. Ela não altera lançamentos de CRM existentes nem converte contratos em cobranças. Reiniciar a API também aplica o backfill das novas permissões aos papéis administrativos existentes, preservando alterações já realizadas pelo administrador após esse backfill.

Para implantação estática fora do Docker, defina `VITE_API_URL` com a URL real da API ao executar o build. O `.env.production` original contém marcadores substituídos pelo `env.sh` na imagem Docker; servir esses marcadores sem substituição impede a autenticação. Mantenha o processo de substituição no Docker ou forneça as variáveis Vite no build.

### Permissões

O recurso `finance` possui ações `read`, `create`, `update`, `settle`, `export` e `manage`. Todas as operações exigem `read` e a respectiva ação adicional. Proprietários e administradores recebem acesso por padrão. Vendedores, membros, visualizadores e gestores comerciais não recebem acesso financeiro automaticamente.

Para delegar a operação, crie/edite um papel em **Configurações → Workspace → Papéis**, conceda as permissões de Financeiro e atribua o papel ao usuário. As APIs também verificam o workspace dos vínculos e o escopo de chaves API.

## Regras para interpretar os números

- Valores são armazenados em centavos. Na interface, informe reais com vírgula ou ponto e até duas casas decimais, sem separador de milhar.
- No parcelamento, o valor informado é o **total** e a soma das parcelas o preserva, inclusive centavos. Na recorrência manual, é o **valor de cada ciclo**. Datas como dia 31 são ajustadas para o último dia do mês sem perder o dia de referência nos ciclos posteriores.
- Principal da baixa reduz o saldo do título. Valor efetivo = principal − desconto + juros + multa. Baixas futuras e acima do saldo são recusadas.
- Recebido e pago são métricas de caixa pela data das baixas. A base selecionada de competência/vencimento governa as previsões; a base de baixa governa a consulta de movimentações realizadas. Previsões por base de baixa usam vencimento, identificado no comportamento do módulo.
- Saldos do dashboard abrangem títulos vencendo até o final do período, considerando baixas até a menor data entre hoje e o fim do período. O detalhamento de saldo sinaliza essa posição e inclui títulos anteriores ao início do período.
- Estornos retiram o pagamento dos totais e reapresentam os números históricos. Os eventos permanecem no histórico auditável.
- Saldo inicial é uma natureza separada: não compõe receita/despesa operacional, mas integra o movimento líquido após a baixa. Não há conciliação bancária nem transferências internas entre contas nesta fase. “Transferência” na forma de pagamento indica o meio de quitação.
- A classificação PJ/Freelance/CLT é preservada em cada lançamento. Alterar o cadastro do colaborador não reclassifica silenciosamente despesas anteriores.
- Cada lançamento se vincula a um serviço; uma venda com vários serviços deve ser distribuída em lançamentos separados para evitar duplicação de receita nos filtros.
- Por proteção de processamento, a API recusa consultas de workspaces acima de 50.000 lançamentos com mensagem explícita. Uma estratégia de processamento em lote deve ser adicionada antes de operar acima desse volume.

## Verificações

- `pnpm build`: compilação de produção dos pacotes, API e frontend.
- `pnpm test`: suíte de testes existente, acrescida de nove testes financeiros de cálculo, datas, filtros, estornos e conciliação entre gráficos e KPIs.
- `pnpm --filter @kaneo/web typecheck`: tipos do frontend, após gerar as rotas pelo build.
- `pnpm --filter @kaneo/api test:integration -- ../../tests/api-integration/finance.test.ts`: nove cenários de API, com banco PostgreSQL de testes configurado conforme a documentação existente. O banco de teste deve ter nome terminado em `_test`.

Os testes financeiros de integração cobrem autenticação/permissões, isolamento de workspaces, referências externas, restrição de chaves API, parcelas, idempotência, recorrência manual, baixa parcial, sobrepagamento, estorno, cancelamento, edição concorrente, vínculo PJ, validação de datas e exportação de 72 registros com listagem de 50 por página. Nesta entrega eles também foram executados com PostgreSQL embarcado PGlite, aplicando toda a cadeia de migrações.

A verificação isolada de tipos da API completa já apresenta pendências anteriores em arquivos fora do novo módulo. O build de produção usa esbuild; a verificação de tipos do módulo financeiro deve ser considerada separadamente dessas pendências existentes.

Resultados desta entrega: 400 testes da suíte de unidade/componentes, nove testes de integração financeira, build de produção, verificação de tipos do frontend e do módulo financeiro. A interface foi conferida no Chromium em desktop e viewport de 390 px com dados simulados, sem erro JavaScript ou transbordamento horizontal.

## Homologação da instalação

No ambiente do cliente, conferir as permissões atribuídas, criar categoria e colaborador, testar uma conta parcelada, registrar baixa parcial, conferir o dashboard e exportar os relatórios. Testar estorno, cancelamento e acesso com um usuário sem permissão. Validar desktop e celular com os dados reais antes da publicação definitiva.
