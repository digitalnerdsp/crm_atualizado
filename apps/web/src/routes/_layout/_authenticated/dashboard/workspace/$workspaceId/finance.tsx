import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota antiga: o financeiro foi separado em contas a receber e a pagar.
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/finance",
)({
  validateSearch: (raw: Record<string, unknown>) => ({
    contractId: typeof raw.contractId === "string" ? raw.contractId : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/dashboard/workspace/$workspaceId/receivable",
      params,
      search,
    });
  },
});
