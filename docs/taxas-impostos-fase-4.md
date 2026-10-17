# Fase 4 — Taxas, impostos e calculadora de vendas

Entrega cumulativa: mantém o financeiro, a recorrência contratual e as comissões/resultados das fases 1 a 3. Novo acesso: **Financeiro → Taxas e impostos**.

## Funcionalidades

- Dashboard próprio com indicadores de impostos e despesas financeiras lançados/pagos, além de indicadores de simulações salvas: quantidade, valor bruto, líquido, impostos, taxas e comissões.
- Comparativo com período anterior de mesma duração e gráficos mensais de impostos lançado × pago e valor simulado bruto × líquido. Valores negativos são exibidos como negativos.
- Calculadora em dois sentidos: preço de venda → valor líquido; líquido desejado → menor preço em centavos que atinge esse líquido com os parâmetros informados.
- Perfis de taxas e impostos com itens percentuais e/ou fixos, observações, ativação/inativação e histórico de versões.
- Comissão manual, sem comissão ou percentual da regra vigente por serviço na data da simulação, integrando a fase 3.
- Custo da entrega/serviço, serviço, vendedor e data configuráveis por cálculo.
- Histórico imutável de simulações, preservando valores, parâmetros, nomes, versão do perfil e origem da comissão.
- Consulta dos impostos e despesas financeiras reais classificados no financeiro, com abertura para conferência e baixa pelas permissões existentes.
- Filtros por período, perfil, serviço e vendedor; relatórios Excel `.xlsx` e PDF completos, independentemente da página visível na tela.

## Calculadora e limites do modelo

Os perfis começam vazios: nenhuma alíquota fiscal é preenchida automaticamente. Cada item contém nome, tipo (imposto ou taxa), percentual sobre a venda e valor fixo por venda. O usuário informa os parâmetros aplicáveis à operação.

Todos os percentuais incidem **de forma aditiva sobre o mesmo preço bruto**. Os valores fixos são cobrados uma vez por venda simulada. Não há cobrança por parcela, por unidade ou por periodicidade nesta calculadora. Um perfil pode ficar sem itens para simulações apenas com custo e/ou comissão.

**Líquido = preço bruto − impostos calculados − taxas calculadas − comissão − custo.**

No sentido direto, um preço insuficiente pode produzir líquido negativo. No sentido inverso, o líquido desejado deve ser positivo. O cálculo considera o arredondamento individual de cada item em centavos e procura o menor preço válido dentro do limite monetário. Não utiliza uma busca binária simples, pois múltiplos arredondamentos podem causar pequenas quedas locais do líquido quando o preço aumenta um centavo.

Limites: até 20 itens por perfil; nomes distintos; percentual individual de 0% a 99,99%; soma dos percentuais com a comissão abaixo de 100%; valores monetários não negativos de até 1 trilhão de centavos (R$ 10 bilhões), com preço da venda e líquido desejado positivos. Se o preço necessário exceder o limite, a API retorna erro de validação. Todos os valores são em BRL, com precisão de centavos; percentuais têm duas casas decimais.

Este modelo não determina regime tributário, alíquotas legais, faixas, retenções, créditos, substituição tributária ou tributos por dentro. Os itens chamados impostos representam os parâmetros informados, sem emissão de guias, notas fiscais ou declarações. O percentual de presunção gerencial da fase 3 continua independente; ele não é somado automaticamente aos encargos da venda.

## Comissão e custo

A opção **Usar regra do serviço na data** exige serviço com regra de comissão vigente. A API utiliza o percentual da versão correspondente à data informada. A projeção considera recebimento integral do valor bruto, sem desconto, inclusive quando a regra da fase 3 é sobre recebimentos. Não utiliza juros ou multas como base.

Sem regra vigente, o cálculo informa o problema e pede o cadastro de uma regra ou escolha de comissão manual; não assume silenciosamente 0%. Uma regra de 0% é válida. Se a soma do percentual do perfil com a comissão alcançar 100%, o cálculo é recusado.

A comissão manual é informada explicitamente em percentual sobre o bruto; **Sem comissão** exclui essa parcela. O custo é um valor fixo da entrega/serviço por venda, informado pelo usuário, e não é importado dos títulos financeiros.

A simulação não cria venda, contrato, conta a receber, conta a pagar, obrigação tributária ou comissão a pagar. A apuração e emissão real de comissão continuam no módulo da fase 3, de acordo com as cobranças e baixas financeiras.

## Histórico e concorrência

Cada edição do perfil cria nova versão, inclusive alteração do nome, observações ou ativação. Inativar impede novos cálculos com esse perfil, preservando as simulações anteriores. A calculadora utiliza a versão atual selecionada; a data da simulação não escolhe automaticamente versões históricas do perfil. Ela serve à referência da comissão e ao filtro do histórico.

Ao salvar, o servidor recalcula os resultados e confere a assinatura da simulação exibida. Se perfil, nomes associados ou regra de comissão mudarem, exige novo cálculo em vez de salvar valores diferentes silenciosamente. Alterar um campo da calculadora também limpa o resultado na interface.

Simulações salvas registram a fotografia dos parâmetros e resultados, com título e data. Renomear serviços/vendedores ou editar/inativar perfis depois não reescreve esses registros. Repetir a mesma solicitação de gravação retorna o mesmo registro; reutilizar a chave com outros dados gera conflito. Não há edição ou exclusão das simulações nesta etapa; para comparar alternativas, salve outro cenário identificado.

Cada cenário salvo é contado nos indicadores, inclusive alternativas da mesma venda. Os totais do histórico não representam faturamento realizado.

## Dashboard e integração financeira

Os indicadores reais usam os lançamentos operacionais a pagar classificados como **Imposto** ou **Despesa financeira** na fase 3. O atalho da aba Lançamentos reais leva ao módulo de classificação. Despesas financeiras incluem os itens classificados dessa forma, e não somente taxas de meios de pagamento.

Valores lançados usam competência; pagos usam a data efetiva de cada baixa e incluem descontos, juros e multas. Títulos cancelados, saldos iniciais, transferências e baixas estornadas são excluídos, seguindo o comportamento do financeiro existente. A aba Lançamentos reais lista títulos da competência filtrada; os KPIs de pagamentos podem incluir baixas de títulos de competências anteriores.

Os filtros do resumo/histórico/exportação não alteram os campos da calculadora. O filtro de perfil restringe apenas simulações; serviço e vendedor também restringem os lançamentos reais, conforme os vínculos preenchidos. Não há rateio automático de despesas sem vínculo. Perfil cadastrado ou simulação salva não modifica nenhum lançamento real.

O relatório Excel contém Resumo, Simulações, Itens dos cálculos e Lançamentos reais. O PDF inclui os parâmetros e detalhamento de todas as simulações filtradas. O formato Excel é `.xlsx`, não o formato legado `.xls`.

Limites de consulta: 731 dias por período, 1.000 perfis, 10.000 simulações por workspace e a proteção existente de 50.000 lançamentos financeiros. As listas de simulações e lançamentos reais mostram 25 registros por página; as exportações não se limitam à página da tela.

## Permissões e API

Isolamento por workspace, usando as permissões financeiras existentes. Leitura, cálculo e histórico: `finance.read`; criar/editar perfil: `finance.manage`; salvar simulação: `finance.create`; exportar: `finance.export`. Abrir e baixar lançamentos reais mantém as permissões de consulta, baixa e estorno do financeiro. As permissões padrão continuam restritas a administrador/proprietário.

Rotas sob `/api/finance/:workspaceId/taxes`:

| Método e rota | Uso |
| --- | --- |
| GET `/configuration` | Perfis e parâmetros atuais |
| GET `/profiles/:id` | Histórico de versões do perfil |
| POST `/profiles` | Criar perfil |
| PUT `/profiles/:id` | Nova versão do perfil |
| POST `/calculate` | Calcular valores no servidor |
| POST `/simulations` | Salvar resultado conferido, com chave idempotente |
| GET `/report` | Indicadores, comparações e histórico filtrado |
| GET `/export/:format` | Exportar `.xlsx` ou PDF |

## Instalação e ativação

1. Fazer backup do PostgreSQL e substituir o código pela entrega cumulativa.
2. Usar Node.js **>=20.19**, conforme `package.json`, e pnpm **10.32.1**. Executar `pnpm install --frozen-lockfile`.
3. Compilar os pacotes: `DO_NOT_TRACK=1 TURBO_TELEMETRY_DISABLED=1 pnpm -r --workspace-concurrency=2 --if-present run build`.
4. Aplicar a migração `0012_taxes-sale-calculator-phase-four` pelo fluxo Drizzle: `pnpm --filter @kaneo/api db:migrate`. O diário e o snapshot estão incluídos. Não executar o SQL novamente fora do controle de migrações.
5. Reiniciar API/frontend, preservando as variáveis da instalação. A imagem Docker substitui os marcadores de URL pelo `env.sh`; hospedagem estática precisa de VITE_API_URL e VITE_CLIENT_URL antes do build.
6. Abrir **Taxas e impostos → Perfis**, cadastrar os parâmetros e usar a Calculadora. Para dados reais no dashboard, conferir a classificação dos lançamentos em Comissões e resultados → Custos e despesas.

Nenhum banco de produção foi alterado nesta entrega. Documentação anterior: `financeiro-fase-1.md`, `contratos-recorrencia-fase-2.md` e `comissoes-resultados-fase-3.md`.

## Validação

**437 testes da suíte principal e 100 de integração aprovados, 537 no total.** Build dos cinco pacotes concluído. Integração com PostgreSQL embutido (PGlite), aplicando todas as migrações do projeto.

Cobertura dos novos testes: cálculo direto/inverso, preço mínimo em centavos, taxas fixas, arredondamentos individuais e limites monetários; separação entre simulações e financeiro real; parâmetros e nomes preservados; edição/inativação; salvamento idempotente; comissão por serviço e recálculo obrigatório; isolamento e permissões; validação de payload e arquivos Excel/PDF.

Typecheck do frontend e do módulo financeiro da API, além de lint dos arquivos alterados. O typecheck geral isolado da API mantém os erros preexistentes registrados na fase 1. A verificação visual usa respostas simuladas e não substitui a homologação com os dados da instalação.

Verificação visual concluída em desktop e celular: resumo, cálculo, salvamento, edição de perfil e histórico, sem erros de JavaScript ou transbordamento horizontal da página. Alterar um parâmetro limpa o resultado anterior antes de nova gravação.
