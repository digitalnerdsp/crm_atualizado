# 011 — Contratos e receita recorrente

- **Status**: FEITO
- **Fase**: 4 (ERP)
- **Depende de**: 010
- **Entregue**: `crm_contract`, `crm_contract_service`, `crm_contract_event`,
  migration 0008, módulo `/crm/contract`, `POST /crm/deal/:dealId/contract`,
  telas `crm/contracts` (lista com MRR ativo) e `crm/contracts/:id` (serviços,
  histórico e ações), bloco de contratos na ficha do cliente, aviso "Gerar
  contrato" no diálogo pós-ganho e na ficha do negócio
- **Verificado**: 5 testes de integração novos (geração a partir do negócio,
  histórico completo de MRR com pausa, reajuste pausado, retomada e
  cancelamento, fim de prazo sem churn, recusa de cobrança pontual, resumo da
  lista), 4 unitários do equivalente mensal, 3 de componente do aviso.

## Problema

Recorrência é a métrica que separa uma agência que sabe o próprio tamanho de
uma que descobre no fim do mês. E ela não sai dos negócios ganhos.

Um negócio ganho é um **evento**: aconteceu numa data, com um valor. Uma
assinatura é um **estado**: está ativa hoje, foi pausada em março, subiu de
R$ 3.000 para R$ 4.500 em junho, e pode ser cancelada amanhã. Somar serviços
mensais de negócios ganhos dá um número que só cresce — um cliente que cancelou
há seis meses continua no total, e o MRR vira ficção.

É o mesmo raciocínio de `crm_stage_history` no plano 001: o estado atual não
carrega a história, e a história não se reconstrói depois.

## Alvo

### Contrato

```ts
crm_contract
  id, workspaceId → workspace (cascade)
  number integer                        -- sequencial por workspace
  companyId → crm_company (cascade)
  dealId    → crm_deal (set null)       -- o negócio que o originou
  title text
  startsAt timestamp notNull
  endsAt   timestamp                    -- null = prazo indeterminado
  monthlyValueCents bigint notNull
  currency text default 'BRL'
  billingDay integer                    -- herda do cliente se não informado
  status text 'active'|'paused'|'cancelled'|'finished' default 'active' notNull
  cancelledAt timestamp
  cancelReasonId → crm_lost_reason (set null)
  cancelNote text
  ownerUserId → user (set null)
  createdAt, updatedAt
  unique(workspaceId, number)
  idx: workspaceId, companyId, dealId, status, (workspaceId, status)

crm_contract_service                    -- o que está incluso
  id, contractId → crm_contract (cascade)
  serviceId → crm_service (set null)
  name, billingType, quantity, unitPriceCents, totalCents   -- snapshots, como no 010
  idx: contractId, serviceId
```

`cancelReasonId` reusa `crm_lost_reason`: o motivo de um cliente cancelar é da
mesma natureza do motivo de um negócio ser perdido, e uma segunda lista de
motivos só faria a equipe manter as duas.

### Histórico de valor — o que torna o MRR auditável

```ts
crm_contract_event
  id, contractId → crm_contract (cascade)
  type text                             -- 'created'|'activated'|'paused'|'resumed'
                                        -- |'upgraded'|'downgraded'|'cancelled'|'finished'
  fromMonthlyValueCents bigint
  toMonthlyValueCents   bigint
  occurredAt timestamp notNull
  changedByUserId → user (set null)
  note text
  idx: contractId, occurredAt, type
```

Escrito em toda mudança de valor ou de status, na mesma transação. É o que
permite responder **"qual era o MRR em março"** e decompor o movimento do mês
em novo, expansão, contração e churn — a leitura que diz se o crescimento vem
de clientes novos ou de aumento na base.

Sem esta tabela, o MRR é sempre "hoje", e "hoje" não mostra tendência.

### Do negócio ganho ao contrato

O diálogo de ganho (plano 004) passa a oferecer uma segunda ação, ao lado das
tarefas de entrega: **gerar contrato**, quando o negócio tem ao menos um item
com `billingType` diferente de `one_time`.

Vem pré-preenchido com os serviços recorrentes do negócio, o valor mensal
somado, início na data do ganho e prazo indeterminado. Continua opcional —
"Nenhum agora" segue disponível, porque nem todo ganho recorrente é fechado no
mesmo instante em que a assinatura começa.

### Status do cliente

O contrato passa a mover `crm_company.status` (do plano 009):

- primeiro contrato ativo → cliente vira `active`, `clientSince` é gravado
- último contrato cancelado → cliente vira `churned`, com `churnedAt`

Automático, mas sobrescrevível à mão: um cliente sem contrato ativo que segue
comprando projeto pontual não é churn, e só uma pessoa sabe disso.

### API

| Método | Rota | Permissão |
|---|---|---|
| GET | `/crm/contract?workspaceId&status&companyId` | `crmDeal:read` |
| GET | `/crm/contract/:id` | `crmDeal:read` |
| POST | `/crm/contract` | `crmDeal:create` |
| PATCH | `/crm/contract/:id` | `crmDeal:update` |
| POST | `/crm/contract/:id/pause` · `/resume` · `/cancel` | `crmDeal:change_stage` |
| POST | `/crm/deal/:dealId/contract` | `crmDeal:create` |

Mudança de valor e mudança de status passam pelos endpoints próprios, nunca
por um `PATCH` cru: são eles que escrevem o `crm_contract_event`. É a mesma
razão pela qual etapa de negócio não se muda por `PATCH` no plano 003.

### Tela

Rota `crm/contracts`: lista com filtro por status, valor mensal, cliente,
início e próximo vencimento. Cabeçalho com MRR ativo e contagem por status.

Na ficha do cliente, bloco "Contratos" com os ativos e o valor mensal somado.
Na ficha do negócio, link para o contrato que ele originou.

## O que a implementação mudou

**O histórico guarda o MRR efetivo, não o valor de tabela.** `from` e `to` de
cada evento são quanto o contrato contava na receita recorrente antes e
depois: pausado, cancelado e encerrado contam zero. Com isso o MRR de qualquer
data é a soma do `to` do último evento de cada contrato até ela, e o 012 não
precisa reconstruir situação nenhuma. Reajuste com o contrato pausado grava
`upgraded 0 → 0` — o valor mudou, a receita não — e o novo valor aparece na
retomada.

**O evento `created` nasce na data de início**, não na de cadastro: contrato
assinado hoje que começa em outubro não é MRR de setembro. Não existe
`activated`: contrato nasce ativo.

**Nenhuma mudança pode ser datada antes da última registrada.** As ações
aceitam data retroativa (o cliente avisou no dia 31, a equipe registrou no
dia 3), mas não para trás do último evento: um cancelamento posto antes de um
reajuste embaralharia a leitura por data.

**Cliente com contrato não pode ser excluído** (`restrict`, não `cascade`).
Excluir levaria o histórico de receita junto; a API devolve 409 dizendo para
arquivar.

**Cancelado vira churn; encerrado vira inativo.** Um contrato de prazo fixo
que termina não é perda de cliente. Por isso há `finish` ao lado de `cancel`.

**Contrato só leva serviço recorrente.** Linha pontual é recusada com uma
mensagem: taxa de implantação fica no negócio.

**Trimestral e anual entram pelo equivalente mensal** (÷ 3, ÷ 12), senão o MRR
pularia a cada renovação.

**Ganhar negócio passou a ativar o cliente** — a transição automática que o
009 previa e não tinha sido feita. Mora em `crm/shared/company-lifecycle.ts`,
junto das transições dos contratos, dentro da mesma transação da escrita que
a causa.

**A resolução de linhas (catálogo → cópia) virou compartilhada**
(`crm/shared/service-lines.ts`), usada pelos itens do negócio e pelos
serviços do contrato.

**A numeração sequencial foi generalizada** (`withNextContractNumber` ao lado
de `withNextDealNumber`). O retry no conflito de número nunca tinha disparado
de verdade antes da correção do `isUniqueViolation` no 009.

## O que a verificação na tela encontrou

**Faltava criar contrato avulso.** Só existia a geração a partir de um negócio
ganho. Uma agência que adota o sistema já tem clientes pagando mensalidade há
anos, e sem isso precisaria inventar um negócio ganho para cada um só para
registrar o que já existe. A lista de contratos ganhou "Novo contrato", com
cliente, título, valor mensal, vencimento e período.

**"Cliente desde" ficava vazio em cliente já marcado como ativo à mão.** A
ativação saía cedo quando a situação já era `active` e não preenchia a data.
Agora a primeira venda preenche a data mesmo com a situação já correta.

## Convenções do repo a seguir

- Numeração sequencial por workspace com `withNextDealNumber` generalizado —
  a mesma lógica de retry no conflito de unique do plano 003.
- Eventos `crm.contract.created`, `.paused`, `.resumed`, `.cancelled`
  publicados no barramento, para as automações do 008.

## Boundaries

- Sem emissão de cobrança, boleto ou integração com gateway. O contrato diz o
  que deveria ser cobrado; cobrar é outro sistema.
- Sem reajuste automático por índice — campo de valor editável resolve, e
  reajuste anual programado é complexidade que não se paga ainda.
