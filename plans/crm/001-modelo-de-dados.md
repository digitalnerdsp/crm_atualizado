# 001 — Modelo de dados do CRM

- **Status**: FEITO
- **Fase**: 1
- **Entregue**: 14 tabelas `crm_*` em `schema.ts`, coluna `project.crmCompanyId`,
  relations, schemas Valibot e a migration `drizzle/0003_crm-core.sql`
- **Verificado**: cadeia completa 0000→0003 aplicada num Postgres limpo; `bigint`
  em `value_cents`, índices parciais criados, e o comportamento de
  unique/restrict/cascade conferido com dados reais

## Problema

`apps/api/src/database/schema.ts` não tem nenhuma entidade comercial. Não há
onde guardar empresa cliente, contato, oportunidade, valor, etapa de funil ou
histórico de negociação. Projetos hoje não sabem de quem são.

## Alvo

Todas as tabelas em `apps/api/src/database/schema.ts`, seguindo as convenções
do arquivo: PK `text` com `createId()`, `createdAt`/`updatedAt`, FK sempre com
`onDelete`/`onUpdate` explícitos, índice em toda FK consultada.

### Funil

```ts
crm_pipeline
  id, workspaceId → workspace (cascade)
  name, slug, description
  isDefault boolean default false
  position integer default 0
  archivedAt timestamp
  createdAt, updatedAt
  idx: workspaceId | unique(workspaceId, slug)

crm_stage
  id, pipelineId → crm_pipeline (cascade)
  name, slug
  position integer default 0
  probability integer default 0          -- 0..100, alimenta o forecast ponderado
  outcome text default 'open'            -- 'open' | 'won' | 'lost'
  color text
  rottingDays integer                    -- null = não apodrece
  createdAt, updatedAt
  idx: pipelineId | unique(pipelineId, slug)
```

Todo pipeline nasce com uma etapa `outcome='won'` e uma `outcome='lost'`,
criadas junto com ele; elas não podem ser excluídas (regra no controller).

### Empresa e contato

```ts
crm_company
  id, workspaceId → workspace (cascade)
  name, legalName, taxId               -- CNPJ/CPF, sem máscara
  domain, website, phone
  industry, employeeCount integer
  ownerUserId → user (set null)
  addressLine, addressNumber, addressComplement,
    district, city, state, postalCode, country default 'BR'
  description
  archivedAt
  createdAt, updatedAt
  idx: workspaceId, ownerUserId, (workspaceId, domain)
  unique parcial: (workspaceId, taxId) where taxId is not null

crm_contact
  id, workspaceId → workspace (cascade)
  companyId → crm_company (set null)
  firstName, lastName, email, phone, mobile
  jobTitle, department, linkedinUrl
  ownerUserId → user (set null)
  isPrimary boolean default false        -- contato principal da empresa
  emailOptOut boolean default false      -- LGPD
  consentSource text, consentAt timestamp
  notes
  archivedAt
  createdAt, updatedAt
  idx: workspaceId, companyId, ownerUserId, (workspaceId, email)
```

`taxId` e `email` **não** são unique global: o mesmo CNPJ pode existir em dois
workspaces, e o mesmo e-mail pode aparecer em contatos de empresas diferentes.
Deduplicação é tratada na importação (008), não por constraint.

### Negócio

```ts
crm_deal
  id, workspaceId → workspace (cascade)
  number integer                          -- sequencial por workspace
  pipelineId → crm_pipeline (cascade)
  stageId → crm_stage (restrict)
  title
  companyId → crm_company (set null)
  primaryContactId → crm_contact (set null)
  ownerUserId → user (set null)           -- vendedor responsável
  createdByUserId → user (set null)
  valueCents bigint({mode:"number"}) default 0
  currency text default 'BRL'
  probability integer                     -- null = herda da etapa
  expectedCloseDate timestamp
  status text default 'open'              -- 'open' | 'won' | 'lost'
  wonAt, lostAt timestamp
  lostReasonId → crm_lost_reason (set null)
  lostReasonNote text
  source text                             -- 'inbound' | 'outbound' | 'indicacao' | ...
  position integer default 0              -- ordem dentro da etapa
  stageEnteredAt timestamp not null       -- base do cálculo de rotting
  lastActivityAt timestamp
  nextActivityAt timestamp                -- desnormalizado, evita subquery no board
  archivedAt
  createdAt, updatedAt
  idx: workspaceId, pipelineId, stageId, ownerUserId, companyId,
       (stageId, position), expectedCloseDate, status
  unique: (workspaceId, number)
```

`number` segue o padrão de `task.number` (unique por escopo). O incremento
usa a mesma estratégia já aplicada em `create-task` — ler e escrever dentro
da mesma transação, com retry no conflito de unique.

`nextActivityAt`/`lastActivityAt` são desnormalizações mantidas pelo
controller de atividade. Sem elas, o board faz uma subquery por card.

```ts
crm_deal_contact                          -- múltiplos contatos por negócio
  id, dealId → crm_deal (cascade), contactId → crm_contact (cascade)
  role text                               -- 'decisor' | 'influenciador' | 'tecnico' | 'financeiro'
  unique: (dealId, contactId) | idx: dealId, contactId

crm_lost_reason
  id, workspaceId → workspace (cascade)
  name, position integer, isActive boolean default true
  unique: (workspaceId, name)
```

### Histórico de etapa (base dos relatórios)

```ts
crm_stage_history
  id, dealId → crm_deal (cascade)
  fromStageId → crm_stage (set null)
  toStageId → crm_stage (set null)
  changedByUserId → user (set null)
  enteredAt timestamp not null
  exitedAt timestamp                       -- null = etapa atual
  durationSeconds integer                  -- preenchido no exit
  idx: dealId, toStageId, enteredAt
```

Escrita em toda transição de etapa (fecha a linha anterior, abre a nova).
Sem isso não existe conversão por etapa nem tempo médio de ciclo — e
reconstruir depois a partir de log é impossível.

### Atividades comerciais (timeline)

```ts
crm_activity
  id, workspaceId → workspace (cascade)
  type text not null                       -- 'call'|'meeting'|'email'|'note'|'task'|'whatsapp'
  subject text not null, body text
  dealId → crm_deal (cascade)
  contactId → crm_contact (set null)
  companyId → crm_company (set null)
  ownerUserId → user (set null)
  dueAt timestamp, completedAt timestamp
  durationMinutes integer
  outcome text                             -- 'connected'|'no_answer'|'rescheduled'|...
  calendarEventId → calendar_event (set null)   -- reunião espelhada na agenda
  createdByUserId → user (set null)
  createdAt, updatedAt
  idx: workspaceId, dealId, contactId, companyId, ownerUserId,
       (ownerUserId, dueAt) where completedAt is null
```

O índice parcial `(ownerUserId, dueAt) where completedAt is null` é o que faz
a tela "minhas atividades de hoje" ser barata.

### Campos customizados

```ts
crm_field_definition
  id, workspaceId → workspace (cascade)
  entity text not null                     -- 'deal' | 'contact' | 'company'
  key text not null, label text not null
  type text not null                       -- 'text'|'number'|'date'|'select'|'multiselect'|'checkbox'|'url'|'currency'
  options jsonb                            -- para select/multiselect
  isRequired boolean default false
  showOnCard boolean default false
  position integer default 0
  unique: (workspaceId, entity, key) | idx: (workspaceId, entity)

crm_field_value
  id, definitionId → crm_field_definition (cascade)
  entityId text not null                   -- id do deal/contact/company
  value text default ''                    -- serializado; jsonb para multiselect
  unique: (definitionId, entityId) | idx: entityId
```

Referência polimórfica sem FK é intencional: uma FK por entidade exigiria três
tabelas de valor. A limpeza é feita no `delete` de cada entidade.

### Etiquetas

```ts
crm_tag
  id, workspaceId → workspace (cascade), name, color
  unique: (workspaceId, name)

crm_entity_tag
  id, tagId → crm_tag (cascade), entity text, entityId text
  unique: (tagId, entity, entityId) | idx: (entity, entityId)
```

Não reusamos `label`: `label` é preso a `task_id` e tem unique
`(task_id, name)` incompatível.

### Vínculo com projetos

```ts
project                                    -- ALTERAÇÃO em tabela existente
  + crmCompanyId text → crm_company (set null)   -- de qual cliente é este projeto
  + idx: crmCompanyId

crm_deal_project
  id, dealId → crm_deal (cascade), projectId → project (cascade)
  relationType text default 'delivery'     -- 'delivery' | 'related'
  createdAt
  unique: (dealId, projectId) | idx: dealId, projectId
```

Duas relações, propositalmente: **empresa → projeto** (1:N) responde "quais
projetos são deste cliente", inclusive para cliente de retainer que nunca
passou por um negócio; **negócio ↔ projeto** (N:N) responde "este projeto
nasceu deste negócio fechado". Ver 006.

### Fase 3 (migration separada)

```ts
crm_product        -- catálogo: name, sku, description, unitPriceCents, currency,
                   -- taxRatePercent, recurrence ('one_time'|'monthly'|'yearly'), isActive
crm_deal_product   -- linhas de receita: dealId, productId, description, quantity,
                   -- unitPriceCents, discountPercent, totalCents
crm_quote          -- proposta: dealId, number, status, validUntil, subtotalCents,
                   -- discountCents, totalCents, currency, notes, sentAt, acceptedAt
crm_quote_item     -- itens da proposta
crm_lead           -- caixa de leads não qualificados, com convertedDealId
```

## Convenções do repo a seguir

- Estilo de tabela: copiar `taskTable` (`schema.ts:441`) — `$defaultFn(createId)`,
  `timestamp({ mode: "date" })`, `$onUpdate(() => new Date())`.
- Relations: adicionar em `apps/api/src/database/relations.ts`, mesmo padrão dos
  imports alfabéticos já existentes.
- Schemas Valibot de resposta em `apps/api/src/schemas.ts`, ao lado de
  `projectSchema`/`taskSchema`.
- Migration: `pnpm --filter @kaneo/api db:generate`. Roda sozinha no boot.

## Fora de escopo

- Não alterar `task`, `column`, `activity`, `label`.
- Única alteração em tabela existente: a coluna `crmCompanyId` em `project`.
