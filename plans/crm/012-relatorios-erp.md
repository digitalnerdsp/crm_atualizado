# 012 — Relatórios de ERP

- **Status**: FEITO
- **Fase**: 4 (ERP)
- **Depende de**: 009, 010, 011
- **Entregue**: os cinco relatórios em `apps/api/src/crm/report/controllers/`,
  exportação CSV por relatório, abas Comercial e Empresa em `crm/reports` e os
  filtros de funil e responsável que a API já aceitava
- **Verificado**: 5 testes de integração novos (receita por serviço separando
  pontual de recorrente, decomposição mensal do MRR com churn rate, aquisição
  contando clientes e MRR, concentração da carteira, marco de safra que ainda
  não chegou) e 4 unitários do CSV.

## Problema

Os sete relatórios do plano 007 respondem sobre o **funil**: conversão,
forecast, velocidade, ranking, perdas, origem e receita por hora. São
perguntas de operação comercial.

As perguntas deste plano são de gestão da empresa: quanto vendi de cada
serviço, qual a minha receita recorrente e para onde ela está indo, de onde
vêm os clientes que realmente fecham, e como está composta a carteira. Nenhuma
delas tem resposta hoje porque os dados que elas precisam só existem a partir
do 009.

## Alvo

### 1. Receita por serviço

`GET /crm/report/revenue-by-service`

Agrupa `crm_deal_service` dos negócios ganhos no período, por serviço e por
categoria. Separa **pontual** de **recorrente** — misturar um projeto de
R$ 50.000 com uma mensalidade de R$ 3.000 numa mesma barra esconde as duas
informações.

Por linha: negócios, quantidade vendida, receita pontual, receita recorrente
contratada, ticket médio.

Cruzado com o `time_entry` das tarefas daquele negócio (plano 006), sai a
margem por hora de cada serviço — a leitura que diz qual serviço vale a pena
vender mais.

### 2. Receita recorrente (MRR)

`GET /crm/report/mrr`

Dois recortes, ambos de `crm_contract_event`:

**MRR atual** — soma de `monthlyValueCents` dos contratos `active`, com o
detalhe por cliente e por serviço.

**Movimento mensal** — a decomposição que mostra de onde vem o crescimento:

| Componente | O que é |
|---|---|
| Novo | contratos que entraram no mês |
| Expansão | contratos que subiram de valor |
| Contração | contratos que desceram de valor |
| Churn | contratos cancelados |
| **Líquido** | a soma dos quatro |

Crescer R$ 10.000 com R$ 12.000 de novo e R$ 2.000 de churn é uma empresa
diferente de crescer R$ 10.000 só com expansão. É esse gráfico que separa as
duas.

Junto: **churn rate** (contratos cancelados sobre ativos no início do mês) e
**receita retida líquida**.

### 3. Aquisição por origem

`GET /crm/report/acquisition`

Por `crm_source` e por `channel`: clientes adquiridos, negócios gerados,
negócios ganhos, taxa de conversão, receita pontual e MRR contratado.

O relatório de origem do plano 007 conta **negócios**. Este conta **clientes e
receita**, que é a pergunta de quem decide orçamento de mídia. Um canal que
gera muita oportunidade e pouco fechamento aparece aqui e não lá.

### 4. Composição da carteira

`GET /crm/report/portfolio`

Contagem e MRR por `status`, por `segment`, por `companySize` e por UF. É a
foto de com quem a empresa trabalha — e a resposta a "estou concentrado demais
em um segmento?".

Inclui **concentração de receita**: quanto do MRR está nos cinco maiores
clientes. Um número que ninguém quer olhar e todo mundo deveria.

### 5. Retenção por safra

`GET /crm/report/cohorts`

Clientes agrupados pelo mês em que viraram `active`, e quantos seguem ativos
depois de 1, 3, 6 e 12 meses. Responde se o problema de retenção é do produto
ou de um período específico de aquisição.

Fica por último de propósito: precisa de pelo menos um ano de histórico para
dizer algo, e antes disso mostra uma matriz quase vazia.

## Implementação

- Um controller por relatório em `apps/api/src/crm/report/controllers/`,
  reusando `resolveReportFilters`, `dealScope` e `withWindow` do 007.
- **Toda agregação em SQL.** O MRR mensal em particular é uma janela sobre
  `crm_contract_event` — carregar contratos e somar em JS não sobrevive ao
  primeiro ano de dados.
- Permissão `crmReport:read` / `read_all`, como no 007.
- **Exportação CSV por relatório**, que ficou de fora do 007: gestor exporta
  para levar a reunião, e sem isso ele tira print da tela.

## O que a implementação mudou

**As horas são rateadas entre os itens do negócio pelo valor de cada um.** Um
negócio com site e tráfego tem horas dos dois num apontamento só; atribuir
tudo a um dos serviços mentiria mais do que ratear. A receita por hora só
aparece quando há hora apontada — sem isso seria divisão por zero disfarçada
de número.

**Pausa entra como contração, não como churn.** O cliente não foi embora, e
somar as duas coisas inflaria o churn de quem trabalha com sazonalidade.
Retomada entra como expansão. Com esse mapa, a soma dos quatro componentes é
exatamente o líquido do mês, porque cada evento guarda a diferença.

**O churn rate é sobre a abertura do mês**, não sobre o fechamento: sobre o
fechamento, um mês de queda forte pareceria melhor do que foi.

**O MRR de fechamento é acumulado por janela SQL** sobre os eventos, e não
recalculado mês a mês em JS.

**Aquisição e carteira não filtram MRR por período.** Recorrência é estado de
hoje: "quanto de MRR veio de Meta Ads" é sobre a carteira atual, não sobre um
intervalo. A janela vale para clientes adquiridos e negócios.

**Retenção lê contratos, não a situação do cliente.** Não existe histórico de
`crm_company.status`, e reconstruí-lo seria adivinhação; um cliente conta como
retido num marco se tinha contrato começado antes e não encerrado até lá.
Marco que ainda não chegou fica vazio, não zero — uma safra de dois meses não
"perdeu" os clientes de doze.

**O CSV sai pelo cliente da API, não por um link.** A sessão viaja em cookie
de outro domínio, que um `<a href>` não manda; o arquivo é baixado como blob.
Separador ponto e vírgula e BOM, para o Excel em português abrir em colunas.

## Tela

Os relatórios de funil (007) e os de gestão (012) viram duas abas em
`crm/reports`: **Comercial** e **Empresa**. Doze cards numa rolagem só é uma
página que ninguém termina de ler.

Barra de filtros ganha funil e responsável, que a API já aceita desde o 007 e
a tela nunca expôs.

## O que a verificação na tela encontrou

Nada de errado nos números — conferidos contra um contrato que foi criado,
reajustado, pausado, retomado e um segundo que foi cancelado, com o MRR
fechando em cada mês. Três rótulos foram corrigidos: o cabeçalho de conversão
vinha da chave usada em frase corrida (minúscula), a coluna de recorrência na
aquisição repetia o título do card em vez de "MRR", e a contagem de clientes
nos recortes da carteira não flexionava o plural.

## Boundaries

- Sem construtor de relatório pelo usuário. Se a demanda por recortes novos
  crescer, a saída é expor as tabelas para uma ferramenta de BI, não escrever
  um BI aqui dentro.
- Sem projeção de receita futura além do forecast ponderado que já existe.
