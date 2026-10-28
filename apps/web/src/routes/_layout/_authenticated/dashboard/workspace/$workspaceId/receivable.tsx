import { createFileRoute } from "@tanstack/react-router";
import { LedgerPage } from "@/components/finance/ledger-page";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/receivable",
)({
  validateSearch: (raw: Record<string, unknown>) => ({
    contractId: typeof raw.contractId === "string" ? raw.contractId : undefined,
  }),
  component: Page,
});
function Page() {
  const { workspaceId } = Route.useParams();
  const { contractId } = Route.useSearch();
  return (
    <LedgerPage
      key={`${workspaceId}:${contractId ?? ""}`}
      workspaceId={workspaceId}
      side="receivable"
      selectedContract={contractId}
    />
  );
}
