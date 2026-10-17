import { client } from "@kaneo/libs";

export async function revokeAdminUserSessions(userId: string) {
  const response = await client.admin.users[":userId"]["revoke-sessions"].$post(
    {
      param: { userId },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
