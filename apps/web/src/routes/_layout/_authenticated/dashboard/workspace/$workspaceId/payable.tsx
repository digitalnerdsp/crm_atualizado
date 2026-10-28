import { createFileRoute } from "@tanstack/react-router";
import { LedgerPage } from "@/components/finance/ledger-page";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/payable",
)({
  component: Page,
});
function Page() {
  const { workspaceId } = Route.useParams();
  return (
    <LedgerPage key={workspaceId} workspaceId={workspaceId} side="payable" />
  );
}
