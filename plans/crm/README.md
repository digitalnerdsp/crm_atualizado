# CRM Nortys — planejamento

Plano para adicionar um CRM comercial nativo ao Nortys (Kaneo fork), no nível
HubSpot/Pipedrive, integrado ao módulo de gestão de projetos que já existe.

Baseline analisada: commit `e1da2df0`, schema com 39 tabelas em
`apps/api/src/database/schema.ts`, 25 módulos Hono em `apps/api/src/`.

| # | Plano | Fase | Depende de | Status |
|---|-------|------|------------|--------|
| 001 | [Modelo de dados](001-modelo-de-dados.md) | 1 | — | FEITO |
| 002 | [Permissões e papéis comerciais](002-permissoes-e-papeis.md) | 1 | 001 | FEITO |
| 003 | [Módulo de API `/crm`](003-api-crm.md) | 1 | 001, 002 | FEITO |
| 004 | [Pipeline (board de negócios)](004-pipeline-ui.md) | 1 | 003 | FEITO |
| 005 | [Contatos, empresas e timeline](005-contatos-empresas-timeline.md) | 2 | 003 | FEITO |
| 006 | [Vínculo CRM ↔ Entrega (tarefa ↔ cliente)](006-vinculo-crm-projetos.md) | 2 | 004, 005 | FEITO |
| 007 | [Relatórios e forecast](007-relatorios-e-forecast.md) | 3 | 004 | FEITO |
| 008 | [Automações, integrações e importação](008-automacoes-integracoes-importacao.md) | 3–4 | 003, 006 | IMPORTAÇÃO FEITA |
| 009 | [Cadastro de cliente profissional](009-cadastro-de-cliente.md) | 4 | 005 | FEITO |
| 010 | [Catálogo de serviços](010-catalogo-de-servicos.md) | 4 | 009 | FEITO |
| 011 | [Contratos e recorrência](011-contratos-e-recorrencia.md) | 4 | 010 | FEITO |
| 012 | [Relatórios de ERP](012-relatorios-erp.md) | 4 | 009, 010, 011 | FEITO |

Ordem de execução: 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008.
O corte de MVP utilizável pela equipe comercial é ao fim do **006**.

**Fase 4 (009 a 012)** é a virada de CRM para base de dados da empresa: cadastro
de cliente com classificação estruturada, catálogo de serviços, contratos com
receita recorrente e os relatórios de gestão. Ordem: 009 → 010 → 011 → 012.
O 008 é independente e pode entrar em paralelo.

---

## Decisões de arquitetura

### D0 — O cliente pertence à tarefa, não ao projeto

Os projetos desta equipe são por **disciplina** ("Projeto Design" reúne o design
de todos os clientes), não por cliente. Um projeto atende muitos clientes, então
marcar cliente no projeto não diz nada. O vínculo com o CRM fica em
`task.crmCompanyId` (+ `task.crmDealId` opcional). Ver 006 — a primeira versão
daquele plano assumia projeto = cliente e foi corrigida.

### D0.5 — Classificação em lista, nunca em texto livre

`industry`, `city` e `deal.source` nasceram como texto livre na fase 1. Em uso
real isso produz "Marketing", "marketing" e "Mkt" como três segmentos, e todo
relatório de segmentação passa a mentir. A fase 4 move origem e segmento para
tabelas editáveis por workspace, com FK. Ver 009.

### D0.6 — Recorrência é estado, não evento

Um negócio ganho aconteceu numa data. Uma assinatura está ativa hoje, foi
pausada em março e pode cair amanhã. Somar serviços mensais de negócios ganhos
dá um MRR que só cresce. Daí `crm_contract` mais `crm_contract_event` — mesma
razão de `crm_stage_history`: o estado atual não carrega a história. Ver 011.

### D0.7 — Item de venda guarda cópia, não referência

`crm_deal_service` copia nome, tipo de cobrança e preço no momento da venda.
Ler do catálogo faria uma edição de preço reescrever o faturamento do ano
passado, e relatório que muda sozinho é relatório em que ninguém confia.
Ver 010.

### D1 — Tabelas próprias, não reuso de `project`/`column`/`task`

**Decisão**: o CRM ganha tabelas dedicadas (`crm_pipeline`, `crm_stage`,
`crm_deal`, …). Não modelamos negócio como `task` nem etapa como `column`.

**Por quê**: um negócio precisa de valor monetário, moeda, probabilidade,
data prevista de fechamento, status `open|won|lost`, motivo de perda,
empresa e contato vinculados, e histórico de tempo por etapa. Uma etapa
precisa de probabilidade e semântica de ganho/perda — `column` só tem
`isFinal`. Espremer isso em `task`/`task_custom_field` quebraria as
semânticas do módulo de projetos (relatórios, calendário, gantt, busca,
notificações e MCP passariam a enxergar negócios como tarefas) e o custo de
desfazer depois é muito maior do que o de criar as tabelas agora.

**Alternativa descartada**: reusar `project` como funil e `task` como
negócio, com `task_custom_field` para valor. Mais rápido nas duas primeiras
semanas, inviável a partir de relatórios e forecast.

### D2 — Escopo por workspace

Todo dado de CRM é `workspaceId`-scoped, igual a `project` e `label`. Isso
reaproveita `workspaceAccess` / `requireWorkspacePermission` sem inventar um
segundo modelo de tenancy.

### D3 — Dinheiro em centavos

`bigint("value_cents", { mode: "number" })` + `currency text` (ISO-4217,
default `BRL`). Sem `numeric`, sem float. `integer` não serve: estoura em
R$ 21 mi.

### D4 — Um diretório `apps/api/src/crm/` com submódulos

O repo hoje usa diretórios chatos na raiz de `src/` (`task-relation`,
`task-template`, …). O CRM traz ~8 entidades; oito diretórios novos na raiz
poluiriam. Desvio documentado: `apps/api/src/crm/{deal,contact,company,
pipeline,activity,product,report,settings}/`, cada um com `index.ts` +
`controllers/`, montados por um `apps/api/src/crm/index.ts` em
`api.route("/crm", crm)`.

### D5 — `crm_activity` é separada de `activity`

`activityTable` é o log de auditoria preso a `task_id NOT NULL`. A timeline
comercial (ligação, reunião, e-mail, nota, WhatsApp) é registro de trabalho
do vendedor, com dono, prazo, resultado e conclusão. São coisas diferentes;
duas tabelas.

### D6 — Campos customizados com definição no workspace

`task_custom_field` define o campo por tarefa (ad hoc). Um CRM precisa que
"Origem do lead" seja o mesmo campo em todos os negócios, com opções fixas,
filtrável e agrupável. Logo: `crm_field_definition` (workspace + entidade) +
`crm_field_value` (registro + definição).

---

## O que o Nortys já tem e o CRM aproveita

| Recurso existente | Uso no CRM |
|---|---|
| `workspaceAccess` + `requireWorkspacePermission` | autorização de todas as rotas |
| `workspace_role` (permissões editáveis por workspace) | papéis "vendedor" / "gestor comercial" |
| `publishEvent` / `subscribeToEvent` (`src/events`) | eventos `crm.deal.*` |
| `src/ws` + adapter Redis | board de pipeline em tempo real |
| `notification` + `user_notification_preference` | "negócio atribuído a você", "atividade vencendo" |
| `scheduler` (croner, ciclo de 5 min) | negócios parados (rotting) e lembretes de atividade |
| `asset` + `src/storage/s3.ts` | anexos de proposta/contrato |
| `comment`, `activity`, `audit_log` | padrão a copiar para a timeline |
| `search/global-search.ts` | estender com deal/contact/company |
| `apps/api/src/mcp/tools.ts` | ferramentas de agente para criar lead/negócio |
| `@dnd-kit` + `components/kanban-board` | padrão de drag-and-drop do board |
| `packages/email` (react-email + SMTP) | envio e templates comerciais |
| `i18n/pt-BR.json` + `en-US.json` | namespace `crm` |

## O que falta e precisa entrar

- ~~**Biblioteca de gráficos**~~: decidido no 007 **não** adicionar uma. Os
  gráficos são barras e tabelas, e o repo vem reduzindo o bundle — os
  componentes ficaram em `components/crm/charts/`, ~200 linhas.
- ~~**Backfill de permissões**~~: resolvido no 002 —
  `apps/api/src/database/backfill-workspace-roles.ts` roda no boot, uma vez por
  item introduzido.
- ~~**Numeração sequencial de negócio**~~: resolvido no 003 —
  `crm/shared/deal-number.ts`, com retry no conflito de unique.

## Riscos

| Risco | Mitigação |
|---|---|
| Migração pesada (≈15 tabelas de uma vez) | Fatiar em 3 migrations: núcleo (001), campos/produtos, relatórios |
| Board lento com muitos negócios | Paginar por etapa (limite 50 + "carregar mais"), agregados calculados no SQL, nunca no cliente |
| Confusão "projeto" vs "negócio" para o usuário | Grupo separado "Comercial" na sidebar, vocabulário fixo no i18n, nunca reusar a palavra "projeto" no CRM |
| LGPD (dados pessoais de contatos) | Campos de consentimento e opt-out desde o 001; exportação e exclusão de contato desde o 005 |
| Escopo inflar até virar HubSpot inteiro | Fases 3 e 4 só começam depois do MVP em uso real pela equipe |
