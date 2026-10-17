# 009 — Cadastro de cliente profissional

- **Status**: FEITO
- **Fase**: 4 (ERP)
- **Entregue**: `crm_source`, `crm_segment`, 14 colunas em `crm_company`,
  `crm_deal.sourceId`, migrations 0005 + 0006, criação atômica de cliente +
  contato, validação de CPF/CNPJ, autocomplete de cidade, módulo
  `/crm/taxonomy`, tela "Listas do CRM" nas configurações do workspace,
  formulário de cliente com seções e ficha do cliente com o cadastro completo
- **Verificado**: migração aplicada sobre um Postgres com dados de texto livre
  bagunçados de propósito (grafias divergentes, campos em branco, duas
  workspaces) — nada descartado, tudo classificado. 12 testes unitários novos
  do validador de documento.

## Problema

O cadastro de cliente da fase 1 foi desenhado para um CRM: o suficiente para
saber com quem se está negociando. Para virar a base de dados da empresa, ele
tem três buracos.

**Não distingue pessoa de empresa.** `taxId` é texto livre. Uma parte pequena
mas real dos clientes é pessoa física, e hoje não há como saber qual é qual —
nem validar o documento, nem exibir os campos certos.

**Os campos de classificação são texto livre.** `industry`, `city` e
`crm_deal.source` aceitam qualquer coisa. Em seis meses de uso isso vira
"Marketing", "marketing", "Mkt" e "Agência de marketing" como quatro segmentos
distintos, e todo relatório de segmentação passa a mentir.

**Não existe estado do cliente.** Não há como responder "quantos clientes
ativos eu tenho hoje", que é a pergunta mais básica da carteira. Um cliente que
parou de comprar há um ano é indistinguível de um que fechou ontem.

Além disso, é possível criar empresa sem nenhum contato — e uma empresa sem
pessoa é um registro com o qual não se faz nada.

## Alvo

### Listas editáveis: origem e segmento

```ts
crm_source                              -- de onde vêm os clientes
  id, workspaceId → workspace (cascade)
  name
  channel text                          -- 'referral'|'paid'|'organic'|'outbound'|'event'|'other'
  isActive boolean default true
  position integer default 0
  unique(workspaceId, name)

crm_segment                             -- em que setor o cliente atua
  id, workspaceId → workspace (cascade)
  name, isActive, position
  unique(workspaceId, name)
```

Duas tabelas quase idênticas em vez de uma genérica `crm_taxonomy(kind, name)`:
a genérica economiza uma tabela e custa a chave estrangeira. Com tabelas
próprias, apagar um segmento em uso é o banco que impede.

`channel` agrupa origens para o relatório: "Meta Ads" e "Google Ads" são
origens diferentes do mesmo canal pago, e a pergunta "quanto vem de mídia
paga" precisa dessa camada.

**Seed na criação do workspace**, junto dos papéis padrão: Indicação
(referral), Meta Ads (paid), Google Ads (paid), Busca orgânica (organic),
Prospecção ativa (outbound), Evento (event), Cliente atual (referral). Uma
lista vazia no primeiro uso significa que ninguém preenche.

### Cliente

```ts
crm_company                             -- ALTERAÇÕES
  + personType text 'pj'|'pf' default 'pj' notNull
  + stateRegistration, municipalRegistration text     -- nota fiscal
  + segmentId  → crm_segment (set null)
  + sourceId   → crm_source  (set null)               -- como o cliente chegou
  + companySize text                    -- 'mei'|'me'|'epp'|'medium'|'large'
  + status text 'prospect'|'active'|'inactive'|'churned' default 'prospect' notNull
  + clientSince timestamp
  + churnedAt timestamp, churnReason text
  + billingEmail text                   -- nota fiscal não vai pro comercial
  + paymentTerms text                   -- 'cash'|'15'|'30'|'30_60'|'custom'
  + billingDay integer                  -- dia de vencimento
  + paymentMethod text                  -- 'pix'|'boleto'|'card'|'transfer'
  - industry                            -- migrado para segmentId
  + idx: segmentId, sourceId, status, (workspaceId, status)
```

**`status` é o campo que mais paga.** Ele é o que separa carteira de lista de
contatos, e é a chave de "quantos ativos", "quantos churnaram este mês" e
"qual a taxa de retenção". Transições: `prospect → active` quando o primeiro
negócio é ganho (automático), `active → churned` manual, com motivo.

**Documento**: validado com dígito verificador. CNPJ tem 14 dígitos, CPF tem
11, e o `personType` decide qual algoritmo roda. Guardado sem máscara, como
já é hoje. O unique parcial por workspace continua valendo.

**UF**: lista fechada das 27 unidades federativas, validada no Valibot. Coluna
segue `text` — UF não muda, mas um enum no Postgres exigiria migration para
qualquer ajuste e não ganha nada aqui.

**Cidade**: segue texto, com autocomplete sobre as cidades já digitadas no
workspace. Um endpoint `GET /crm/company/cities?workspaceId&state` devolve as
distintas. Isso resolve "São Paulo" versus "Sao Paulo" sem carregar os 5.570
municípios do IBGE, que seria manutenção sem retorno enquanto ninguém precisar
de código IBGE.

### Negócio

```ts
crm_deal                                -- ALTERAÇÕES
  + sourceId → crm_source (set null)    -- de onde veio ESTA oportunidade
  - source (text)                       -- migrado
  + idx: sourceId
```

Origem no cliente e no negócio respondem perguntas diferentes: o cliente veio
de Meta Ads uma vez; o terceiro projeto dele veio de indicação. Sem as duas,
ou se perde a aquisição ou se perde o canal que gera oportunidade recorrente.

### Contato principal obrigatório

`POST /crm/company` passa a aceitar o contato principal no mesmo payload e
criar os dois numa transação:

```
{ workspaceId, name, taxId, ..., primaryContact: { firstName, lastName?, email?, phone? } }
```

Sem contato, 400. O contato nasce com `isPrimary = true`.

**Exceção deliberada**: a importação CSV do plano 008 cria empresa sem contato
quando a planilha não tem um. Bloquear a importação por causa dessa regra
transformaria a regra num motivo para não migrar a base — que é o contrário do
que ela existe para fazer. A ficha do cliente sinaliza a pendência.

### Migration de dados

Uma migration, três passos, tudo em SQL:

1. `crm_segment` recebe uma linha por valor distinto de `crm_company.industry`
   no workspace; `segmentId` é preenchido; `industry` é removida.
2. `crm_source` recebe uma linha por valor distinto de `crm_deal.source`, mais
   as sete origens padrão; `crm_deal.sourceId` é preenchido; `source` removida.
3. `status` de todo cliente com negócio ganho vira `active`; o resto fica
   `prospect`. `clientSince` recebe a data do primeiro ganho.

Nenhum dado é descartado — texto livre vira linha de lista com o mesmo nome.

## O que a implementação mudou

**São duas migrations, não uma.** O drizzle-kit pede confirmação interativa
quando uma tabela perde uma coluna e ganha outra no mesmo passo, e a geração
roda sem TTY. Em vez de responder o prompt no escuro, a 0005 é aditiva e
carrega os passos de dados, e a 0006 derruba `industry` e `source` depois.
A ordem garante que nada é lido de uma coluna já removida, e cada snapshot
continua batendo com o arquivo que o gerou.

**O casamento de texto livre ignora caixa e espaço.** A primeira versão
comparava a grafia exata e produzia "meta ads" como origem separada da "Meta
Ads" semeada — recriando no cadastro novo exatamente o problema que ele existe
para resolver. Agora o agrupamento é por `lower(btrim(...))`, e uma origem só é
criada se nenhuma existente casar assim. A grafia que fica é a primeira em
ordem alfabética; renomear na tela é um clique.

**A origem do cliente é herdada do negócio mais antigo dele.** Não estava no
plano. É informação que já está na base e que a equipe teria de redigitar
cliente a cliente — deixá-la de fora seria jogar fora dado por omissão.

**O tipo de pessoa sai do documento.** Todo cliente com documento de 11 dígitos
vira `pf` na migração. CPF tem 11, CNPJ tem 14: a informação já estava lá.

**`churnedAt` é preenchido pela transição, não pelo formulário.** Marcar um
cliente como churn grava a data de saída sozinho, e tirá-lo de churn a limpa.
Ninguém lembra de preencher um campo de data no instante em que está
registrando a perda de um cliente.

**Validar documento na atualização exige ler o estado atual.** Trocar o tipo de
pessoa sem trocar o documento (ou o contrário) tem de validar contra o par que
fica gravado, não contra a metade que veio no payload.

**A checagem de workspace é do controller, não da chave estrangeira.** A FK
garante que a linha existe, não que ela é deste workspace — sem a checagem, um
id de outro workspace classificaria o cliente com um segmento que ninguém daqui
consegue ver.

**Cidade usa `datalist`, não um componente de autocomplete.** O `<input list>`
nativo sugere o que já existe e continua aceitando cidade nova, sem carregar
mais um componente no bundle.

**As listas ganharam tela própria** em `configurações do workspace → Listas do
CRM`, com o mesmo par de permissões das razões de perda (`crmPipeline:read`
para ler, `manage` para editar), renomear e trocar o canal de uma origem, e
desativação em vez de exclusão. Renomear e reclassificar não são opcionais: a
migração traz as origens digitadas à mão com canal "Outro", e é nessa tela que
a equipe diz que "Instagram" é mídia paga ou orgânico.

## Convenções do repo a seguir

- Migration por `pnpm --filter @kaneo/api db:generate`, renomeada no padrão
  `0005_crm-client-profile.sql`. Os passos de dados vão escritos à mão no fim
  do arquivo gerado.
- Seed das listas junto de `defaultRolePayloads`, no mesmo caminho de
  `afterCreateOrganization` e do backfill do 002.
- Validação de documento em `apps/api/src/crm/shared/tax-id.ts`, pura e
  testada — dígito verificador é o tipo de coisa que se escreve errado uma vez
  e ninguém percebe por meses.

## Boundaries

- Não criar tabela de municípios.
- Não tornar `segmentId` nem `sourceId` obrigatórios: cadastro travado é
  cadastro não preenchido.
- Não mexer em `crm_contact` além do vínculo.
