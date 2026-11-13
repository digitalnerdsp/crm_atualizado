import { Download, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type ContractDocument,
  fetchContractDocumentBlob,
} from "@/fetchers/crm/contract-documents";

type Props = {
  workspaceId: string;
  document: ContractDocument | null;
  onClose: () => void;
};

/** Mostra o documento na própria tela, sem baixar: PDF e imagem abrem aqui. */
export default function ContractDocumentViewer({
  workspaceId,
  document,
  onClose,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const documentId = document?.id;

  useEffect(() => {
    if (!documentId) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    fetchContractDocumentBlob(workspaceId, documentId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [workspaceId, documentId]);

  const isPdf = document?.contentType === "application/pdf";

  return (
    <Dialog open={!!document} onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="h-[88vh] max-w-5xl" bottomStickOnMobile={false}>
        <DialogHeader>
          <DialogTitle>{document?.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{document?.filename}</p>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto border-y bg-muted/30">
          {error ? (
            <p className="px-6 text-center text-sm text-destructive">{error}</p>
          ) : !url ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : isPdf ? (
            <iframe
              title={document?.title}
              src={url}
              className="size-full border-0"
            />
          ) : (
            <img
              src={url}
              alt={document?.title}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 p-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!url}
            onClick={() => url && window.open(url, "_blank", "noopener")}
          >
            <ExternalLink className="size-4" />
            Abrir em outra aba
          </Button>
          <Button
            size="sm"
            disabled={!url}
            render={<a href={url ?? undefined} download={document?.filename} />}
          >
            <Download className="size-4" />
            Baixar
          </Button>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
