import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import ContractDocumentViewer from "@/components/crm/contract-document-viewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CONTRACT_DOCUMENT_ACCEPT,
  type ContractDocument,
  checkContractDocument,
  deleteContractDocument,
  listContractDocuments,
  MAX_CONTRACT_DOCUMENT_MB,
  uploadContractDocument,
} from "@/fetchers/crm/contract-documents";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Props = {
  workspaceId: string;
  contractId: string;
  canEdit: boolean;
};

/** Documentos do contrato (contrato assinado, aditivos, proposta). */
export default function ContractDocuments({
  workspaceId,
  contractId,
  canEdit,
}: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["crm", workspaceId, "contract-documents", contractId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listContractDocuments(workspaceId, contractId),
  });
  const [viewing, setViewing] = useState<ContractDocument | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({
      queryKey: ["crm", workspaceId, "company-contract-documents"],
    });
  }

  function closeUpload() {
    setUploadOpen(false);
    setFile(null);
    setTitle("");
  }

  async function submit() {
    if (!file) return;
    setSaving(true);
    try {
      await uploadContractDocument(workspaceId, contractId, file, title);
      refresh();
      closeUpload();
      toast.success("Documento anexado");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(document: ContractDocument) {
    if (!window.confirm(`Remover "${document.title}" do contrato?`)) return;
    try {
      await deleteContractDocument(workspaceId, document.id);
      refresh();
      toast.success("Documento removido");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Documentos do contrato</h2>
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setUploadOpen(true)}
          >
            <Paperclip className="size-4" />
            Anexar documento
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhum documento anexado a este contrato.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border">
          {data.map((document) => (
            <li
              key={document.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => setViewing(document)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left hover:underline"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {document.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {document.filename} · {formatSize(document.sizeBytes)} ·{" "}
                    {formatDate(document.createdAt)}
                    {document.uploadedByName
                      ? ` · ${document.uploadedByName}`
                      : ""}
                  </span>
                </span>
              </button>
              {canEdit ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover documento"
                  onClick={() => remove(document)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={uploadOpen} onOpenChange={(open) => !open && closeUpload()}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Anexar documento</DialogTitle>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="doc-title" className="text-sm font-medium">
                Do que se trata?
              </label>
              <Input
                id="doc-title"
                value={title}
                maxLength={120}
                placeholder="Ex.: Contrato assinado, Aditivo de valor, Proposta"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium">Arquivo</span>
              <input
                ref={inputRef}
                type="file"
                accept={CONTRACT_DOCUMENT_ACCEPT}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null;
                  try {
                    if (picked) checkContractDocument(picked);
                    setFile(picked);
                  } catch (error) {
                    toast.error((error as Error).message);
                    event.target.value = "";
                    setFile(null);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                PDF ou imagem, até {MAX_CONTRACT_DOCUMENT_MB} MB.
              </p>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeUpload}>
              Cancelar
            </Button>
            <Button
              loading={saving}
              disabled={!file || !title.trim()}
              onClick={submit}
            >
              Anexar
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <ContractDocumentViewer
        workspaceId={workspaceId}
        document={viewing}
        onClose={() => setViewing(null)}
      />
    </section>
  );
}
