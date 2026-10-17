# 004 — Pipeline: board de negócios

- **Status**: FEITO (board, lista e ficha do negócio; contatos/empresas/atividades ficam no 005)
- **Fase**: 1
- **Entregue**: grupo "Comercial" na sidebar, board com dnd-kit, diálogo de
  ganho/perda, ficha do negócio com histórico de etapas, lista filtrável,
  fetchers/hooks tipados pelo RPC do Hono, socket do funil e namespace `crm`
  no i18n
- **Verificado**: aplicação rodando de verdade contra um Postgres isolado —
  arrastar entre etapas, soltar em Ganho/Perdido, reordenar dentro da coluna,
  criar negócio pelo modal, tema claro e escuro. Dois bugs achados e corrigidos
  no processo (ver abaixo).

## Problema

O board de tarefas (`apps/web/src/components/kanban-board/`) é acoplado a
tarefa, coluna e projeto. Um pipeline comercial mostra outra coisa: valor por
etapa, probabilidade, vendedor, dias parado, próxima atividade — e o
arrastar-para-fechado abre um diálogo de ganho/perda que o board de tarefas
não tem.

## Alvo

### Rotas (TanStack Router, file-based)

Entregues neste plano:

```
routes/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/
  index.tsx              -> board do funil padrão, com seletor de funil
  deals/index.tsx        -> lista filtrável
  deals/$dealId.tsx      -> ficha do negócio
```

O board não usa `pipeline.$pipelineId`: o seletor de funil é estado local sobre
a mesma rota, porque a rota do funil padrão é a que a equipe abre 99% do tempo.

Ficam para os planos seguintes: `contacts/`, `companies/`, `activities/` (005),
`reports/` (007) e `settings/crm/` (007/008). A sidebar já lista esses itens —
eles apontam para rotas que ainda não existem.

### Sidebar

Novo grupo **"Comercial"** em `apps/web/src/components/nav-main.tsx`, abaixo de
"Projetos", com itens Pipeline / Negócios / Contatos / Empresas / Atividades /
Relatórios, cada um gated pelos helpers de 002. Ícones lucide:
`Handshake`, `Contact`, `Building2`, `PhoneCall`, `TrendingUp`.

O grupo só aparece se `canViewCrm()`. O vocabulário nunca reusa "projeto".

### Board (`components/crm/pipeline-board/`)

Reusa o setup de `@dnd-kit` de `components/kanban-board` (mesmos sensores,
mesmo `cubic-bezier(0.23, 1, 0.32, 1)` definido no plano de motion 001), mas
com componentes próprios. **Não** abstrair um board genérico agora: os dois
divergem em card, cabeçalho, rodapé e ações de soltar.

- **Cabeçalho da coluna**: nome, probabilidade %, contagem, soma formatada
  em BRL (`Intl.NumberFormat`), cor da etapa.
- **Card do negócio**: título, empresa, valor, avatar do dono, etiqueta de
  próxima atividade (ou aviso vermelho "sem próxima atividade" — o hábito que
  o Pipedrive ensina), badge de dias parado quando passa de `rottingDays`,
  campos customizados com `showOnCard`.
- **Soltar em etapa `won`/`lost`**: abre diálogo. `won` confirma valor e data
  de fechamento; `lost` exige motivo (`crm_lost_reason`) e aceita observação.
- **Atualização otimista** com rollback no erro, padrão dos mutation hooks
  existentes; invalidação por `["crm","board",pipelineId]`.
- **Tempo real**: assinar os eventos WS `crm.deal.*` e reconciliar o cache —
  sem isso dois vendedores no mesmo funil se sobrescrevem.
- **Rodapé fixo**: total do funil e total ponderado (Σ valor × probabilidade).

### Ficha do negócio (`deals.$dealId`)

Layout de três faixas, seguindo `components/task/task-details-sheet.tsx`:
- **esquerda**: título editável inline, valor, moeda, data prevista, funil e
  etapa (com stepper clicável), origem, campos customizados;
- **centro**: timeline de `crm_activity` + composer de nota/ligação/reunião,
  e anexos via `asset`;
- **direita**: empresa, contatos vinculados com papel, dono, etiquetas,
  projetos vinculados (006), botões Ganhar / Perder.

### Lista de negócios (`deals.tsx`)

Tabela com filtros combináveis (etapa, dono, empresa, valor, data prevista,
etiqueta, campo customizado), ordenação, seleção em massa reusando
`components/bulk-selection`, e ações em massa: mudar dono, mudar etapa,
adicionar etiqueta. Exportação CSV atrás de `crmContact:export`.

### Dados

- Fetchers em `apps/web/src/fetchers/crm/{deal,contact,company,pipeline,activity}/`.
- Query hooks em `hooks/queries/crm/`, mutations em `hooks/mutations/crm/`.
- Chaves de cache com prefixo `["crm", ...]` para invalidação em bloco.

### i18n

Novo namespace `crm` em `i18n/pt-BR.json` e `i18n/en-US.json`, registrado em
`i18n/resources.ts` e refletido em `i18n/schema.json`. Termos fixados em
pt-BR: negócio, funil, etapa, contato, empresa, atividade, ganho, perdido,
motivo da perda, previsão de fechamento, ponderado.

## Convenções do repo a seguir

- Componentes coss/Base UI (`components/ui/`) — não introduzir shadcn/Radix novo.
- Tokens de movimento do `apps/web/src/index.css`; nada de curva digitada à mão.
- Toasts com `sonner`; estados de carregamento e erro sempre tratados.
- `pnpm --filter @kaneo/web typecheck` limpo antes de commitar.

## Bugs encontrados na verificação

1. **Reordenar dentro da etapa "Perdido" era rejeitado.** A API exigia
   `lostReasonId` em qualquer movimento para uma etapa de perda, inclusive
   quando o negócio já estava perdido e só mudava de posição. Corrigido em
   `move-deal-stage.ts`: o motivo (e a observação) do negócio são preservados
   quando a etapa não muda. Coberto por teste de integração.
2. **O select de motivo mostrava o id cru** em vez do nome. O `SelectValue` do
   coss renderiza o valor quando não recebe filhos; passa a renderizar o nome.

Também ajustado durante a verificação: o histórico de etapas mostrava só data e
"1d". A API passou a devolver os nomes das etapas (`fromStageName`/`toStageName`
via `alias()`) e o frontend formata a duração em s/min/h/d — "1d" para uma etapa
que durou 59 segundos era mentira.

## Boundaries

- Não tocar em `components/kanban-board/` (o board de tarefas continua como está).
- Sem virtualização nesta fase; a paginação de 50 por etapa de 003 basta.
