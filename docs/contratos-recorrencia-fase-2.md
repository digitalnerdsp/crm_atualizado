# Fase 2 — Contratos e recorrência

Entrega cumulativa: mantém o módulo financeiro da fase 1 e acrescenta **Financeiro → Contratos e recorrência**.

## Funcionalidades

- Dashboard com receita recorrente mensal (MRR), contratos ativos e próximos ao término, valores previstos, cobrados, recebidos e saldo em aberto; comparação com período anterior de mesma duração.
- Gráficos de previsto × cobrado × recebido, evolução do MRR e faixas de vencimento contratual.
- Lista com cliente, vendedor, serviços, valores por ciclo, vigência, dias restantes, próxima cobrança e situação da geração.
- Filtros por período, cliente, vendedor, serviço, contrato, situação, periodicidade, início/término e prazo determinado/indeterminado, além de vencimento em 30/60/90 dias.
- Exportação de todos os resultados filtrados para Excel **.xlsx** e PDF. O Excel inclui contratos, serviços, filtros e indicadores. Não utiliza o formato binário legado .xls.
- Integração com contas a receber: títulos identificados pelo contrato, serviço e ciclo, com geração repetível sem duplicação e consulta/baixa pela tela financeira.
- Renovação de vigência, sincronização de reajustes, suspensão, retomada, cancelamento e término com as ações existentes do CRM.
- Histórico de versões financeiras, registro de auditoria, controle de concorrência e isolamento por workspace.

## Regras de cobrança

A geração começa desativada. Abra um contrato, confira lançamentos manuais existentes, escolha uma data inicial a partir de hoje (respeitando o início da vigência) e ative. A confirmação da tela exige essa conferência porque títulos manuais antigos não são conciliados automaticamente com ciclos contratuais.

A data inicial é a âncora do primeiro ciclo integral e não pode ser alterada depois da configuração. Mensal, trimestral e anual usam os respectivos preços integrais por ciclo; o equivalente mensal serve ao MRR, não ao valor cobrado de um serviço anual. O vencimento respeita o dia do contrato, com ajuste para meses curtos e sem anteceder o início do ciclo.

O horizonte de geração pode ser de 1 a 24 meses, com inclusão de ciclos iniciados na data limite. A rotina executa na inicialização da API e a cada hora, no minuto 17; também pode ser acionada manualmente. Precisa da API em execução e do banco disponível. Não é uma automação de envio por e-mail ou WhatsApp.

Ao suspender, não são cobrados ciclos cujo início caia durante a suspensão. A retomada conserva o calendário original, sem cobrar retroativamente os ciclos suspensos. Alterações de preço valem para ciclos que se iniciem a partir da data de efeito. O ciclo final pode ser cobrado integralmente ou proporcional aos dias de vigência, conforme a opção gravada na versão financeira. A renovação de contrato encerrado retoma a vigência sem recuperar cobranças do intervalo encerrado. Contratos cancelados exigem um novo contrato.

Ciclos passados são preservados. Títulos futuros com qualquer baixa, inclusive parcial, também são preservados e geram aviso quando uma alteração exigiria modificá-los. Títulos futuros sem baixa são atualizados ou cancelados pela sincronização, inclusive se foram emitidos antes de uma redução do horizonte. Não é permitido editar ou cancelar diretamente um título contratual na tela de lançamentos: use o contrato. As baixas continuam disponíveis no financeiro.

Os dias de efeito de eventos usam America/Sao_Paulo; datas civis de vigência permanecem datas de calendário. Os valores financeiros são inteiros em centavos. Esta integração contempla BRL; contratos em outras moedas são excluídos dos totais com indicação na tela.

## Indicadores e histórico

MRR é receita recorrente equivalente mensal dos contratos ativos na data de referência; não representa caixa. Cobrado considera competência do ciclo; recebido considera a data efetiva da baixa, incluindo juros, multa e desconto. Saldo em aberto considera vencimentos até o fim do período e as baixas até essa referência. Previsões de cobrança começam na ativação financeira.

O histórico de MRR utiliza eventos existentes do CRM. Comparações históricas detalhadas por serviço precisam de versões financeiras; na ausência delas, a interface sinaliza a limitação e não fabrica preços anteriores. O painel de um contrato mostra até 120 títulos recentes; a listagem financeira e as exportações permitem consultar todos os resultados dentro dos limites operacionais da consulta.

## Permissões

Leitura: `finance.read`. Exportação: `finance.export`. Configuração e geração: `finance.manage`, `finance.create` e `finance.update`. Renovação exige também as permissões do CRM para atualizar e alterar a situação do contrato. Os padrões restritos a administrador/proprietário da fase 1 foram mantidos.

## Instalação

1. Fazer backup do PostgreSQL e substituir o código pela entrega cumulativa.
2. Usar Node.js compatível com o projeto e pnpm 10.32.1; executar `pnpm install --frozen-lockfile` e `pnpm build`.
3. Aplicar a migração `apps/api/drizzle/0010_contract-billing-recurrence.sql` pelo fluxo Drizzle do projeto (`pnpm --filter @kaneo/api db:migrate`). O diário e o snapshot estão incluídos; não executar o SQL novamente por fora do controle de migrações.
4. Manter a configuração de ambiente e autenticação da instalação. A imagem Docker substitui os marcadores de URL do frontend pelo `env.sh`; para hospedagem estática, definir VITE_API_URL e VITE_CLIENT_URL antes do build.
5. Reiniciar a API e o frontend, conceder as permissões adequadas e ativar os contratos desejados após conferir cobranças manuais.

Nenhum banco de produção foi alterado durante o desenvolvimento desta entrega.

## Validação

Inclui testes de calendário, periodicidade, proporcionalidade, suspensão/retomada, reajuste, renovação, preservação de baixas, idempotência, isolamento de workspace, permissões, redução de horizonte, indicadores e arquivos Excel/PDF. A integração foi executada com PostgreSQL embutido (PGlite), aplicando as migrações do projeto. O teste visual usa respostas de API simuladas; não substitui a homologação com a base da instalação.

Verificação da entrega: build dos cinco pacotes concluído; 411 testes da suíte principal e 72 de integração aprovados. Typecheck do frontend e do módulo financeiro da API sem erros. O typecheck geral isolado da API mantém erros preexistentes em outros módulos, conforme registrado na fase 1. Verificação visual em desktop e celular sem erros de JavaScript e sem transbordamento horizontal da página.
