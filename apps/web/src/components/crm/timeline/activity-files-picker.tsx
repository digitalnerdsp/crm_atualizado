import { Paperclip, X } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  CONTRACT_DOCUMENT_ACCEPT,
  checkContractDocument,
  MAX_CONTRACT_DOCUMENT_MB,
} from "@/fetchers/crm/contract-documents";
import { toast } from "@/lib/toast";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
};

/** Escolhe imagens e PDFs para anexar à atividade que está sendo registrada. */
export default function ActivityFilesPicker({ files, onChange }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(list: FileList | null) {
    const accepted: File[] = [];
    for (const file of Array.from(list ?? [])) {
      try {
        checkContractDocument(file);
        accepted.push(file);
      } catch (error) {
        toast.error(`${file.name}: ${(error as Error).message}`);
      }
    }
    if (accepted.length) onChange([...files, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={CONTRACT_DOCUMENT_ACCEPT}
        onChange={(event) => pick(event.target.files)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        title={`PDF ou imagem, até ${MAX_CONTRACT_DOCUMENT_MB} MB`}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="size-3.5" />
        {t("crm:timeline.attach")}
      </Button>
      {files.map((file, index) => (
        <span
          key={`${file.name}-${file.size}-${file.lastModified}`}
          className="inline-flex max-w-48 items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
        >
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            aria-label="Remover arquivo"
            onClick={() => onChange(files.filter((_, i) => i !== index))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
