# Fase 6 — Dashboard geral de BI financeiro

Entrega construída sobre o `crm_atualizado-main.zip` enviado em 20/10/2026. Mantém as alterações de hospedagem, aviso interno e central de temas presentes nessa base. Novo acesso: **Financeiro → Dashboard geral — BI**. Rota do frontend: `/dashboard/workspace/:workspaceId/bi`.

## Entrega

- Visão executiva com receita faturada, recebido, lucro líquido gerencial e movimento líquido operacional.
- Blocos de visão geral, caixa e contas, resultados, recorrência, comissões e tributos/simulações.
- Indicadores de lucro bruto e margens, presunção gerencial, despesas, saldos a pagar/receber, atrasos, MRR, contratos e vencimentos, comissões apuradas/disponíveis/pagas/em aberto/emitidas a maior, impostos e despesas financeiras lançados/pagos/em aberto.
- Comparação com período anterior de mesma duração ou com as datas correspondentes no ano anterior. Datas de 29/02 são ajustadas ao último dia de fevereiro. Base anterior zero não gera percentual fictício. Margens com receita não positiva aparecem como não aplicáveis; comparação de margens usa pontos percentuais.
- Gráficos de receita/despesas/resultado, recebimentos/pagamentos, previsto/realizado, composição das despesas, formação do resultado, MRR e recebíveis por faixa de atraso.
- Rankings de serviços, clientes e vendedores, ordenáveis por receita, resultado vinculado, saldo vencido ou comissões. A tela apresenta dez grupos por dimensão; o Excel inclui todos os grupos do recorte.
- Recorte de despesas por categoria/subcategoria, favorecido/colaborador, PJ/Freelance/CLT e classificação gerencial.
- Projeções de 30, 60 e 90 dias, com acesso aos itens que compõem cada horizonte.
- Alertas para atrasos, resultado negativo, saída projetada superior à entrada, contratos terminando, geração contratual desativada, comissões disponíveis/emitidas a maior e despesas não classificadas.
- Composição dos indicadores paginada em 25 linhas, abrindo lançamentos pelo painel financeiro e contratos pela ficha existente. Preparações/simulações têm atalho para a área correspondente.
- Filtros na URL, atalhos de período, limpeza, atualização manual, acesso ao período pelo gráfico e acesso ao recorte pelos rankings/categorias.
- PDF executivo com indicadores, comparativos, gráficos, alertas, projeções e regras. Excel `.xlsx` com todas as composições e rankings, sem restrição à página da tela.

## Regras dos números

O BI reutiliza as regras gerenciais dos módulos existentes. Somente títulos de natureza operacional participam dos números financeiros consolidados. Saldo inicial e transferências ficam fora; o card é identificado como **movimento líquido operacional**, não saldo bancário. A diferença para um relatório que inclua saldo inicial é intencional.

Receita e despesas de títulos usam competência. Recebimentos/pagamentos usam baixas ativas efetivas, com desconto, juros e multa. Despesas de títulos incluem contas de comissão emitidas; o demonstrativo de lucro usa comissão apurada e não deduz novamente o principal dos títulos de comissão. A formação do resultado apresenta os componentes assinados. Margens exibem resultado dividido pela receita-base; o detalhamento explica a fórmula. Presunção usa o percentual configurado e não representa apuração fiscal.

Saldos em aberto incluem vencimentos até o fim do período, com principal baixado até a menor data entre hoje e o fim do período. Atraso é vencimento estritamente anterior à referência. Pagamento parcial reduz o saldo; estorno reapresenta o histórico. Essas consultas seguem o estado atual dos registros; não constituem fechamento contábil imutável nem reconstrução de versões anteriores a cancelamentos/estornos.

Disponibilidade para emitir comissões na referência atual respeita os títulos já emitidos e a apuração até hoje; não antecipa comissão de competência futura. Histórico segue a referência do período. As ações reais de emissão/pagamento permanecem nas telas existentes e continuam sujeitas às suas permissões e validações.

MRR não é caixa. Usa o modelo de histórico contratual existente. Valores sem base histórica por serviço são sinalizados e o comparativo de MRR não é apresentado como um número confiável nesses casos. Pontos de MRR em meses futuros não são inventados. Contratos em outras moedas são excluídos, com aviso; o BI trabalha em BRL.

As simulações ficam em bloco próprio. Seu cliente não é registrado no modelo atual: filtro de cliente não se aplica às simulações. Elas não geram receitas, lucro, caixa ou obrigações reais. Serviços e vendedores aplicam-se aos vínculos efetivamente registrados.

## Alcance dos filtros

- **Gerais:** período, cliente, vendedor e serviço. Vínculos ausentes não são presumidos.
- **Somente recorte de despesas:** categoria/subcategoria, favorecido, vínculo e classificação. Não alteram silenciosamente receitas, lucro geral, contratos ou simulações.
- **Somente recorrência e ciclos contratuais ainda não emitidos:** contrato e situação contratual. Os títulos financeiros já emitidos da projeção continuam pertencendo à carteira geral filtrada.
- **Comparativo/agrupamento:** período anterior ou ano anterior; mensal ou diário.
- **Ranking:** critério de ordenação dos grupos, sem alterar os totais.

Rentabilidade por cliente, serviço e vendedor não rateia despesas gerais. Grupos sem vínculo aparecem separadamente. Valores de resultado são gerenciais e dependem da classificação e dos vínculos dos lançamentos. Um filtro de cliente/serviço/vendedor exclui despesas sem aquele vínculo.

## Projeções

Referência = menor data entre hoje e o fim do período. Horizontes incluem vencimentos da referência até referência + 30/60/90 dias, inclusive os limites.

Somam principal ainda em aberto dos títulos operacionais e ciclos contratuais habilitados ainda não emitidos cujo vencimento esteja no horizonte. Um ciclo com início anterior e vencimento futuro pode participar. O planejamento respeita as versões financeiras, vigência, suspensão e proporcionalidade do modelo existente.

A chave de contrato/linha/início do ciclo evita duplicação: ciclo com título emitido, inclusive cancelado, não é incluído novamente como previsão contratual. Títulos existentes entram somente pelo saldo que resta. Consultar o BI **não gera cobranças**.

Vencidos aparecem separadamente nos indicadores/alertas. A projeção não inclui encargos futuros nem estima recebimentos de oportunidades comerciais, inadimplência, receitas sem contrato ou obrigações ainda não cadastradas. Não estima saldo bancário por não existir saldo inicial conciliado no escopo.

## API, acesso e desempenho

Rotas dentro de `/api/finance/:workspaceId/bi`:

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/report` | Resumo consolidado, gráficos, rankings, alertas e projeções |
| GET | `/details/:metric` | Composição paginada; `page` a partir de 1; `days` 30/60/90 para projeção/vencimentos |
| GET | `/export/:format` | `xlsx` ou `pdf` |

As rotas herdam acesso ao workspace e `finance.read`; exportações também exigem `finance.export`. API keys mantêm suas restrições. Não há nova permissão, tabela ou escrita operacional.

Resumo não retorna a base integral nem todas as composições ao navegador. Detalhamento é carregado sob demanda no servidor, com paginação. O BI reusa os lançamentos carregados ao consultar a carteira; o agrupamento por contrato e dos vínculos de comissão evita varreduras repetidas por grupo. Não há integração com Power BI nem serviço externo adicional.

Limites herdados: 50.000 lançamentos, 10.000 contratos e 10.000 simulações por workspace. Período de até 731 dias; agrupamento diário até 93 dias. Acima dos limites, os loaders recusam a consulta explicitamente. A consolidação é feita em memória no servidor, com esses limites; grandes bases exigem uma estratégia dedicada de agregação antes de ampliar os limites. O botão Atualizar refaz a consulta; não há atualização contínua por streaming.

## Atualização no Coolify

1. Fazer backup do banco e preservar os volumes PostgreSQL/uploads e as variáveis de ambiente.
2. Substituir o código no repositório pela entrega acumulada, mantendo a estrutura da raiz, e fazer commit/push.
3. Fazer deploy usando o `compose.yml` existente. Dockerfile, domínio, SMTP, banco e volumes continuam com a configuração atual.
4. Esta fase **não acrescenta migração SQL**. As migrações que já estavam no ZIP, inclusive `0014` e `0015`, permanecem incluídas e seguem o processo automático da API.
5. Abrir o Financeiro com usuário autorizado e conferir o novo primeiro item de menu. Validar os totais com os dados reais e um período conhecido.

Nenhum banco ou serviço de produção foi alterado no desenvolvimento. Nenhuma mensagem real foi enviada. A entrega contém código-fonte, não credenciais nem dados de teste destinados à produção.

## Validação

Suíte principal: 494 testes aprovados, incluindo 19 testes do BI. Integração: 115 testes aprovados em sete arquivos, incluindo sete novos cenários de API do BI; PostgreSQL embarcado PGlite com toda a cadeia de migrações. Os cenários do BI cobrem permissões, isolamento, paginação, não exposição da base, conciliação com o financeiro e exportação integral.

Testes de cálculo cobrem lucro/composição, ajuste de baixas, não duplicação de comissões, cancelamentos/estornos, filtros específicos, rankings por atraso, ano bissexto, agregação diária/mensal, aging, ciclos emitidos/cancelados e ciclos não emitidos com vencimento futuro, exclusão de contratos desabilitados/outras moedas e separação de simulações. Exportações são arquivos Excel/PDF reais, incluindo cenários com prejuízo e nomes Unicode.

Build dos cinco pacotes concluído, lint dos arquivos alterados e typecheck do frontend sem erros. A verificação geral isolada de tipos da API mantém diagnósticos preexistentes fora dos novos arquivos; ela não deve ser confundida com o build de produção ou com a verificação dos novos arquivos.

Conferência visual com respostas simuladas no Chromium: seis blocos, composição, projeção de 30 dias, filtros persistidos após recarregar, exportação e estado de erro. Desktop e celular sem erro JavaScript ou transbordamento horizontal da página. PDF executivo renderizado para inspeção interna. Essas verificações não substituem a homologação com os dados reais da instalação.
