import { createFileRoute } from "@tanstack/react-router";
import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  guessImportMapping,
  IMPORT_FIELDS,
  IMPORT_REQUIRED_FIELD,
} from "@/constants/crm-import";
import {
  type DuplicatePolicy,
  type ImportEntity,
  type ImportRowOutcome,
  previewCrmImport,
  runCrmImport,
} from "@/fetchers/crm/import";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { type CsvTable, readCsvTable, toMappedRow } from "@/lib/csv";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/crm-import",
)({
  component: RouteComponent,
});

const IGNORE = "__ignore__";
const BATCH_SIZE = 200;
const PREVIEW_ROWS = 20;

function StatusBadge({ status }: { status: ImportRowOutcome["status"] }) {
  const { t } = useTranslation();
  const variant =
    status === "created"
      ? "success"
      : status === "updated"
        ? "info"
        : status === "skipped"
          ? "secondary"
          : "error";

  return (
    <Badge variant={variant} size="sm">
      {t(
        `crm:import.status${status.charAt(0).toUpperCase()}${status.slice(1)}`,
      )}
    </Badge>
  );
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspace, canManageCompanies } = useWorkspacePermission();
  const workspaceId = workspace?.id ?? "";

  const [entity, setEntity] = useState<ImportEntity>("company");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState<DuplicatePolicy>("skip");
  const [preview, setPreview] = useState<ImportRowOutcome[] | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [report, setReport] = useState<ImportRowOutcome[] | null>(null);

  const label = (field: string) =>
    t(`crm:importFields.${field}`, { defaultValue: field });

  function reset() {
    setTable(null);
    setMapping({});
    setPreview(null);
    setReport(null);
    setProgress(null);
  }

  async function handleFile(file: File) {
    try {
      const parsed = readCsvTable(await file.text());
      setTable(parsed);
      setMapping(guessImportMapping(parsed.headers, entity, label));
      setPreview(null);
      setReport(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:import.readError"),
      );
    }
  }

  function mappedRows(limit?: number) {
    if (!table) return [];
    const rows = limit ? table.rows.slice(0, limit) : table.rows;
    return rows.map((cells) => toMappedRow(table.headers, cells, mapping));
  }

  function missingRequired() {
    return !Object.values(mapping).includes(IMPORT_REQUIRED_FIELD[entity]);
  }

  async function handlePreview() {
    if (missingRequired()) {
      toast.error(
        t("crm:import.requiredMissing", {
          field: label(IMPORT_REQUIRED_FIELD[entity]),
        }),
      );
      return;
    }

    try {
      const result = await previewCrmImport({
        workspaceId,
        entity,
        policy,
        rows: mappedRows(PREVIEW_ROWS),
      });
      setPreview(result.rows);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:import.readError"),
      );
    }
  }

  /**
   * Em lotes, com o resultado acumulado: um arquivo grande não cabe numa
   * requisição, e o que já entrou fica mesmo se o meio falhar.
   */
  async function handleImport() {
    const rows = mappedRows();
    const outcomes: ImportRowOutcome[] = [];
    setProgress({ done: 0, total: rows.length });

    try {
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const batch = rows.slice(start, start + BATCH_SIZE);
        const result = await runCrmImport({
          workspaceId,
          entity,
          policy,
          rows: batch,
          // +2: a planilha começa na linha 1 e a primeira é o cabeçalho.
          firstLine: start + 2,
        });
        outcomes.push(...result.rows);
        setProgress({ done: start + batch.length, total: rows.length });
      }

      setReport(outcomes);
      setPreview(null);
      toast.success(t("crm:import.done"));
    } catch (error) {
      setReport(outcomes);
      toast.error(
        t("crm:import.importError", {
          message: error instanceof Error ? error.message : "",
        }),
      );
    } finally {
      setProgress(null);
    }
  }

  /** As recusadas voltam como arquivo para corrigir na planilha e reimportar
   * só elas. */
  function downloadRejected() {
    if (!report || !table) return;

    const rejected = report.filter((row) => row.status === "error");
    const lines = [
      ["linha", "motivo", ...table.headers].join(";"),
      ...rejected.map((row) => {
        const cells = table.rows[row.line - 2] ?? [];
        return [row.line, row.message ?? "", ...cells]
          .map((value) => {
            const asText = String(value ?? "");
            return /[";\n]/.test(asText)
              ? `"${asText.replace(/"/g, '""')}"`
              : asText;
          })
          .join(";");
      }),
    ];

    const blob = new Blob([`﻿${lines.join("\n")}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "linhas-recusadas.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const summary = report
    ? {
        created: report.filter((row) => row.status === "created").length,
        updated: report.filter((row) => row.status === "updated").length,
        skipped: report.filter((row) => row.status === "skipped").length,
        errors: report.filter((row) => row.status === "error").length,
      }
    : null;

  if (!canManageCompanies()) {
    return (
      <div className="p-2">
        <p className="text-sm text-muted-foreground">
          {t("crm:import.description")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <PageTitle title={t("crm:import.title")} />

      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-base font-medium">
          <Upload className="size-4" />
          {t("crm:import.title")}
        </h1>
        <p className="max-w-prose text-xs text-muted-foreground">
          {t("crm:import.description")}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="crm-import-entity">{t("crm:import.entity")}</Label>
          <Select
            value={entity}
            onValueChange={(value) => {
              if (typeof value !== "string") return;
              setEntity(value as ImportEntity);
              reset();
            }}
          >
            <SelectTrigger id="crm-import-entity">
              <SelectValue>
                {t(
                  `crm:import.entity${entity.charAt(0).toUpperCase()}${entity.slice(1)}`,
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(["company", "contact", "deal"] as const).map((option) => (
                <SelectItem key={option} value={option}>
                  {t(
                    `crm:import.entity${option.charAt(0).toUpperCase()}${option.slice(1)}`,
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="crm-import-file">{t("crm:import.file")}</Label>
          <Input
            id="crm-import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("crm:import.fileHint")}
          </p>
        </div>
      </div>

      {table ? (
        <>
          <p className="text-sm">
            {t("crm:import.rowsFound", { count: table.rows.length })}
          </p>

          <section className="space-y-2">
            <div>
              <h2 className="text-sm font-medium">{t("crm:import.mapping")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("crm:import.mappingHint")}
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("crm:import.column")}</TableHead>
                    <TableHead>{t("crm:import.sample")}</TableHead>
                    <TableHead className="w-56">
                      {t("crm:import.field")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.headers.map((header, index) => (
                    <TableRow key={header}>
                      <TableCell>{header}</TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">
                        {table.rows[0]?.[index] ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping[header] ?? IGNORE}
                          onValueChange={(value) => {
                            if (typeof value !== "string") return;
                            setMapping((current) => {
                              const next = { ...current };
                              if (value === IGNORE) delete next[header];
                              else next[header] = value;
                              return next;
                            });
                            setPreview(null);
                          }}
                        >
                          <SelectTrigger size="sm" className="w-52">
                            <SelectValue>
                              {mapping[header]
                                ? label(mapping[header])
                                : t("crm:import.ignore")}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={IGNORE}>
                              {t("crm:import.ignore")}
                            </SelectItem>
                            {IMPORT_FIELDS[entity].map((field) => (
                              <SelectItem key={field} value={field}>
                                {label(field)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-2">
            <Label htmlFor="crm-import-policy">{t("crm:import.policy")}</Label>
            <Select
              value={policy}
              onValueChange={(value) => {
                if (typeof value !== "string") return;
                setPolicy(value as DuplicatePolicy);
                setPreview(null);
              }}
            >
              <SelectTrigger id="crm-import-policy" className="sm:w-96">
                <SelectValue>
                  {t(
                    `crm:import.policy${policy.charAt(0).toUpperCase()}${policy.slice(1)}`,
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(["skip", "update", "create"] as const).map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(
                      `crm:import.policy${option.charAt(0).toUpperCase()}${option.slice(1)}`,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("crm:import.policyKey")}
            </p>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handlePreview}>
              {t("crm:import.preview")}
            </Button>
            <Button
              onClick={handleImport}
              disabled={progress !== null || missingRequired()}
            >
              {progress
                ? t("crm:import.importing", progress)
                : t("crm:import.import", { count: table.rows.length })}
            </Button>
          </div>
        </>
      ) : null}

      {preview ? (
        <section className="space-y-2">
          <div>
            <h2 className="text-sm font-medium">
              {t("crm:import.previewTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("crm:import.previewHint")}
            </p>
          </div>
          <OutcomeTable rows={preview} />
        </section>
      ) : null}

      {report && summary ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("crm:import.done")}</h2>
          <p className="text-sm">{t("crm:import.summary", summary)}</p>
          <div className="flex flex-wrap gap-2">
            {summary.errors > 0 ? (
              <Button variant="outline" size="sm" onClick={downloadRejected}>
                <Download className="size-3.5" />
                {t("crm:import.downloadErrors")}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={reset}>
              {t("crm:import.startOver")}
            </Button>
          </div>
          <OutcomeTable
            rows={report.filter(
              (row) => row.status === "error" || row.warnings?.length,
            )}
          />
        </section>
      ) : null}
    </div>
  );
}

function OutcomeTable({ rows }: { rows: ImportRowOutcome[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{t("crm:import.line")}</TableHead>
            <TableHead className="w-24">{t("crm:import.result")}</TableHead>
            <TableHead>{t("crm:import.warnings")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.line}>
              <TableCell className="tabular-nums">{row.line}</TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {[row.message, ...(row.warnings ?? [])]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
