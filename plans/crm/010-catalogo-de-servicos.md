# 010 — Catálogo de serviços e itens do negócio

- **Status**: FEITO
- **Fase**: 4 (ERP)
- **Depende de**: 009
- **Entregue**: `crm_service`, `crm_service_category`, `crm_deal_service`,
  `crm_deal.valueIsManual`, migration 0007, módulo `/crm/service`,
  `PUT /crm/deal/:dealId/service`, editor de itens na ficha do negócio com
  trava de valor, tela "Catálogo de serviços" nas configurações do workspace
- **Verificado**: 4 testes de integração novos (permissões do catálogo,
  preço herdado do catálogo, cópia preservada depois de o catálogo mudar,
  trava de valor nos dois sentidos, serviço de outro workspace recusado),
  5 unitários da regra de total da linha e 3 de componente do editor.
  Depois, verificado na aplicação rodando de verdade, a partir de uma
  instância recém-instalada: catálogo, listas, cadastro de cliente PJ com
  CNPJ recusado e aceito, churn, negócio com item do catálogo e item avulso,
  trava e destrava, e o item vendido preservado depois de o catálogo mudar.

## Problema

Hoje um negócio tem um título e um valor. "Rebranding Acme — R$ 48.500" não
diz o que foi vendido, então a pergunta "quanto eu vendi de identidade visual
este ano" não tem resposta — nem aproximada.

Sem itens de negócio, três coisas ficam impossíveis: saber o mix de receita por
serviço, saber qual serviço tem melhor margem por hora (cruzando com o
`time_entry` do 006), e separar o que é receita pontual do que é recorrente —
que é a base do plano 011.

## Alvo

### Catálogo

```ts
crm_service_category                    -- Design, Desenvolvimento, Tráfego...
  id, workspaceId → workspace (cascade)
  name, isActive, position
  unique(workspaceId, name)

crm_service
  id, workspaceId → workspace (cascade)
  categoryId → crm_service_category (set null)
  name
  code text                             -- código curto para proposta e planilha
  description text
  defaultPriceCents bigint({mode:"number"})
  currency text default 'BRL'
  billingType text 'one_time'|'monthly'|'quarterly'|'yearly' default 'one_time'
  isActive boolean default true
  position integer default 0
  archivedAt timestamp
  unique parcial: (workspaceId, code) where code is not null
  idx: workspaceId, categoryId, (workspaceId, isActive)
```

`billingType` no catálogo é o que permite ao 011 saber, sozinho, o que entra
no MRR quando um negócio é ganho.

Serviço é **arquivado**, nunca excluído: apagar um serviço vendido apagaria a
possibilidade de relatar o que já foi vendido.

### Itens do negócio

```ts
crm_deal_service
  id
  dealId → crm_deal (cascade)
  serviceId → crm_service (set null)
  -- Snapshots no momento da venda:
  name text notNull
  billingType text notNull
  quantity integer default 1 notNull
  unitPriceCents bigint notNull
  discountPercent integer default 0 notNull
  totalCents bigint notNull
  position integer default 0
  idx: dealId, serviceId
```

**Por que `name`, `billingType` e `unitPriceCents` são copiados e não lidos do
catálogo**: o preço de tabela sobe, o serviço é renomeado, a categoria muda —
e nada disso pode reescrever o que foi vendido no ano passado. Um relatório
histórico que muda quando alguém edita o catálogo é um relatório em que
ninguém confia. `serviceId` fica como `set null` só para agrupar; o item
sobrevive ao serviço.

`totalCents` é calculado e gravado, não derivado na leitura: é somado em todo
relatório, e recalcular `quantity * unitPrice * (1 - desconto)` em cada query
seria repetir a regra em cada lugar que a lê.

### Valor do negócio

```ts
crm_deal
  + valueIsManual boolean default false notNull
```

- `false` (padrão): `valueCents` é a soma de `crm_deal_service.totalCents`,
  recalculada em toda escrita de item, dentro da mesma transação.
- `true`: o valor foi travado à mão. Os itens continuam existindo e continuam
  contando no relatório de receita por serviço, mas não mandam mais no total.

Travar é uma decisão explícita na tela ("travar valor"), não um efeito colateral
de editar o campo. Negócio criado sem item nenhum continua funcionando com o
valor livre — registrar oportunidade antes de saber o escopo é o caso normal
no topo do funil.

### API

| Método | Rota | Permissão |
|---|---|---|
| GET/POST/PATCH/DELETE | `/crm/service[/:id]` | `crmField:manage` (leitura em `crmPipeline:read`) |
| GET/POST/PATCH/DELETE | `/crm/service/category[/:id]` | `crmField:manage` |
| GET | `/crm/deal/:dealId/service` | `crmDeal:read` |
| PUT | `/crm/deal/:dealId/service` | `crmDeal:update` |

O `PUT` recebe a lista inteira de itens e substitui, numa transação: editar
linha a linha num formulário de proposta gera meia dúzia de chamadas e estados
intermediários inválidos.

### Tela

Na ficha do negócio, um bloco de itens acima do valor: linha com serviço
(select do catálogo, ou texto livre para algo fora dele), quantidade, preço
unitário, desconto e total. Rodapé com subtotal, e o total do negócio
atualizando junto. Escolher um serviço do catálogo preenche preço e tipo de
cobrança, que seguem editáveis.

## O que a implementação mudou

**Serviço tem só `archivedAt`, sem `isActive`.** O plano listava os dois. São
o mesmo estado dito duas vezes, e dois campos para "fora de uso" é o convite
para um dizer sim e o outro não. Arquivar tira da lista de venda; o histórico
fica.

**Sem `DELETE` de serviço**, pelo mesmo motivo: a rota não existe, e a tela só
oferece arquivar e restaurar.

**Sem `GET /crm/deal/:dealId/service`.** Os itens vêm embutidos em
`GET /crm/deal/:dealId`, que a ficha já carrega. Uma rota a mais só para a
mesma tela seria uma segunda requisição por abertura de negócio.

**PUT vazio não zera negócio que nunca teve item.** A tela pode mandar lista
vazia quando alguém abre o editor e cancela pelo salvar. O valor só passa a
ser dos itens quando há ou havia item: um negócio de topo de funil com valor
digitado continua com ele; tirar o último item de um negócio calculado leva o
valor a zero.

**Editar o valor com itens e sem trava devolve 409.** O valor digitado seria
sobrescrito na próxima gravação de item, então a API recusa em vez de aceitar
e perder depois. Travar é `valueIsManual: true` no mesmo PATCH; destravar
recalcula a soma na hora.

**A tela manda sempre nome, preço e cobrança de cada linha.** É o que preserva a
cópia de uma venda antiga quando alguém reabre o negócio e salva de novo depois
de o catálogo mudar. A API só completa pelo catálogo o que faltar.

**Serviço arquivado continua aceito num item.** Reabrir um negócio antigo e
salvar não pode falhar porque o serviço saiu do catálogo depois da venda.

**O total da linha arredonda no centavo mais próximo** e mora num lugar só
(`crm/shared/deal-line.ts`). A tela mostra uma prévia com a mesma conta, mas
quem grava é o servidor.

## O que a verificação na tela encontrou

Três defeitos que nenhum teste pegava, porque as fixtures criam o workspace
direto no banco e nunca passam pelos caminhos reais de criação:

**Workspace novo nascia sem funil.** Nada semeava funil, e não existe tela para
criar um — o board abria em "Nenhum funil configurado" sem saída. Todo
workspace criado desde o plano 004 nasceu assim.

**Workspace novo não conseguia perder negócio.** Marcar perda exige uma razão,
nenhuma era semeada, e também não havia tela para cadastrá-las.

**A configuração inicial e o painel de admin não semeavam as origens do 009.**
Só o cadastro normal passava pelo gancho onde a seed estava.

A correção junta tudo em `crm/shared/seed-workspace.ts` (`seedCrmDefaults`):
funil com as seis etapas, sete origens e sete razões de perda, chamada nos três
caminhos que criam workspace e, quando há transação, dentro dela. Cada passo
só semeia o que falta. A migration 0007 completa os workspaces que já existem
e estão sem funil, sem razão de perda ou sem origem — os que já têm qualquer
linha, mesmo arquivada ou desativada, ficam como estão.

**As etapas padrão agora são em português** (Qualificação, Descoberta,
Proposta, Negociação, Ganho, Perdido). A decisão anterior seguia o padrão do
repo de semear em inglês para o workspace renomear, mas não há tela para
renomear etapa: o funil ficaria em inglês para sempre. Os slugs continuam em
inglês, porque são identificador.

**As razões de perda entraram na tela Listas do CRM**, junto de origens e
segmentos, com criar, renomear, desativar e reativar.

**A tela de listas escondia o que era desativado**, e com isso "Reativar" nunca
aparecia. Ela passou a pedir as inativas; os formulários continuam vendo só as
ativas.

Ficam de fora, anotados: não há tela para criar funil adicional nem para
editar etapas (nome, probabilidade, dias para parar). Com o funil padrão
semeado em português, isso deixa de bloquear o uso.

## Convenções do repo a seguir

- Dinheiro em `bigint` de centavos, como em todo o módulo.
- Recalcular `crm_deal.valueCents` no mesmo controller que grava os itens,
  nunca em trigger de banco: a regra fica onde alguém a encontra.

## Boundaries

- Sem proposta/orçamento formal (`crm_quote`) neste plano — os itens do
  negócio são a base dela, e ela tem numeração, validade e aceite próprios.
- Sem imposto por item: `taxRatePercent` só faz sentido junto de emissão de
  nota, que não está no escopo.
