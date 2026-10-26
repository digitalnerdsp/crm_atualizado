import { createFileRoute, redirect } from "@tanstack/react-router";

// Contatos agora vivem dentro de "Empresas e contatos".
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/contacts/",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/workspace/$workspaceId/crm/companies",
      params: { workspaceId: params.workspaceId },
    });
  },
});
