export const LANE_COLORS = [
  { name: "Slate", value: "#64748B" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Green", value: "#22C55E" },
  { name: "Yellow", value: "#EAB308" },
  { name: "Orange", value: "#F97316" },
  { name: "Rose", value: "#F43F5E" },
  { name: "Purple", value: "#A855F7" },
  { name: "Pink", value: "#EC4899" },
] as const;

const DEFAULT_LANE_COLORS: Record<string, string> = {
  "to-do": "#64748B",
  "in-progress": "#3B82F6",
  "in-review": "#EAB308",
  done: "#22C55E",
};

export function getLaneColor(color: string | null | undefined, slug: string) {
  return color || DEFAULT_LANE_COLORS[slug] || LANE_COLORS[0].value;
}
