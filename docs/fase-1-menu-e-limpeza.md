# Fase 1 — Menu e limpeza

- **Convites**: item removido do menu e rota `/dashboard/invitations` apagada. Usuários passam a ser criados em Administração. O onboarding `/invitations` e o convite por e-mail na página de membros continuam.
- **Agenda**: mostra só compromissos (sem filtro de tipo/prioridade; tarefas ficam nos projetos).
- **Gantt**: agora é um calendário mensal (anterior/próximo/hoje e seletor de mês), com busca e abertura da tarefa pelo mesmo painel.
- **Relatórios comerciais**: saíram do Comercial e foram para o Financeiro (rota `/crm/reports` inalterada).
- **Ícones do menu coloridos por grupo** (usam tokens do tema, então acompanham padrão e Qerza): Visão geral = primária, Comercial = info, Financeiro = success, Projetos = warning.
- Sem migração de banco.
