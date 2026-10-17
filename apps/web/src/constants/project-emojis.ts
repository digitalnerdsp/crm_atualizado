export const PROJECT_EMOJIS = [
  { emoji: "📁", label: "Folder", keywords: "folder pasta arquivo projeto" },
  { emoji: "🚀", label: "Launch", keywords: "rocket launch startup entrega" },
  { emoji: "✨", label: "Magic", keywords: "magic sparkles brilho ideia" },
  { emoji: "💡", label: "Idea", keywords: "idea lamp ideia produto" },
  { emoji: "🎯", label: "Goal", keywords: "target goal meta foco" },
  { emoji: "📌", label: "Pinned", keywords: "pin pinned fixo prioridade" },
  {
    emoji: "🧭",
    label: "Roadmap",
    keywords: "map roadmap direcao planejamento",
  },
  { emoji: "📅", label: "Calendar", keywords: "calendar agenda prazo data" },
  {
    emoji: "📊",
    label: "Analytics",
    keywords: "chart analytics dados relatorio",
  },
  { emoji: "📈", label: "Growth", keywords: "growth crescimento metricas" },
  { emoji: "💬", label: "Chat", keywords: "chat conversa suporte mensagem" },
  { emoji: "👥", label: "Team", keywords: "team equipe pessoas membros" },
  {
    emoji: "🛠️",
    label: "Tools",
    keywords: "tools ferramenta manutencao engenharia",
  },
  { emoji: "⚙️", label: "Ops", keywords: "gear ops configuracao operacao" },
  {
    emoji: "🔐",
    label: "Security",
    keywords: "security seguranca acesso privado",
  },
  {
    emoji: "🧪",
    label: "Experiment",
    keywords: "test lab experimento pesquisa",
  },
  { emoji: "🎨", label: "Design", keywords: "design arte criativo marca" },
  {
    emoji: "🧩",
    label: "Feature",
    keywords: "puzzle feature modulo integracao",
  },
  { emoji: "💻", label: "Code", keywords: "code codigo desenvolvimento dev" },
  { emoji: "📱", label: "Mobile", keywords: "mobile celular app" },
  { emoji: "🌐", label: "Web", keywords: "web site internet portal" },
  { emoji: "🛒", label: "Commerce", keywords: "cart venda loja ecommerce" },
  { emoji: "💳", label: "Finance", keywords: "finance pagamento dinheiro" },
  { emoji: "📦", label: "Package", keywords: "package pacote entrega produto" },
  { emoji: "🏢", label: "Business", keywords: "business empresa escritorio" },
  { emoji: "🏷️", label: "Tags", keywords: "tag etiqueta categoria" },
  { emoji: "⭐", label: "Favorite", keywords: "star favorito destaque" },
  { emoji: "🔥", label: "Hot", keywords: "fire quente urgente importante" },
  { emoji: "✅", label: "Done", keywords: "done feito completo check" },
  { emoji: "🎬", label: "Media", keywords: "video media conteudo" },
] as const;

export function filterProjectEmojis(search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return PROJECT_EMOJIS;

  return PROJECT_EMOJIS.filter((item) =>
    [item.emoji, item.label, item.keywords]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}
