# 006 — Vínculo CRM ↔ Entrega (tarefa ↔ cliente)

- **Status**: FEITO
- **Fase**: 2 — **este é o plano que justifica o CRM viver dentro do Nortys**
- **Entregue**: `task.crmCompanyId` + `task.crmDealId`, migration 0004 (que
  também reverte as colunas por projeto da 0003), `PUT /task/client/:id`,
  `POST /crm/deal/:id/delivery-tasks`, popover de cliente na tarefa, seção
  "Entrega" na ficha do cliente e "Tarefas de entrega" na do negócio, e o
  diálogo de tarefas de entrega logo após o ganho
- **Verificado**: aplicação rodando de verdade com três projetos de disciplina
  e dois clientes — vínculo pela tarefa, inferência do cliente a partir do
  negócio, ganho gerando tarefas em Design e Dev de uma vez. 4 testes de
  integração novos.

## Correção de rumo

A primeira versão deste plano assumia **projeto = cliente**: ganhar um negócio
criaria um projeto de entrega, e `project.crmCompanyId` diria de quem ele é.

**Isso não corresponde a como a equipe trabalha.** Os projetos aqui são por
disciplina — "Projeto Design" reúne as tarefas de design de todos os clientes,
"Projeto Dev" as de desenvolvimento, e assim por diante. Um projeto atende
muitos clientes ao mesmo tempo, então marcar o cliente no projeto não diz nada.

**A unidade de trabalho que pertence a um cliente é a tarefa.** O vínculo desce
um nível: `task → crm_company`, opcionalmente também `task → crm_deal`.

As colunas da versão anterior (`project.crm_company_id` e a tabela
`crm_deal_project`) nunca chegaram a ser usadas por nenhuma tela — a migration
0004 as remove em vez de deixá-las como campo morto.

## Alvo

### Schema

```ts
task                                  -- ALTERAÇÃO
  + crmCompanyId text → crm_company (set null)
  + crmDealId    text → crm_deal    (set null)
  + idx: crmCompanyId, crmDealId

project                               -- REVERSÃO da 0003
  - crmCompanyId

crm_deal_project                      -- REMOVIDA
```

`crmCompanyId` é a fonte da verdade de "de quem é esta tarefa". `crmDealId` é
opcional e responde "de qual contrato ela saiu" — é o que permite ler esforço
por contrato, não só por cliente. Escolher um negócio preenche a empresa
sozinho; nunca o contrário, porque trabalho recorrente existe sem negócio
aberto.

**Por que duas colunas e não só o negócio**: nem toda tarefa de cliente nasce de
um negócio. Suporte, ajuste, retrabalho e retainer são trabalho de cliente sem
oportunidade no funil. Exigir um negócio deixaria essas tarefas sem vínculo.

**Por que colunas e não tabela de junção**: uma tarefa é de um cliente só. Uma
junção permitiria duas empresas na mesma tarefa, que é um estado sem
significado aqui, e custaria um join em toda listagem de board.

### API

**Vincular** — `PUT /task/client/:id`, seguindo o padrão granular já usado por
`/task/priority/:id` e `/task/assignee/:id`:

```
{ crmCompanyId: string | null, crmDealId?: string | null }
```

Regras: o negócio tem de ser do mesmo workspace da tarefa; passar `crmDealId`
sem `crmCompanyId` herda a empresa do negócio; limpar a empresa limpa o negócio
junto, porque um negócio sem cliente na tarefa seria incoerente.

**Ficha do cliente** — `GET /crm/company/:id` passa a devolver as tarefas do
cliente agrupadas por projeto, no lugar da lista de projetos:

```ts
tasks: [{ projectId, projectName, projectSlug, tasks: [...] }]
```

**Ficha do negócio** — `GET /crm/deal/:id` passa a devolver as tarefas geradas
por ele, no lugar de `projects`.

**Tarefas de entrega** — `POST /crm/deal/:dealId/delivery-tasks`:

```
{ workspaceId, items: [{ projectId, title, status?, priority?, assigneeId? }] }
```

Cria as tarefas já vinculadas ao cliente e ao negócio, cada uma no projeto de
disciplina escolhido.

Tudo é validado antes da primeira escrita (o negócio existe no workspace, todo
projeto pertence ao workspace). Depois disso, só uma falha de banco produziria
um lote parcial — e a resposta diz exatamente quais tarefas foram criadas.
**Não é uma transação única**: `createTask` já tem a sua, e reescrevê-la para
aceitar uma externa custaria mais do que o caso de falha vale.

A tarefa entra na **primeira coluna do projeto escolhido**, não num `"to-do"`
fixo — projetos de disciplina renomeiam colunas, e um slug fixo seria rejeitado
pela validação de status. Isso só apareceu ao escrever o teste.

### Fluxo "Ganhou → Entrega"

O diálogo de ganho passa a oferecer (sem obrigar) criar as tarefas de entrega.
A pessoa escolhe, para cada linha, em qual projeto de disciplina a tarefa entra.
Um `task_template` do workspace pode preencher a lista de uma vez.

O botão continua sendo "Nenhum agora": ganhar um negócio não pode ficar refém
de decidir a entrega no mesmo instante.

### Telas

**Na tarefa** (`task-properties-sidebar`): campo **Cliente** e, abaixo, campo
**Negócio** filtrado pelos negócios daquele cliente. Ambos limpáveis.

**Na ficha do cliente**: seção "Trabalho em andamento" com as tarefas agrupadas
por projeto, contagem de abertas e link para cada tarefa. É a resposta a "o que
está rolando pra este cliente" — que hoje exige abrir cada projeto e procurar.

**Na ficha do negócio**: seção "Tarefas de entrega" com as tarefas que nasceram
dele e o progresso (concluídas / total).

**No board de tarefas**: chip do cliente no card e filtro por cliente na lista
ficaram **fora** deste corte. O vínculo existe, é editável na tarefa e visível
no CRM; o chip no card é polimento que cabe junto do 007.

### Receita vs. entrega

Com `task.crmDealId` e o `time_entry` que já existe por tarefa, sai o relatório
que nenhum CRM isolado dá: **valor fechado por contrato × horas gastas nas
tarefas daquele contrato**. E com `crmCompanyId`, o mesmo por cliente. Fica em
007; o vínculo precisa existir aqui para o dado ser coletável desde já.

## Regras

- Excluir empresa não exclui tarefa: `crmCompanyId` vira `set null`.
- Excluir negócio não exclui tarefa: `crmDealId` vira `set null`, e a empresa
  permanece — o trabalho continua sendo daquele cliente.
- Mover tarefa entre projetos preserva o vínculo com o cliente.

## Boundaries

- Não introduzir "projeto do cliente": projetos seguem sendo por disciplina.
- Não obrigar cliente em tarefa: trabalho interno não tem cliente.
