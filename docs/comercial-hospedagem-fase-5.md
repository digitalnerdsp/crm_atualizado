# Fase 5 — Comercial, carteira e hospedagem

Entrega cumulativa do Nortys: preserva as fases 1 a 4 e acrescenta **Comercial → Carteira e hospedagem**. Reutiliza o cadastro de empresas e contatos existente.

## Funcionalidades

- Dashboard com empresas na carteira, hospedagem própria/terceiros, renovações em atenção, novos cadastros, atualizações de hospedagem, e-mails aceitos pelo SMTP e envios de WhatsApp informados pelo usuário.
- Comparação com período anterior de mesma duração e gráficos mensais de hospedagem própria × terceiros e novos cadastros/avisos.
- Flags de hospedagem: **não informado**, **hospedagem nossa**, **hospedagem de terceiros** e **sem hospedagem**. Bases existentes começam sem classificação; nenhuma hospedagem é presumida.
- Flags de serviços usando o catálogo existente do CRM, sem criar contratos ou cobranças.
- Provedor, domínio, renovação, antecedência, observações e contato responsável pelos avisos.
- Filtros por período, hospedagem, situação da empresa, responsável, serviço, domínio/provedor/nome e atenção à renovação.
- Atalho para clientes ativos com hospedagem de terceiros e para renovações dentro da antecedência ou vencidas.
- Lista de empresas passa a exibir a hospedagem. A ficha da empresa contém um painel de hospedagem, serviços e histórico de avisos.
- A nova tela permite cadastrar empresa com contato principal pelo formulário existente e abrir em seguida o acompanhamento de hospedagem. Novas empresas criadas pela API ficam com o criador como responsável quando nenhum responsável foi explicitamente informado.

## Cadastro e histórico

Há um cadastro de hospedagem por empresa, com um domínio e um provedor. A empresa pode ter várias flags de serviços. Para múltiplas hospedagens/domínios independentes por empresa, seria necessária uma extensão desse modelo.

Cada alteração de hospedagem ou de flags cria uma versão com os valores e nomes dos serviços daquele momento. Alterações concorrentes verificam o número da versão; uma tela desatualizada recebe conflito e precisa ser atualizada. Os vínculos aceitam somente serviços do mesmo workspace. Serviços arquivados podem permanecer em flags existentes ou ser removidos, mas não adicionados como novo vínculo.

O contato dos avisos deve estar ativo e pertencer à própria empresa e ao workspace. E-mail e telefone vêm desse contato, sem permitir trocar silenciosamente o destinatário na mensagem. Novos canais começam desabilitados. A configuração pode ser salva sem contato se os dois canais permanecerem desabilitados.

O domínio de hospedagem é informado sem protocolo ou caminho, por exemplo `cliente.com.br`, e é normalizado em minúsculas. A informação é cadastral; não há consulta de DNS, verificação do servidor, acompanhamento de uptime, renovação de domínio ou alteração no provedor.

## Atenção à renovação

Para hospedagem de terceiros, a tela sinaliza a data registrada quando ela está dentro da antecedência escolhida, inclusive no limite, ou já passou. Antecedência configurável de 0 a 365 dias. A ausência de data tem filtro próprio; não é interpretada como hospedagem vencida.

O dashboard conta como renovações em atenção apenas empresas atualmente ativas com hospedagem de terceiros. Os filtros da lista permitem conferir outras situações. A sinalização permanece até a renovação/data do cadastro ser conferida e atualizada: enviar um aviso não confirma que a hospedagem foi renovada.

Os avisos ao cliente são acionados individualmente após revisão. **Não há disparo automático ou em lote**, nem obrigação agendada no provedor de hospedagem. O painel é a lista de acompanhamento para a equipe.

## Avisos por e-mail

O canal utiliza o SMTP já disponível em Configurações de e-mail, inclusive a configuração em tempo de execução existente. Não é necessário um novo provedor de e-mail para esse recurso; é necessário que o SMTP da instalação esteja configurado e funcional.

Fluxo: abrir a empresa → Avisar por e-mail → revisar contato e texto → confirmar a conferência → enviar. O assunto e a mensagem podem ser personalizados. Campos vazios geram um texto de conferência com empresa, domínio, provedor e renovação cadastrados. O assunto não aceita quebras de linha. O corpo é enviado como texto puro.

Para enviar, a empresa precisa estar ativa, não arquivada, e com hospedagem de terceiros. O contato deve ter e-mail válido, o canal habilitado no cadastro e não estar com opt-out de e-mail. O opt-out é conferido novamente no envio, não somente ao abrir a tela.

Antes de confirmar, o servidor confere uma assinatura da prévia. Mudanças de contato, destinatário ou cadastro exigem nova revisão. A API usa uma chave idempotente: repetir a mesma solicitação não chama o SMTP de novo. Reutilizar a chave com outros dados é rejeitado.

O aviso é persistido antes da chamada externa, com estado em processamento. Isso evita reenvio automático se o navegador repetir a requisição ou se a confirmação do transporte se perder.

| Estado | Significado |
| --- | --- |
| Em processamento | Aviso registrado, sem confirmação final. Conferir antes de repetir |
| Aceito pelo SMTP | O transporte aceitou o destinatário; não comprova entrega na caixa de entrada |
| Não enviado | SMTP ausente/não configurado; ajustar a configuração antes de nova tentativa |
| Confirmação indisponível | Houve falha ao obter a confirmação do transporte; verificar o provedor antes de reenviar |

Não há recibo de leitura, webhook de entrega ou retry automático. Para uma nova tentativa deliberada após a conferência, feche o aviso e abra um novo fluxo. Avisos em processamento ou com confirmação indisponível podem ter sido enviados; não devem ser repetidos sem conferir o provedor.

## WhatsApp assistido

Não existia um provedor de WhatsApp integrado na base. Esta entrega utiliza o fluxo assistido: revisa o contato e o texto, registra a preparação e gera um link `wa.me` com a conversa preenchida. O usuário precisa abrir o WhatsApp e concluir o envio.

O contato deve ter telefone internacional com DDI e DDD, por exemplo `+55 15 99999-9999`. Não é acrescentado um país automaticamente. O número é normalizado e validado antes de gerar o link. O canal precisa estar habilitado no cadastro.

**Preparar a conversa não envia a mensagem e não confirma entrega.** Depois de enviar no WhatsApp, o usuário pode registrar explicitamente o envio com uma confirmação. Isso também pode ser feito pelo histórico de um aviso preparado. A confirmação registra usuário e data e pode ser repetida sem duplicar o registro.

Os estados são **WhatsApp preparado** e **envio informado pelo usuário**. O dashboard separa preparação de confirmação manual. Não há API de disparo automático, integração Meta/Twilio/Evolution, aprovação de templates, confirmação de leitura ou entrega pelo WhatsApp nesta entrega.

## Permissões e carteira

As rotas novas exigem `crmCompany.read`, além do acesso ao workspace. Sem `crmCompany.read_all`, cada usuário só lê, atualiza e prepara avisos das empresas sob sua responsabilidade. Esse filtro é aplicado tanto no dashboard quanto nos endpoints individuais de hospedagem e avisos.

Atualizar cadastro/flags exige `crmCompany.update`. Criar empresa usa `crmCompany.create`. Revisar, enviar/preparar aviso e confirmar WhatsApp exigem a nova permissão **`crmCompany.notify`**. Ela é independente de editar a empresa; leitores não recebem acesso a envio apenas por poderem consultar o cadastro.

Os padrões de novos papéis admin, owner, sales e sales_manager incluem `notify`. **Papéis já gravados no banco, inclusive padrões editáveis, não têm suas permissões sobrescritas pela migração.** O responsável deve habilitar `notify` nos papéis que poderão avisar clientes, pela tela de permissões de workspace. O owner estático e administradores de instância seguem o comportamento de autorização existente. API keys continuam limitadas pelas suas permissões explícitas.

O menu de carteira também fica disponível para papéis com leitura de empresas sem leitura de negócios. As áreas de funil e negócios mantêm suas permissões.

Empresas arquivadas não aparecem na carteira atual e não recebem novos avisos. O histórico continua acessível no cadastro da empresa arquivada a usuários autorizados. Empresas com avisos registrados não podem ser excluídas; arquive para preservar a comunicação. Essa proteção se soma às restrições existentes por contratos e financeiro.

## Indicadores e limites

Responsável, situação, nome/domínio/provedor e carteira visível usam os dados atuais. As comparações da hospedagem usam a última versão registrada até a data de referência; antes da primeira versão, a classificação é desconhecida. O dashboard não inventa uma hospedagem histórica para a base migrada e informa quando a comparação anterior não tem registros.

As comparações refletem a carteira atualmente visível, excluindo empresas arquivadas. Novas empresas usam a data de criação; atualizações usam o histórico de versões; aceitação SMTP usa o momento do resultado registrado e confirmação de WhatsApp usa a data da confirmação manual. Os dias são calculados em America/Sao_Paulo.

Se o filtro termina no futuro, a referência e os gráficos de carteira param em hoje. Não se trata de uma projeção de novos clientes ou de migrações de hospedagem.

Limites: até 731 dias por consulta, proteção para até 10.000 empresas visíveis, até 100 flags de serviços por empresa. Lista paginada em 25 empresas. O painel de uma empresa mostra os 100 avisos mais recentes e o histórico de versões; registros anteriores de avisos continuam preservados no banco/auditoria. Não há exportação nova de contatos nesta etapa.

## API

Rotas sob `/api/crm/hosting/:workspaceId`:

| Método e rota | Uso |
| --- | --- |
| GET `/metadata` | Serviços sem preços e responsáveis da carteira visível |
| GET `/report` | Indicadores, gráficos e lista filtrada |
| GET `/companies/:id` | Hospedagem, contatos, serviços, versões e avisos |
| PUT `/companies/:id` | Atualizar cadastro e flags com controle de versão |
| POST `/companies/:id/preview` | Conferir destinatário e texto |
| POST `/companies/:id/notices` | Enviar e-mail ou preparar conversa de WhatsApp |
| POST `/notices/:id/confirm` | Registrar confirmação manual de WhatsApp |

Todas as alterações e resultados de comunicação geram auditoria. Dados de SMTP e senhas não são incluídos nas respostas desses endpoints.

## Instalação

1. Fazer backup do PostgreSQL e substituir o código pela entrega cumulativa.
2. Usar Node.js >=20.19 e pnpm 10.32.1. Executar `pnpm install --frozen-lockfile`.
3. Compilar os pacotes com `DO_NOT_TRACK=1 TURBO_TELEMETRY_DISABLED=1 pnpm -r --workspace-concurrency=2 --if-present run build`.
4. Aplicar `0013_commercial-hosting-phase-five` pelo fluxo Drizzle: `pnpm --filter @kaneo/api db:migrate`. Diário e snapshot incluídos. Não executar SQL novamente fora do controle de migrações.
5. Reiniciar API/frontend, preservando as variáveis e configurações da instalação. Hospedagem estática precisa das URLs VITE_API_URL e VITE_CLIENT_URL antes do build; a imagem Docker mantém o mecanismo existente de substituição pelo `env.sh`.
6. Conferir a permissão `crmCompany.notify` nos papéis existentes que poderão avisar clientes. Configurar/testar o SMTP pelo fluxo administrativo existente.
7. Na empresa, cadastrar hospedagem e flags, conferir o contato, o telefone internacional e os canais habilitados. Usar o dashboard e a lista para acompanhar as renovações.

Nenhum banco de produção foi alterado e nenhum aviso real a clientes foi enviado durante o desenvolvimento. Os testes de SMTP e o teste visual utilizaram mocks. As fases anteriores permanecem documentadas nos arquivos de financeiro, recorrência, comissões/resultados e taxas/impostos em `docs/`.

## Validação

**452 testes da suíte principal e 115 de integração aprovados, 567 no total.** Build dos cinco pacotes concluído. Integração em PostgreSQL embutido (PGlite), aplicando todas as migrações.

Novos testes cobrem: antecedência, dias civis, histórico e comparação, filtros de serviços, isolamento de workspace/carteira, permissão independente de avisos, contatos e serviços inválidos, opt-out, assinatura de prévia, repetição de solicitação, SMTP ausente/incerto, WhatsApp preparado/confirmado e proteção do histórico ao arquivar/excluir.

Typecheck do frontend sem erros. A verificação isolada do novo módulo da API encontrou somente os erros preexistentes de compatibilidade de tipos em `settings/secrets.ts`, importado pela configuração SMTP; não foram introduzidos diagnósticos nos novos arquivos. Os erros gerais anteriores da API continuam registrados na documentação das fases anteriores.

Verificação visual em desktop e celular com dados simulados: dashboard, filtros/lista, edição de hospedagem, prévia de e-mail, WhatsApp assistido e confirmação manual, sem erros de JavaScript ou transbordamento horizontal da página.
