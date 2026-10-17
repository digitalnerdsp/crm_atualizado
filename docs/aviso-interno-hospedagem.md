# Aviso interno de renovação de hospedagem de terceiros

Substitui o aviso ao cliente da fase 5. **Nenhuma mensagem é enviada a clientes.**
O objetivo é avisar a equipe, com antecedência, de quais clientes renovam a
hospedagem com terceiros, para que seja possível oferecer a hospedagem própria
antes da renovação.

## Como funciona

- Um e-mail **diário, em formato de lista**, é enviado aos usuários do workspace
  escolhidos manualmente (Carteira e hospedagem → aba **Aviso interno**).
- Cada e-mail lista, por faixa (30 dias, 15 dias), o cliente, o **provedor atual**,
  o domínio, a data de renovação, o responsável, o contato e o link do cadastro.
- Marcas padrão: **30 e 15 dias** antes da renovação (configuráveis, de 1 a 5
  marcas entre 1 e 365 dias).
- Só entram clientes **ativos**, não arquivados, com hospedagem **de terceiros** e
  data de renovação futura. Hospedagem própria, sem hospedagem, sem data ou já
  vencida não entram.
- Opção "enviar também ao responsável": cada responsável recebe somente as
  próprias empresas; os usuários marcados recebem a lista completa.
- Cada empresa é listada **uma vez por marca e por data de renovação**. Se a data
  mudar, um novo ciclo começa. Cadastro tardio (por exemplo, faltam 10 dias)
  lista só a marca mais próxima (15), sem repetir a de 30.
- Envio a partir das **8h (America/Sao_Paulo)**, pela rotina agendada que roda
  a cada hora (minuto 23).
- Falha de envio: até 3 tentativas (após 1h e 6h). Depois fica como **falha** e
  pode ser reenviada manualmente na aba. Quem já recebeu não recebe de novo.
- Se não houver nenhum destinatário utilizável, nada é registrado e as empresas
  continuam pendentes até que haja.

## Lista de clientes com hospedagem de terceiros

Filtros: provedor, prazo da renovação (vencida, 15, 30, 60, 90 dias), responsável,
serviço, situação, busca. Colunas: provedor, domínio, renovação, **próximo aviso**
e **último aviso enviado**.

## Permissões

Configurar, visualizar e reenviar exige `crmCompany: read_all` **e** `notify`.
Papéis já salvos no banco precisam dessas permissões para acessar a aba.

## Banco de dados

Migração `0014_hosting-digest-internal.sql`, apenas aditiva (4 tabelas:
configuração, destinatários, execuções e itens). Roda sozinha na subida da API.
Recomenda-se backup antes de migrar.

## Fora do escopo desta entrega

- Aviso por WhatsApp (API oficial prevista para uma fase futura).
- Correção do DDI no WhatsApp e flags de serviço derivadas de contrato.
- Os avisos antigos enviados ao cliente continuam visíveis, somente leitura, no
  histórico da empresa.
