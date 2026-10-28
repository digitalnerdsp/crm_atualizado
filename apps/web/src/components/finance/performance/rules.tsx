import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FinanceMetadata } from "@/fetchers/finance";
import {
  type PerformanceConfig,
  type RulePayload,
  saveCommissionRule,
  savePresumption,
} from "@/fetchers/finance/performance";
import { useFinanceMutation } from "@/hooks/mutations/finance/use-finance-mutation";
import { toast } from "@/lib/toast";
import { dateLabel, Field, today } from "../shared";

function toMonths(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (!/^\d+$/.test(value) || Number(value) > 120)
    throw new Error("Informe os meses da recorrência de 0 a 120.");
  return Number(value);
}
function toBps(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "")
    .replace(",", ".")
    .trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) > 100)
    throw new Error(
      "Informe um percentual de 0 a 100, com até duas casas decimais.",
    );
  return Math.round(Number(value) * 100);
}
export function PerformanceRules({
  workspaceId,
  data,
  metadata,
  canManage,
}: {
  workspaceId: string;
  data: PerformanceConfig;
  metadata: FinanceMetadata;
  canManage: boolean;
}) {
  const [service, setService] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const save = useFinanceMutation(workspaceId, (json: RulePayload) =>
    saveCommissionRule(workspaceId, json),
  );
  const settings = useFinanceMutation(
    workspaceId,
    (json: { presumptionBps: number | null; version: number }) =>
      savePresumption(workspaceId, json),
  );
  const latest = data.rules
    .filter((r) => r.serviceId === service)
    .sort((a, b) => b.sequence - a.sequence)[0];
  return (
    <div className="space-y-5">
      <section className="rounded-xl border p-5">
        <h2 className="font-semibold">Comissão por serviço</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cada alteração cria uma versão. Novas cobranças registram a regra
          vigente na competência; as cobranças já geradas preservam o
          percentual. A comissão é calculada sobre o valor recebido e liberada
          quando o financeiro dá baixa no pagamento.
        </p>
        {canManage && (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const f = new FormData(e.currentTarget);
                save.mutate({
                  serviceId: service,
                  effectiveDate: String(f.get("effectiveDate")),
                  rateBps: toBps(f.get("rate")),
                  recurringRateBps: toBps(f.get("recurringRate")),
                  recurringMonths: toMonths(f.get("recurringMonths")),
                  version: latest?.sequence ?? 0,
                });
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <Field label="Serviço">
              <NativeSelect
                required
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                <option value="">Selecione</option>
                {metadata.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Vigência da nova regra">
              <Input
                type="date"
                name="effectiveDate"
                required
                min={
                  latest && latest.effectiveDate > today()
                    ? latest.effectiveDate
                    : today()
                }
                defaultValue={today()}
              />
            </Field>
            <Field label="Na venda (%)">
              <Input
                name="rate"
                inputMode="decimal"
                required
                placeholder="Ex.: 10,00"
              />
            </Field>
            <Field label="Na recorrência (%)">
              <Input
                name="recurringRate"
                inputMode="decimal"
                required
                placeholder="Ex.: 5,00"
              />
            </Field>
            <Field label="Meses da recorrência (vazio = sem limite)">
              <Input
                name="recurringMonths"
                inputMode="numeric"
                placeholder="Ex.: 2"
              />
            </Field>
            {latest && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Última versão: {latest.rateBps / 100}% na venda ·{" "}
                {latest.recurringRateBps / 100}% na recorrência ·{" "}
                {latest.recurringMonths === null
                  ? "sem limite de meses"
                  : `${latest.recurringMonths} meses`}{" "}
                · a partir de {dateLabel(latest.effectiveDate)}.
              </p>
            )}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              O vendedor é o responsável indicado na cobrança financeira. Na
              primeira cobrança vale o percentual da venda; nas cobranças
              seguintes, o da recorrência, pelos meses informados. Depois disso,
              não há comissão.
            </p>
            <Button
              disabled={!service || save.isPending}
              type="submit"
              className="sm:col-span-2"
            >
              Salvar nova regra
            </Button>
          </form>
        )}
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="font-semibold">Lucro presumido estimado</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Simulação gerencial: receita faturada × percentual informado. Não
          calcula IRPJ, CSLL ou outros tributos. O percentual atual é aplicado
          ao período consultado e à comparação anterior.
        </p>
        <form
          key={data.settings.version}
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const f = new FormData(e.currentTarget);
              const raw = String(f.get("presumption") ?? "").trim();
              settings.mutate({
                presumptionBps: raw ? toBps(f.get("presumption")) : null,
                version: data.settings.version,
              });
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        >
          <Field label="Percentual de presunção (%)">
            <Input
              name="presumption"
              inputMode="decimal"
              placeholder="Não configurado"
              defaultValue={
                data.settings.presumptionBps === null
                  ? ""
                  : String(data.settings.presumptionBps / 100)
              }
              disabled={!canManage}
            />
          </Field>
          {canManage && (
            <Button disabled={settings.isPending} type="submit">
              Salvar percentual
            </Button>
          )}
        </form>
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="mb-4 font-semibold">Histórico de regras</h2>
        <div className="overflow-x-auto">
          <Table className="w-full text-left text-sm">
            <TableHeader>
              <TableRow>
                {[
                  "Serviço",
                  "Versão",
                  "Início",
                  "Na venda",
                  "Na recorrência",
                  "Meses",
                ].map((v) => (
                  <TableHead key={v} className="p-2">
                    {v}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rules
                .slice((historyPage - 1) * 25, historyPage * 25)
                .map((r) => (
                  <TableRow className="border-t" key={r.id}>
                    <TableCell className="p-2">{r.serviceName}</TableCell>
                    <TableCell className="p-2">{r.sequence}</TableCell>
                    <TableCell className="whitespace-nowrap p-2">
                      {dateLabel(r.effectiveDate)}
                    </TableCell>
                    <TableCell className="p-2">{r.rateBps / 100}%</TableCell>
                    <TableCell className="p-2">
                      {r.recurringRateBps / 100}%
                    </TableCell>
                    <TableCell className="p-2">
                      {r.recurringMonths ?? "Sem limite"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
        {!data.rules.length && (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhuma regra cadastrada.
          </p>
        )}
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button
            variant="outline"
            disabled={historyPage <= 1}
            onClick={() => setHistoryPage((p) => p - 1)}
          >
            Anterior
          </Button>
          {historyPage}
          <Button
            variant="outline"
            disabled={historyPage * 25 >= data.rules.length}
            onClick={() => setHistoryPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </section>
    </div>
  );
}
