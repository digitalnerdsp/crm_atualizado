import { resolveApiBaseUrl } from "@kaneo/libs";

// Fora do cliente tipado (ver workspace/role-routes na API).
const base = () =>
  `${resolveApiBaseUrl(import.meta.env.VITE_API_URL)}/workspace`;

async function send(path: string, method: "POST" | "PUT", body: unknown) {
  const res = await fetch(`${base()}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return res.json().catch(() => null);
  const text = await res.text();
  let message = "Não foi possível salvar a função.";
  try {
    message = JSON.parse(text).message ?? message;
  } catch {
    // resposta que não é JSON: mantém a mensagem padrão
  }
  throw new Error(message);
}

export const updateWorkspaceRolePermissions = (
  workspaceId: string,
  role: string,
  permission: Record<string, string[]>,
) =>
  send(`/${workspaceId}/roles/${encodeURIComponent(role)}`, "PUT", {
    permission,
  });

export const createWorkspaceRole = (
  workspaceId: string,
  role: string,
  permission: Record<string, string[]>,
) => send(`/${workspaceId}/roles`, "POST", { role, permission });
