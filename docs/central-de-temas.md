# Central de temas do workspace

Permite que o administrador envie temas pelo próprio admin e escolha qual vale
para o workspace. O visual padrão do sistema nunca é apagado.

## Onde fica

Configurações do workspace → **Temas** (visível a quem tem
`workspace: update` e `manage_settings`).

## O que um tema muda

Cores (modo claro e escuro), raio das bordas e família de fonte. **Não** muda o
layout, os menus nem o desenho das páginas. O logo do workspace continua sendo o
cadastrado em Geral.

## Formato do pacote (JSON, até 20 KB)

```json
{
  "schema": 1,
  "name": "Meu tema",
  "description": "opcional",
  "radius": "0.625rem",
  "fonts": { "sans": "Inter, ui-sans-serif, sans-serif", "heading": "..." },
  "light": { "primary": "#1d4ed8", "primaryForeground": "#ffffff" },
  "dark": { "primary": "#60a5fa" }
}
```

- Tudo é opcional, exceto `schema` (sempre `1`) e `name`. O que não for
  informado segue o padrão do sistema.
- Chaves de cor: background, foreground, card, cardForeground, popover,
  popoverForeground, primary, primaryForeground, secondary, secondaryForeground,
  muted, mutedForeground, accent, accentForeground, border, input, ring,
  destructive, success, warning, info, sidebar, sidebarForeground,
  sidebarPrimary, sidebarPrimaryForeground, sidebarAccent,
  sidebarAccentForeground, sidebarBorder. Chave desconhecida é recusada.
- Cores aceitas: `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`.
- `radius`: até 2rem ou 32px.
- Fontes: só nomes de família. **Arquivo de fonte não é enviado**: a fonte
  precisa existir no dispositivo do usuário (ou ser a do sistema).

## Segurança

O pacote nunca vira CSS livre. O servidor valida cada valor por expressão
estrita e gera o CSS só com variáveis conhecidas (`--primary` etc.); `url()`,
`@import`, `;`, `}` e scripts são recusados. Só quem gerencia o workspace envia,
ativa ou remove; qualquer membro lê o tema ativo. Envio, ativação e remoção ficam
no log de auditoria. Limite de 20 temas por workspace.

## Pré-visualização

"Pré-visualizar" aplica o tema só no navegador de quem clicou, sem salvar. "Ativar"
vale para todos os usuários do workspace.

## Tema Qerza

O botão "Adicionar tema Qerza" cria um tema com as cores conferidas no template
Qerza (roxo `#8743DF`, vermelho `#EE3232`, verde `#297F00`, laranja `#ff9900`,
azul `#3065D0`, fundo escuro `#171717`/`#202020`). Fundo e texto do modo claro
seguem o padrão do sistema.

## Banco de dados

Migração `0015_workspace-theme-center.sql`: apenas cria a tabela
`workspace_theme`. Faça backup antes de migrar.

## Layout (formato da tela)

Além de cores, raio e fonte, o pacote aceita `"layout": "default"` (padrão) ou `"layout": "qerza"`.
Com `qerza`, o app aplica o formato inspirado no template Qerza: menu lateral claro com ícones em blocos, conteúdo cinza-claro, cabeçalho branco, cards arredondados com sombra suave, campos, tabelas e selos em pílula.

- Os estilos do layout são do próprio app (`apps/web/src/styles/layout-qerza.css`); o JSON só escolhe o nome, nunca traz CSS.
- Temas antigos sem `layout` continuam no formato padrão.
- Para um tema já enviado (ex.: "Qerza"), use **Atualizar para o formato Qerza** em Configurações → Temas, ou envie o pacote de novo pela rota `PUT /api/theme/:workspaceId/:id`.
- Não exige migração.
