import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useState } from "react";
import ContractDocumentViewer from "@/components/crm/contract-document-viewer";
import {
  type ContractDocument,
  listCompanyContractDocuments,
} from "@/fetchers/crm/contract-documents";
import { formatDate } from "@/lib/format";

type Props = {
  workspaceId: string;
  companyId: string;
  contracts: { id: string; number: number; title: string }[];
};

/** Na empresa só se lista: cada contrato e do que se trata cada documento.
 * Clicar abre o mesmo arquivo anexado no contrato. */
export default function CompanyContractDocuments({
  workspaceId,
  companyId,
  contracts,
}: Props) {
  const { data } = useQuery({
    queryKey: ["crm", workspaceId, "company-contract-documents", companyId],
    queryFn: () => listCompanyContractDocuments(workspaceId, companyId),
  });
  const [viewing, setViewing] = useState<ContractDocument | null>(null);

  if (contracts.length === 0) return null;

  return (
    <section className="mb-4 break-inside-avoid space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Documentos dos contratos</h2>
      <ul className="space-y-3">
        {contracts.map((contract) => {
          const documents = (data ?? []).filter(
            (document) => document.contractId === contract.id,
          );
          return (
            <li key={contract.id} className="space-y-1">
              <Link
                to="/dashboard/workspace/$workspaceId/crm/contracts/$contractId"
                params={{ workspaceId, contractId: contract.id }}
                className="text-sm font-semibold hover:underline"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  #{contract.number}
                </span>{" "}
                {contract.title}
              </Link>
              {documents.length === 0 ? (
                <p className="pl-1 text-xs text-muted-foreground">
                  Sem arquivo anexado.
                </p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-lg border border-border">
                  {documents.map((document) => (
                    <li key={document.id}>
                      <button
                        type="button"
                        onClick={() => setViewing(document)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {document.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(document.createdAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <ContractDocumentViewer
        workspaceId={workspaceId}
        document={viewing}
        onClose={() => setViewing(null)}
      />
    </section>
  );
}
