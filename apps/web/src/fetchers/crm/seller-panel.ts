import { resolveApiBaseUrl } from "@kaneo/libs";

export type SellerPanel = {
  month: string;
  nextMonth: string;
  sales: { month: string; count: number; valueCents: number }[];
  commission: { monthCents: number; forecastCents: number };
};

// Rota fora do cliente tipado (ver crm/index.ts na API).
export async function getSellerPanel(workspaceId: string) {
  const res = await fetch(
    `${resolveApiBaseUrl(import.meta.env.VITE_API_URL)}/crm/seller-panel?workspaceId=${encodeURIComponent(workspaceId)}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error("Não foi possível carregar o painel.");
  return (await res.json()) as SellerPanel;
}
