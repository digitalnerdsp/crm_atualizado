# Fase 7 — Gestão da carteira e Financeiro/Jurídico

## Acesso e telas

Menu Financeiro → Gestão da carteira. Mantém o Dashboard geral — BI e todas as telas anteriores.

- Resumo com KPIs de recebíveis vencidos, renovações, resultado e promessas; gráfico de receita e resultado por mês e comparação com o período anterior de igual duração.
- Fila de contas a receber com saldo, contratos com prazo determinado e hospedagens de terceiros com renovação cadastrada. Inclui vencidos e horizonte de 30, 60 ou 90 dias. Contratos com término passado permanecem em atenção enquanto não forem encerrados ou renovados.
- Acompanhamento com responsável, situação, próxima ação/data, promessa e notas. Histórico por obrigação e data de vencimento: nova data de renovação inicia outro acompanhamento, preservando o anterior.
- Rentabilidade por cliente com receita, resultado gerencial, margem, período anterior, inadimplência e estimativa de produção de sites separada.
- Sites e colaboradores: resultado do período e acumulado dos títulos explicitamente vinculados, planejado versus realizado e custos por colaborador.
- Minutas para elaboração, submissão e decisão interna com permissão separada.
- Exportações Excel (.xlsx) e PDF com resultados completos do filtro, sem limitar à página exibida.

O período selecionado filtra o resultado por competência e as horas pela data de início em America/Sao_Paulo. A fila representa a situação atual; antecedência, origem, responsável e situação filtram a fila e seu histórico. O cliente filtra também os resultados. Despesas gerais sem cliente ficam destacadas, sem rateio automático.

## Horas nos cards — somente sites

1. O financeiro cadastra o projeto de site e seu cliente.
2. Na tarefa de produção, vincular o mesmo cliente e abrir “Horas do projeto de site”.
3. Selecionar o site e informar as horas previstas. Cada tarefa pertence a um único site; o vínculo não pode ser transferido para preservar o histórico.
4. Cada colaborador inicia/conclui seu timer ou informa um intervalo já concluído. Pode corrigir os próprios intervalos; alterações são auditadas. Permissão administrativa de custos pode corrigir apontamentos pela API.
5. O card mostra previsto, realizado, restante/excedente e apontamentos em andamento. Os detalhes mostram o tempo de cada autor.

A previsão fica com o responsável atual do card. As horas efetivas permanecem com o autor do apontamento quando a tarefa é reatribuída. Timers abertos não são convertidos em custo. Intervalos de sites devem ser válidos, sem sobreposição por colaborador, sem datas futuras e com até 24 horas cada. Apontamentos longos devem ser divididos/corrigidos.

Tráfego pago e social media continuam com resultado financeiro pelos lançamentos; não precisam de horas. Somente tarefas explicitamente vinculadas a um projeto de site entram neste custeio. A produção vê horas e nomes, sem taxas, custos ou margens.

## Custeio e conciliação

- Custo interno ou prestador por hora: horas concluídas × taxa vigente na data trabalhada.
- Taxas são imutáveis. A primeira pode informar início histórico após conferência; as seguintes devem ser posteriores à última e não retroativas.
- Freelancer por preço fechado: valor único na data do acordo, independentemente do total de horas.
- Custo já lançado: vincular conta a pagar operacional ativa do mesmo cliente e workspace. A origem só pode ser atribuída a um colaborador/site, evitando duplicidade.
- Uma conta financeira só pode pertencer a um site. Ao vinculá-la ao acordo, ela entra também no conjunto financeiro desse site.
- Estimativas não geram contas a pagar nem alteram o resultado financeiro automaticamente.
- Cenário com estimativas exige habilitação explícita após conferência de custos já contabilizados. Só desconta estimativas sem origem já lançada. Sem taxa/acordo ou com origem cancelada/incoerente, sinaliza pendência e não apresenta cenário completo.

Para salários e encargos já contabilizados, associe a origem financeira adequada ou mantenha o cenário desabilitado até definir a conciliação. Não há rateio automático de folha entre vários clientes. A atribuição de horas a um dia considera o início do apontamento; intervalos que atravessam dias podem ser divididos para maior precisão.

## Papel Financeiro/Jurídico

Novo papel de workspace, distinto do perfil global de administrador. Disponível para convites e alteração de membros, com descrição em português e inglês.

Permite consultar, criar e editar lançamentos, registrar baixas, exportar, acompanhar cobranças/renovações, revisar avisos, cadastrar custos de sites e elaborar/submeter minutas. Consulta a carteira comercial e atualiza dados de empresas/contatos.

Não concede produção, projetos, tarefas, calendário operacional, gestão de usuários, configurações, categorias/regras financeiras, cancelamento de títulos, estorno de baixas ou aprovação final. Estas ações têm permissões independentes. Minutas aprovadas são imutáveis; aprovação interna não assina documentos nem altera contratos ou cobranças. Para executar alterações contratuais, o aprovador utiliza o fluxo comercial/financeiro existente.

As APIs verificam o workspace e cada ação. Respostas comerciais de cliente/negócio não devolvem tarefas para usuários sem leitura de produção. O usuário deste papel é direcionado à Gestão da carteira ao entrar pelo workspace ou pelo resumo operacional.

## Cobranças e avisos

Concluir acompanhamento não quita a conta, renova o contrato ou altera a hospedagem. A baixa e a renovação continuam nos seus fluxos próprios.

Avisos exigem acompanhamento salvo, cliente ativo não arquivado e contato pertencente ao cliente. E-mail respeita opt-out e usa o SMTP configurado no sistema. O usuário revisa destinatário e texto e confirma antes do envio. Mudanças relevantes na origem/contato invalidam a prévia. Solicitações são idempotentes, com histórico; retornos incertos não repetem SMTP automaticamente. Aceitação SMTP não significa entrega na caixa de entrada.

WhatsApp é assistido: telefone internacional com +DDI, link para conversa e conclusão manual pelo usuário. Preparar a conversa não é registrado como mensagem enviada; há confirmação manual separada no histórico. Não há disparos agendados nesta fase.

## Atualização no Coolify

1. Fazer backup do PostgreSQL e preservar os volumes atuais de banco e uploads.
2. Substituir o código no repositório pelo conteúdo completo deste pacote, mantendo as variáveis do ambiente atual.
3. Publicar o commit e redeployar pelo mesmo compose.yml e Dockerfile descritos no COOLIFY.md.
4. Na inicialização, a API aplica a migração 0016_portfolio-sites-finance-legal e depois o preenchimento dos papéis de workspace. Não executar db:generate nem recriar o banco em produção.
5. Conferir o log de migração e atribuir o papel Financeiro/Jurídico pelo administrador do workspace. Contas já existentes não mudam de papel automaticamente.
6. Conferir primeiro um cliente, um site e um acordo; vincular os títulos financeiros corretos antes de habilitar cenários.

A migração cria nove tabelas e preserva os direitos de cancelamento/estorno dos papéis anteriores que já podiam editar/dar baixa. O novo Financeiro/Jurídico nasce sem esses direitos. Recursos e papéis personalizados existentes são preservados pelo preenchimento incremental.

## Verificação

Compilação de produção da API e interface, checagem TypeScript da interface, 508 testes unitários/componentes e 133 testes de integração dos módulos financeiro/comercial, incluindo 18 da nova fase. Migrações completas aplicadas em PostgreSQL embarcado de testes (PGlite); SMTP simulado, sem envios reais. Conferência em navegador desktop e mobile das sete abas, histórico, minuta e restrição de produção. A compilação padrão da API utiliza esbuild; a checagem TypeScript isolada da API ainda acusa incompatibilidades preexistentes de tipagem em outros módulos.

Pacote cumulativo: preserva os arquivos das fases anteriores, incluindo temas, BI e avisos de hospedagem. Dependências instaladas, builds e arquivos temporários de QA não fazem parte do ZIP.
