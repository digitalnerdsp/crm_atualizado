# 007 — Relatórios e forecast

- **Status**: FEITO
- **Fase**: 3
- **Entregue**: 7 relatórios em `apps/api/src/crm/report/`, tela `crm/reports`
  com filtro de período, e componentes de gráfico próprios
- **Verificado**: aplicação rodando com histórico real de funil — funil,
  forecast, velocidade, ranking, motivos de perda, origem e receita × entrega,
  em tema claro e escuro. 5 testes de integração novos.

## Problema

Sem números, o gestor comercial não adota a ferramenta. E não existe nenhuma
biblioteca de gráficos em `apps/web/package.json` — o dashboard atual
(`apps/api/src/dashboard/index.ts`) devolve contagens renderizadas como texto.

## Alvo

### Dependência: **não foi adicionada**

O plano previa `recharts`. Na implementação, duas coisas mudaram a decisão:

1. O repo tem commits recentes reduzindo o bundle do frontend
   (`perf: reduce frontend bundle footprint`, `perf: optimize deploy`).
   Somar ~100 KB gzip de biblioteca de gráficos anda na direção oposta.
2. Estes relatórios precisam de barras horizontais, barras agrupadas e tabelas.
   Nada disso exige uma engine de gráficos.

Os componentes ficaram em `components/crm/charts/`: `BarList` (barra por linha,
proporcional ao maior valor), `GroupedBars` (séries lado a lado por período) e
`ReportCard` (moldura com estado de carregamento próprio). Somam ~200 linhas,
usam os tokens de cor do tema e funcionam em claro e escuro.

Se um dia aparecer um relatório que peça linha temporal com eixos, zoom ou
tooltip rica, aí sim vale a dependência — e o wrapper já existe para receber.

### Relatórios (fase 3)

1. **Funil de conversão** — negócios que entraram em cada etapa e quantos
   avançaram, no período. Vem de `crm_stage_history`; é impossível calcular
   sem ele, e por isso o histórico entra já no 001.

   **Correção feita na verificação**: a primeira versão media "esta etapa sobre
   a anterior" e produziu 133% e 150% com dados reais — negócios criados
   direto no meio do funil quebram essa comparação. A métrica virou **taxa de
   avanço**: dos que entraram nesta etapa, quantos chegaram a uma etapa
   posterior. É limitada a 100% por construção e responde a pergunta que as
   pessoas realmente fazem. Etapas de fechamento não recebem taxa — um 0%
   permanente ali leria como fracasso.
2. **Forecast ponderado** — Σ `valueCents × probabilidade` agrupado por mês de
   `expectedCloseDate`, com corte por funil e por dono. Comparado ao fechado
   real do mesmo mês.
3. **Velocidade do funil** — tempo médio por etapa e ciclo total até ganho,
   de `crm_stage_history.durationSeconds`.
4. **Ranking do time** — por vendedor: abertos, ganhos, perdidos, valor,
   taxa de conversão, ticket médio, atividades registradas.
5. **Motivos de perda** — distribuição por `crm_lost_reason`, cruzada com
   etapa em que se perdeu. É o relatório que muda o discurso comercial.
6. **Origem** — negócios e receita por `source`.
7. **Receita × entrega** (depende de 006) — valor ganho contra horas de
   `time_entry` nas **tarefas** vinculadas, por negócio ou por cliente. O
   relatório que só existe porque CRM e projetos moram juntos.

   Por cliente, as horas contam **todas** as tarefas daquele cliente, não só as
   que nasceram de negócio: suporte e retrabalho também são custo de entrega.
   `revenuePerHourCents` fica `null` quando não há apontamento — "sem dado" e
   "receita infinita por hora" são respostas muito diferentes.

### Implementação

- Um controller por relatório em `apps/api/src/crm/report/controllers/`,
  cada um com sua rota `GET /crm/report/<nome>` e `crmReport:read`.
- **Toda agregação em SQL.** Nada de carregar negócios e somar em JS.
- Visibilidade: `crmReport:read` sem `read_all` restringe a
  `ownerUserId = userId` (o vendedor vê o próprio desempenho).
- Filtros comuns a todos: `workspaceId`, `pipelineId?`, `ownerUserId?`,
  `from`/`to`. Extrair para um validador Valibot compartilhado.
- Cache de 60 s por chave de filtro no cliente (`staleTime` do TanStack Query);
  não vale complicar no servidor nesta fase.

### Tela

`crm/reports` com barra de filtros global e cards de gráfico; cada card exporta
CSV. Formatação monetária sempre por `Intl.NumberFormat` com a moeda do dado,
não uma constante `"R$"`.

## Fora do corte

- **Exportar CSV por card**: previsto no plano, não implementado. A exportação
  de contatos (005) cobre o caso de maior risco; a de relatório é conveniência.
- Filtro por funil e por responsável: a API aceita `pipelineId` e `ownerUserId`
  em todos os endpoints, mas a tela só expõe o período.

## Boundaries

- Não mexer no dashboard operacional existente (`/overview`).
- Sem BI configurável nem construtor de relatório pelo usuário nesta fase.
