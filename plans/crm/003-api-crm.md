# 003 — Módulo de API `/crm`

- **Status**: FEITO
- **Fase**: 1
- **Entregue**: `apps/api/src/crm/` com 6 submódulos e 41 rotas, eventos
  `crm.*`, dois jobs no scheduler, sala WebSocket por funil, busca global
  estendida e 8 ferramentas MCP
- **Verificado**: 16 testes de integração contra Postgres real
  (`tests/api-integration/crm.test.ts`), cobrindo numeração de negócio,
  histórico de etapa, rotting, ganho/perda, board com agregados em SQL,
  visibilidade por dono, exportação auditada e vazamento na busca

## Problema

Nenhuma rota comercial existe. As 25 features de `apps/api/src/` seguem o
padrão `index.ts` (rotas Hono + `describeRoute` + `validator` Valibot) com a
lógica em `controllers/`, e o CRM precisa seguir o mesmo — mas com ~8
entidades ele não cabe como oito diretórios na raiz de `src/`.

## Alvo

### Estrutura (como ficou)

```
apps/api/src/crm/
  index.ts                 -- agrega os submódulos: crm.route("/deal", deal), ...
  subscribe-events.ts      -- eventos crm.* -> notificações
  pipeline/index.ts        + controllers/   (funis, etapas, motivos de perda)
  deal/index.ts            + controllers/
  contact/index.ts         + controllers/
  company/index.ts         + controllers/
  activity/index.ts        + controllers/
  field/index.ts           + controllers/   (definições e valores customizados)
  shared/
    resolve-visibility.ts  -- "own" | "all" a partir de hasWorkspacePermission
    deal-number.ts         -- sequencial por workspace, com retry no unique
    record-stage-change.ts -- fecha/abre linha em crm_stage_history
    list-filters.ts        -- paginação, escopo por dono e busca textual
    slug.ts, unique-violation.ts
```

`report/` fica para o 007.

**Desvio do plano**: as rotas não usam lookups novos no
`workspace-access-middleware`. Todas carregam `workspaceId` na query (GET,
DELETE) ou no corpo (POST, PATCH), e todo controller filtra por ele também —
mais simples, sem tocar em middleware compartilhado, e igualmente seguro
porque um id de outro workspace resulta em 404.

Montagem em `apps/api/src/index.ts`, junto das demais:
`const crmApi = api.route("/crm", crm);`

### Rotas (fase 1)

| Método | Rota | Permissão |
|---|---|---|
| GET | `/crm/pipeline?workspaceId` | `crmPipeline:read` |
| POST/PATCH/DELETE | `/crm/pipeline[/:id]` | `crmPipeline:manage` |
| GET/POST/PATCH/DELETE | `/crm/pipeline/:id/stage[/:stageId]` | `crmPipeline:manage` |
| GET | `/crm/deal/board?workspaceId&pipelineId` | `crmDeal:read` |
| GET | `/crm/deal?workspaceId&…filtros` | `crmDeal:read` |
| GET | `/crm/deal/:id` | `crmDeal:read` |
| POST | `/crm/deal` | `crmDeal:create` |
| PATCH | `/crm/deal/:id` | `crmDeal:update` |
| PATCH | `/crm/deal/:id/stage` | `crmDeal:change_stage` |
| POST | `/crm/deal/:id/win` · `/lose` · `/reopen` | `crmDeal:change_stage` |
| DELETE | `/crm/deal/:id` | `crmDeal:delete` |
| GET/POST/PATCH/DELETE | `/crm/contact[/:id]` | `crmContact:*` |
| GET | `/crm/contact/export?workspaceId` | `crmContact:export` |
| GET/POST/PATCH/DELETE | `/crm/company[/:id]` | `crmCompany:*` |
| GET/POST/PATCH/DELETE | `/crm/activity[/:id]` | `crmDeal:update` |
| POST | `/crm/activity/:id/complete` | `crmDeal:update` |
| GET/POST/PATCH/DELETE | `/crm/field[/:id]` | `crmField:manage` |
| GET/PUT | `/crm/field/value/:entity/:entityId` | `crmPipeline:read` / `crmDeal:update` |

44 rotas ao todo. A leitura das definições de campo fica em `crmPipeline:read`
porque é necessária para renderizar qualquer formulário do CRM; só a
configuração exige `crmField:manage`.

Todas com `operationId`, `tags: ["CRM"]` e `responses` no `describeRoute`,
como em `apps/api/src/project/index.ts:28`.

### `GET /crm/deal/board` — a rota que decide a performance do módulo

Retorna, numa chamada:

```ts
{
  pipeline: { id, name },
  stages: [{
    id, name, position, probability, outcome, color, rottingDays,
    dealCount: number,          // COUNT(*) agregado no SQL
    totalValueCents: number,    // SUM agregado no SQL
    deals: Deal[]               // 50 primeiros por position
  }]
}
```

Regras:
- Agregados por etapa vêm de `COUNT`/`SUM` no Postgres, **nunca** somando o
  array no cliente — senão o rodapé da coluna mente quando há paginação.
- 50 negócios por etapa, com `hasMore` e cursor por `position`.
- Owner, empresa e contato principal vêm em join, não em N+1.
- Filtro de visibilidade aplicado antes da paginação.

### Transição de etapa

`PATCH /crm/deal/:id/stage` faz, na mesma transação:
1. valida que a etapa pertence ao mesmo pipeline do negócio;
2. atualiza `stageId`, `position`, `stageEnteredAt`;
3. se a etapa nova tem `outcome='won'|'lost'`, ajusta `status`, `wonAt`/`lostAt`
   (e exige `lostReasonId` quando `lost`);
4. fecha a linha aberta de `crm_stage_history` (`exitedAt`, `durationSeconds`)
   e abre a nova;
5. `publishEvent("crm.deal.stage_changed" | "crm.deal.won" | "crm.deal.lost", …)`.

Reordenar dentro da mesma etapa **não** grava histórico nem reinicia
`stageEnteredAt`.

### Eventos publicados

`crm.deal.created`, `crm.deal.updated`, `crm.deal.stage_changed`,
`crm.deal.won`, `crm.deal.lost`, `crm.deal.assigned`,
`crm.activity.created`, `crm.activity.completed`, `crm.activity.due`.

Assinantes: broadcast WS para o board (`apps/api/src/ws`), criação de
notificação (`notification/controllers/create-notification.ts`) e, mais tarde,
integrações (008).

### Agendamentos

Em `apps/api/src/scheduler/index.ts` (`scheduler/crm-reminders.ts`):
- `checkCrmActivityReminders` — atividades com `dueAt` chegando e
  `completedAt is null`, a cada 5 min.
- `checkRottingDeals` — negócios cuja `stageEnteredAt` passou de
  `stage.rottingDays`. De hora em hora: negócio parado muda em escala de dias,
  não vale ocupar o ciclo de 5 min.

Nenhuma coluna nem tabela de controle foi necessária: a própria linha de
`notification` serve de marcador ("já avisei"). Como mover de etapa renova
`stageEnteredAt`, um aviso antigo deixa de valer automaticamente — que é
exatamente o comportamento desejado.

### Busca global

Estender `apps/api/src/search/controllers/global-search.ts` com os tipos
`"deal" | "contact" | "company"` no union `SearchResult["type"]` e nas queries
`ilike`. Sem isso o Cmd+K não acha cliente, e a equipe comercial vai usar o
Cmd+K antes de usar o menu.

**Cuidado que só apareceu na implementação**: a rota já tinha um gate de
permissão por tipo, mas `type=all` cai num ramo genérico. Sem tratamento, uma
busca "all" devolveria negócios e contatos para quem não tem nenhum acesso ao
CRM, e devolveria o funil do time inteiro para um vendedor. A rota agora
resolve seis flags (`read` e `read_all` de deal/contact/company) e as passa ao
controller, que omite cada bloco sem permissão e filtra por dono sem
`read_all`. Coberto por teste.

### MCP

Oito ferramentas em `apps/api/src/mcp/tools.ts`: `crm_list_pipelines`,
`crm_get_board`, `crm_search_contacts`, `crm_create_lead`, `crm_create_deal`,
`crm_move_deal_stage`, `crm_list_lost_reasons` e `crm_log_activity`.
`crm_create_lead` faz empresa + contato + negócio numa chamada, que é o que
transforma uma conversa em funil sem digitação.

### Tempo real

Sala WebSocket por funil, com o mesmo transporte das salas de projeto: rota
`/ws/crm/:pipelineId` e chave de sala `crm:<pipelineId>` (`crmPipelineRoom`),
prefixada para nunca colidir com um id de projeto. Os eventos `crm.deal.*`
viram mensagens `CRM_DEAL_CREATED/UPDATED/MOVED/DELETED`.

## Convenções do repo a seguir

- Handler fino; regra de negócio no controller (CLAUDE.md, "Adding API Endpoints").
- Erros com `HTTPException`, nunca `throw new Error`.
- Auditar mutações relevantes com `recordAuditLog` (padrão em
  `apps/api/src/project/index.ts:5`) — no mínimo win/lose/delete e exportação
  de contatos.
- Testes: unitários em `tests/api/`, integração em `tests/api-integration/`.

## Fora de escopo

- Sincronização de e-mail e telefonia (008, fase 4).
- Propostas e catálogo de produtos (fase 3).
