# Fase 2 — Empresa e contatos

- **Lista única "Empresas e contatos"**: o menu Comercial tem uma entrada só. A lista mostra o contato principal (e "+N" quando há mais) com telefone ou e-mail. A busca acha a empresa pelo próprio cadastro ou por qualquer contato dela (nome, e-mail, telefone, celular).
- `/crm/contacts` redireciona para `/crm/companies`. A ficha do contato continua existindo e volta para a lista unificada.
- **Pessoa física** (CPF com dígitos verificados) e **hospedagem de terceiros** (vencimento + dias de antecedência, padrão 30) já existiam; nada novo foi necessário. Consulta automática de CPF não existe: é digitado e validado, CNPJ e CEP seguem com consulta.
- Sem migração de banco.
- Teste de integração novo para a busca por contato; corrigida a expectativa de papéis do `setup.test.ts` (faltava `finance_legal`, da fase 7).
