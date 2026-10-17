# 005 — Contatos, empresas e timeline comercial

- **Status**: FEITO
- **Fase**: 2
- **Entregue**: listas e fichas de contato e empresa, timeline comercial
  reutilizada em negócio/contato/empresa, agenda "minhas atividades" com
  balde de urgência, bloco de LGPD e avisos de duplicata
- **Verificado**: aplicação rodando de verdade — timeline registrando ligação,
  conclusão de atividade pela agenda atualizando os carimbos do negócio,
  normalização de e-mail e domínio, CNPJ mascarado na exibição. 15 testes
  unitários novos nos helpers de dinheiro e formatação.

## Problema

Um pipeline sem base de relacionamento é uma lista de oportunidades órfãs. A
equipe precisa da visão inversa — "o que já aconteceu com este cliente" — e é
essa visão que amarra CRM e projetos em 006.

## Alvo

### Ficha da empresa (`companies.$companyId`)

Uma tela, quatro blocos:
1. **Cabeçalho**: nome, CNPJ, site, setor, dono da conta, etiquetas.
2. **Pessoas**: contatos da empresa, com cargo e marcação de principal.
3. **Comercial**: negócios abertos (soma), ganhos (soma e histórico), perdidos
   com motivo; taxa de conversão da conta.
4. **Entrega**: projetos vinculados (via `project.crmCompanyId`), com status e
   tarefas em atraso — a ponte de 006.

### Ficha do contato (`contacts.$contactId`)

Dados, empresa, negócios em que participa e o papel em cada um, timeline
própria, e o bloco de LGPD: origem do consentimento, data, opt-out de e-mail,
botões **Exportar dados** e **Excluir contato**. Ambos auditados via
`recordAuditLog`.

### Timeline (`components/crm/timeline/`)

Componente único, reusado em negócio, contato e empresa, alimentado por
`crm_activity` filtrado pela entidade. Itens: ligação, reunião, e-mail, nota,
tarefa, WhatsApp — cada um com ícone, dono, data, duração e resultado.

**Decisão tomada na implementação**: o que está agendado fica numa seção
"Planejado" acima do histórico, e o histórico é agrupado pelo dia da
**conclusão**, não da criação. Agrupar tudo por `createdAt` colocava uma reunião
marcada para a semana que vem debaixo de "Hoje" — lida como se já tivesse
acontecido.

O composer no topo cria a atividade em uma linha: tipo, assunto, corpo
(TipTap, já disponível), e — para reunião — data/hora que espelha em
`calendar_event` (o `calendarEventId` de `crm_activity` existe para isso), de
modo que a reunião comercial apareça no calendário que a equipe já usa.

### Agenda comercial (`activities.tsx`)

"Minhas atividades": atrasadas, hoje, esta semana, sem data. Conclusão em um
clique. É a tela que o vendedor deixa aberta — usa o índice parcial
`(ownerUserId, dueAt) where completedAt is null` de 001.

Regra de higiene do funil, opcional por workspace: ao concluir uma atividade,
sugerir agendar a próxima antes de fechar o diálogo.

### Deduplicação

Ao criar contato, avisa (não bloqueia) se já existe e-mail igual no workspace;
ao criar empresa, se existe CNPJ ou domínio igual. Mesclagem em massa fica para
008.

**Nota**: CNPJ tem unique parcial por workspace, então um CNPJ idêntico é
rejeitado pelo banco — o aviso cobre o caso de domínio repetido e de CNPJ
digitado com máscara diferente (normalizado antes de comparar). CNPJ é
guardado sem máscara e mascarado só na exibição (`formatTaxId`).

## Fora de escopo

- Sincronização bidirecional de e-mail (fase 4).
- Enriquecimento automático de dados de empresa por CNPJ/domínio.
