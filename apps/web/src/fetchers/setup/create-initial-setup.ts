import { getApiUrl } from "@/fetchers/get-api-url";

export type InitialSetupRequest = {
  appName: string;
  appDescription?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  workspaceName: string;
  workspaceDescription?: string;
  locale?: string;
  timezone?: string;
};

export type InitialSetupResponse = {
  userId: string;
  workspaceId: string;
  appName: string;
};

export async function createInitialSetup(input: InitialSetupRequest) {
  const response = await fetch(getApiUrl("/setup"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message || "Initial setup failed");
  }

  return (await response.json()) as InitialSetupResponse;
}
