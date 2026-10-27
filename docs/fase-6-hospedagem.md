# Fase 6 — Módulo de Hospedagem

- **Menu próprio** "Hospedagem", fora do Comercial. Rota: `/dashboard/workspace/<id>/hosting`.
- **Permissão própria `hosting`** (consultar, editar, configurar aviso interno), editável em Configurações > Papéis. Admin, dono, gestor comercial e financeiro/jurídico recebem tudo; vendedor recebe consultar e editar. Workspaces existentes recebem a permissão no próximo boot (backfill). A visibilidade por responsável continua seguindo a permissão de empresas.
- **Somente hospedagem de terceiros**: a lista mostra os clientes marcados com hospedagem de terceiros, com provedor, domínio e vencimento. "Adicionar cliente" marca uma empresa; "Remover da lista" desmarca. As opções "nossa", "sem hospedagem" e as marcas de serviço saíram da tela (as marcas já existentes são preservadas).
- **Aviso interno**: um único campo "Dias de antecedência" (padrão 30, editável). O aviso de 15 dias foi retirado do padrão. Nada é enviado ao cliente; a cobrança da hospedagem é feita em outro sistema.
- A ficha da empresa não mostra mais o painel de hospedagem. O dashboard comercial só mostra o cartão de hospedagem a quem tem a permissão.
- A API segue em `/api/crm/hosting`.
