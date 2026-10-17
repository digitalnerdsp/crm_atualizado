# 008 — Automações, integrações e importação

- **Status**: EM ANDAMENTO — item 1 (importação CSV) FEITO
- **Fase**: 3–4
- **Escopo estimado**: importador CSV, automações de funil, captação web, integrações de canal
- **Entregue (item 1)**: módulo `/crm/import` com pré-visualização e
  importação em lote, leitor de CSV próprio no navegador, assistente em
  Configurações do workspace → Importar base, e relatório com download das
  linhas recusadas
- **Verificado (item 1)**: 3 testes de integração (criação com listas criadas
  na hora, política de duplicata, vínculo de pessoa e negócio à empresa),
  11 unitários dos conversores de campo, 8 do leitor de CSV e 3 do palpite de
  mapeamento

## Problema

Sem importação, a equipe não migra a planilha atual e o CRM nasce vazio. Sem
automação, ele vira digitação manual. São os dois motivos mais comuns de
abandono de CRM interno.

## Alvo — ordem de prioridade

### 1. Importação CSV (primeiro; sem isso não há adoção)

Assistente em `settings/crm/import`: upload → mapeamento de colunas para campos
(inclusive customizados) → pré-visualização com validação linha a linha →
importação. Chaves de deduplicação: e-mail para contato, CNPJ ou domínio para
empresa. Política escolhida no assistente: pular, atualizar ou criar duplicata.
Importa contatos, empresas e negócios; resolve empresa por nome/CNPJ ao importar
negócio. Relatório final com as linhas rejeitadas em CSV.

Processar em lotes com transação por lote — um arquivo de 20 mil linhas não
pode ser uma transação só.

**O que a implementação decidiu**

- **O arquivo é lido no navegador, não enviado.** Um CSV de vinte mil linhas
  não precisa passar por upload, armazenamento e limpeza: a tela lê, mapeia e
  manda as linhas em lotes de 200 como JSON. O leitor é escrito à mão
  (`lib/csv.ts`) — aspas, quebra de linha dentro de célula, BOM e separador
  detectado — porque a alternativa era mais uma dependência num bundle que o
  repo vem encolhendo.
- **Mapeamento com palpite.** Colunas de nome parecido já vêm ligadas,
  comparando sem acento e sem maiúscula, pelo nome do campo ou pelo rótulo em
  português. Um campo é usado uma vez só, senão duas colunas "Telefone"
  sobrescreveriam a mesma coisa em silêncio.
- **Pré-visualização é o mesmo código da importação, com `dryRun`.** Assim o
  que a tela promete é o que acontece; uma validação paralela divergiria na
  primeira mudança.
- **Aviso não derruba linha.** Documento com dígito errado, UF inexistente,
  empresa não encontrada e etapa desconhecida entram como aviso, e a linha é
  importada sem aquele pedaço. Barrar a planilha inteira por um dígito é o
  caminho mais curto para ninguém migrar. Só falta do campo obrigatório
  recusa a linha.
- **Origem e segmento da planilha viram linhas de lista**, criadas na hora e
  casadas sem diferenciar maiúscula: "Alimentação" e "alimentação" são um
  segmento só. Sem isso, importar trezentos clientes deixaria trezentas
  classificações em branco.
- **Empresa é reconhecida por documento ou nome; pessoa, por e-mail.** A
  política escolhida no assistente decide: pular, atualizar ou duplicar. Ao
  duplicar, a cópia entra sem documento, porque ele é único por workspace.
- **Negócio não deduplica** — dois negócios de mesmo título são normais — e
  resolve empresa, etapa, origem e responsável por nome ou e-mail.
- **Lote por requisição, sem transação única.** O que entrou fica, e o
  relatório final diz o que sobrou de fora, com download das linhas recusadas
  em CSV para corrigir na planilha e reimportar só elas.

### 2. Automações de funil

Estender o conceito de `workflow_rule` (`schema.ts:367`) para o CRM. A tabela
atual é acoplada a `integrationType`/`columnId`; criar `crm_automation`:

```
gatilho: negócio entrou na etapa X | negócio ganho | negócio perdido
       | negócio parado há N dias | atividade concluída | campo mudou
condição: funil, dono, valor mínimo, origem
ação: criar atividade | atribuir dono | mudar etapa | enviar e-mail (packages/email)
    | notificar no Slack/Discord/Telegram | criar projeto de entrega (006)
    | disparar webhook
```

Execução por assinatura dos eventos `crm.*` publicados em 003 — o barramento
já existe, a automação é só um assinante. Log de execução por automação,
senão é impossível depurar.

### 3. Captação de leads

- `crm_lead` (caixa de leads não qualificados) + tela de triagem com
  "converter em negócio" (cria contato + empresa + negócio numa ação).
- Endpoint público `POST /crm/lead/capture/:formToken`, com rate limit e
  token por workspace, para formulário de site. Reusar o padrão de
  `generic-webhook-integration`.
- Origem preservada em `crm_lead.source` e propagada para `crm_deal.source`.

### 4. Canais

- **E-mail**: templates comerciais em `packages/email` e envio a partir da
  ficha do negócio, com a mensagem registrada como `crm_activity` do tipo
  `email`. Sincronização bidirecional (IMAP/Gmail/Outlook) é fase 4 e um
  projeto próprio — não subestimar.
- **Slack / Discord / Telegram**: reusar as integrações existentes
  (`apps/api/src/{slack,discord,telegram}-integration/`) para notificar
  "negócio ganho" e "negócio parado". Custo baixo, efeito grande na adoção.
- **WhatsApp**: só via provedor externo (API oficial da Meta ou intermediário);
  fase 4, avaliar separadamente.

### 5. API pública e MCP

As rotas `/crm` já ficam documentadas em OpenAPI por `describeRoute` e
acessíveis por API key (Bearer), sem trabalho extra. As ferramentas MCP de 003
cobrem o uso por agentes.

## Boundaries

- Nada aqui começa antes do MVP (001–006) estar em uso real pela equipe.
- Sincronização de e-mail e WhatsApp são projetos próprios, com plano separado.
