# 002 — Permissões e papéis comerciais

- **Status**: FEITO
- **Fase**: 1
- **Entregue**: 6 recursos `crm*` no `statement`, papéis `sales` e `sales_manager`,
  backfill idempotente no boot (`database/backfill-workspace-roles.ts`),
  capabilities e helpers no frontend, i18n pt-BR/en-US
- **Verificado**: 25 testes unitários novos; backfill rodado contra um Postgres
  real em dois workspaces legados — admin e member ganharam CRM, viewer e papel
  custom não; edição manual de permissão preservada; segunda execução não
  escreve nada; recurso removido pelo admin não volta no boot seguinte

## Problema

`packages/permissions/src/index.ts` declara os recursos `project`, `task`,
`label`, `calendar`, `dashboard`, `template`, `workspace`. Não existe recurso
comercial, e os papéis existentes (`viewer`, `member`, `admin`, `owner`) não
descrevem uma equipe de vendas: um vendedor precisa criar e mover negócios sem
poder ver o pipeline inteiro do time, e um gestor precisa do inverso.

Além disso, as permissões efetivas vivem em linhas de `workspace_role`
(`schema.ts:244`), semeadas na criação do workspace e backfilladas no boot.
Recursos novos **não aparecem sozinhos** em workspaces já existentes.

## Alvo

### Novos recursos no `statement`

```ts
crmDeal:    ["create", "read", "read_all", "update", "delete", "assign", "change_stage"],
crmContact: ["create", "read", "read_all", "update", "delete", "export"],
crmCompany: ["create", "read", "read_all", "update", "delete"],
crmPipeline:["read", "manage"],     // manage = criar/editar funis, etapas, motivos de perda
crmField:   ["manage"],             // campos customizados e catálogo de produtos
crmReport:  ["read", "read_all"],
```

A distinção que importa: **`read` = só o que sou dono** (`ownerUserId = me`,
ou negócio em que sou dono de alguma atividade), **`read_all` = tudo no
workspace**. É a diferença entre vendedor e gestor, e é o motivo de não
bastar reusar `project: ["read"]`.

`export` é separado de `read` de propósito: exportar a base de contatos é a
ação de maior risco de LGPD do módulo.

### Novos papéis

```ts
export const sales = ac.newRole({          // "Vendedor"
  ...memberAc.statements,
  crmDeal:    ["create", "read", "update", "change_stage"],
  crmContact: ["create", "read", "update"],
  crmCompany: ["create", "read", "update"],
  crmPipeline:["read"],
  crmReport:  ["read"],
  project:    ["read"],
  task:       ["read"],
  workspace:  ["read"],
});

export const salesManager = ac.newRole({   // "Gestor comercial"
  ...adminAc.statements,
  crmDeal:    ["create","read","read_all","update","delete","assign","change_stage"],
  crmContact: ["create","read","read_all","update","delete","export"],
  crmCompany: ["create","read","read_all","update","delete"],
  crmPipeline:["read","manage"],
  crmField:   ["manage"],
  crmReport:  ["read","read_all"],
  project:    ["create","read"],
  task:       ["create","read","update"],
  workspace:  ["read"],
});
```

`admin` e `owner` recebem todas as ações de CRM. `member` recebe
`crmDeal/crmContact/crmCompany: ["read"]` (só os próprios) e nenhuma escrita —
quem trabalha comercial recebe o papel `sales`. `viewer` recebe nada de CRM.

### Registro e backfill

1. Adicionar `sales` e `sales_manager` a `builtInRoles` e a
   `DEFAULT_ROLE_NAMES`, para que as linhas de `workspace_role` sejam semeadas
   na criação do workspace e backfilladas no boot (o comentário em
   `packages/permissions/src/index.ts:63-70` descreve exatamente esse caminho).
2. **Confirmado na implementação: não existia backfill algum.** A semeadura só
   acontecia em `afterCreateOrganization`, pulando nomes já existentes — todo
   workspace atual ficaria com `admin` sem nenhuma permissão de CRM. Foi
   escrito `apps/api/src/database/backfill-workspace-roles.ts`, chamado em
   `runStartupTasks` logo após as migrations. Ele registra o que já aplicou em
   um `system_setting`, então: adiciona um recurso ao papel apenas se a chave
   estiver inteiramente ausente, nunca sobrescreve ações que um admin removeu,
   e não repõe um recurso que o admin apagou depois do backfill.
3. Testes em `packages/permissions/src/index.test.ts` cobrindo: vendedor não
   tem `read_all`; gestor tem; `viewer` não tem nada de CRM; backfill é
   idempotente.

### Aplicação no backend

Todas as rotas de `/crm` usam `workspaceAccess.fromQuery()` /
`.fromJson()` + `requireWorkspacePermission({ crmDeal: ["read"] })`, exatamente
como `apps/api/src/project/index.ts:48`.

O filtro de escopo (`read` vs `read_all`) **não** vai no middleware: vai no
controller, que recebe um `visibility: "own" | "all"` derivado por
`hasWorkspacePermission({ crmDeal: ["read_all"] })` e aplica
`where ownerUserId = userId` quando `own`. Middleware não consegue filtrar
linhas; só nega a rota inteira.

### Aplicação no frontend

Estender `apps/web/src/hooks/use-workspace-permission.ts` com
`canViewCrm()`, `canViewAllDeals()`, `canManagePipelines()`,
`canExportContacts()`, seguindo o padrão de `canViewProjects()` já consumido
em `apps/web/src/components/nav-main.tsx:37`.

## Correção posterior: os papéis existiam e não eram atribuíveis

Os papéis `sales` e `sales_manager` foram semeados, ganharam permissões e
passaram nos testes desde este plano — mas **nenhuma tela os oferecia**. O
seletor da lista de membros listava viewer/member/admin e filtrava os
semeados da cauda de papéis personalizados; o convite mandava `member` fixo,
com um `TODO` no código; e o painel de administração tinha
`["owner","admin","member","viewer"]` escrito à mão em três lugares, com a
mesma lista fixa na validação da API.

O resultado prático: era impossível transformar alguém em vendedor pela
interface, e todo convidado entrava vendo o que um membro vê.

A correção:

- a validação de papel na API deixou de ser lista fixa e passa a conferir
  contra as linhas de `workspace_role` do próprio workspace — o que também
  faz valer os papéis que a equipe cria nas configurações;
- um seletor único (`components/team/role-select.tsx`) lista os papéis
  semeados, do mais amplo ao mais restrito, **com a descrição do que cada um
  dá acesso**, e depois os personalizados. Escolher papel é escolher o que a
  pessoa enxerga, e "member" e "sales" são duas palavras que não dizem isso
  sozinhas;
- o convite ganhou o campo de papel;
- o painel de administração usa a mesma lista no cadastro do usuário e na
  gestão de membros do workspace.

## Boundaries

- `owner` continua papel estático do lado do better-auth — não entra em
  `DEFAULT_ROLE_NAMES`.
- Nenhuma alteração no fluxo de convite/adesão; papéis novos aparecem
  automaticamente no seletor de papel se ele lê `workspace_role`.
