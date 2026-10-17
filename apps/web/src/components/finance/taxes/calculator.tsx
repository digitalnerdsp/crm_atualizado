import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FinanceMetadata } from "@/fetchers/finance";
import {
  type CalculationPayload,
  calculateSale,
  saveTaxSimulation,
  type TaxCalculation,
  type TaxConfig,
} from "@/fetchers/finance/taxes";
import { useFinanceMutation } from "@/hooks/mutations/finance/use-finance-mutation";
import { toast } from "@/lib/toast";
import { cents, Field, money, selectClass, today } from "../shared";
import { parseRate } from "./profiles";

type View = {
  payload: CalculationPayload;
  calculated: TaxCalculation;
  requestId: string;
};
export function TaxCalculator({
  workspaceId,
  config,
  metadata,
  canSave,
}: {
  workspaceId: string;
  config: TaxConfig;
  metadata: FinanceMetadata;
  canSave: boolean;
}) {
  const [profileId, setProfileId] = useState(
    config.profiles.find((p) => p.isActive)?.id ?? "",
  );
  const [commissionMode, setCommissionMode] = useState<
    "none" | "manual" | "service"
  >("manual");
  const [mode, setMode] = useState<"gross" | "net">("net");
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState(false);
  const profile = config.profiles.find((p) => p.id === profileId);
  const save = useFinanceMutation(
    workspaceId,
    ({ view, title }: { view: View; title: string }) =>
      saveTaxSimulation(workspaceId, {
        calculation: view.payload,
        calculationSignature: view.calculated.calculationSignature,
        requestId: view.requestId,
        title,
      }),
    () => setSaved(true),
  );
  const calculate = async (form: HTMLFormElement) => {
    try {
      const f = new FormData(form);
      if (!profile) throw new Error("Cadastre e selecione um perfil ativo.");
      const payload: CalculationPayload = {
        profileId: profile.id,
        profileVersion: profile.version,
        date: String(f.get("date")),
        mode,
        amountCents: cents(f.get("amount")),
        costCents: cents(f.get("cost") || "0"),
        commissionMode,
        commissionRateBps:
          commissionMode === "manual"
            ? parseRate(String(f.get("commission") || "0"))
            : 0,
        serviceId: String(f.get("service") || "") || null,
        sellerId: String(f.get("seller") || "") || null,
      };
      setBusy(true);
      setView(null);
      setSaved(false);
      const calculated = await calculateSale(workspaceId, payload);
      setView({ payload, calculated, requestId: crypto.randomUUID() });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Calculadora de vendas</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Escolha o perfil e informe o valor da venda ou o líquido que deseja
          manter após taxas, impostos, comissão e custo.
        </p>
        <form
          className="mt-5"
          onChange={() => {
            setView(null);
            setSaved(false);
          }}
          onSubmit={(e) => {
            e.preventDefault();
            calculate(e.currentTarget);
          }}
        >
          <fieldset
            disabled={busy || save.isPending}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Perfil de taxas e impostos">
              <select
                required
                className={selectClass}
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              >
                <option value="">Selecione</option>
                {config.profiles
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · v{p.version}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Data da simulação">
              <Input type="date" name="date" required defaultValue={today()} />
            </Field>
            <Field label="O que deseja calcular?">
              <select
                className={selectClass}
                value={mode}
                onChange={(e) => setMode(e.target.value as "gross" | "net")}
              >
                <option value="net">
                  Preço para alcançar o líquido desejado
                </option>
                <option value="gross">
                  Líquido a partir do preço de venda
                </option>
              </select>
            </Field>
            <Field
              label={
                mode === "net" ? "Líquido desejado (R$)" : "Preço da venda (R$)"
              }
            >
              <Input
                name="amount"
                inputMode="decimal"
                required
                placeholder="Ex.: 1000,00"
              />
            </Field>
            <Field label="Custo da entrega/serviço (R$)">
              <Input name="cost" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label="Serviço">
              <select
                name="service"
                required={commissionMode === "service"}
                className={selectClass}
                defaultValue=""
              >
                <option value="">Sem vínculo</option>
                {metadata.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vendedor">
              <select name="seller" className={selectClass} defaultValue="">
                <option value="">Sem vínculo</option>
                {metadata.sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Comissão">
              <select
                className={selectClass}
                value={commissionMode}
                onChange={(e) =>
                  setCommissionMode(e.target.value as typeof commissionMode)
                }
              >
                <option value="manual">Informar percentual</option>
                <option value="service">Usar regra do serviço na data</option>
                <option value="none">Sem comissão</option>
              </select>
            </Field>
            {commissionMode === "manual" && (
              <Field label="Comissão sobre a venda (%)">
                <Input
                  name="commission"
                  inputMode="decimal"
                  defaultValue="0"
                  required
                />
              </Field>
            )}
            {profile && (
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground sm:col-span-2">
                <p className="font-medium text-foreground">
                  Parâmetros do perfil
                </p>
                {profile.items.length ? (
                  profile.items.map((i) => (
                    <p className="mt-1" key={i.name}>
                      {i.name}: {i.rateBps / 100}% + {money(i.fixedCents)} por
                      venda
                    </p>
                  ))
                ) : (
                  <p>Nenhuma taxa ou imposto neste perfil.</p>
                )}
                {profile.notes && <p className="mt-2">{profile.notes}</p>}
              </div>
            )}
            <Button
              type="submit"
              disabled={!profile?.isActive || busy}
              className="sm:col-span-2"
            >
              {busy ? "Calculando…" : "Calcular venda"}
            </Button>
          </fieldset>
        </form>
        {!config.profiles.some((p) => p.isActive) && (
          <p className="mt-4 text-sm">
            Crie ou ative um perfil na aba Perfis para calcular.
          </p>
        )}
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Resultado da simulação</h2>
        {!view ? (
          <p className="text-sm text-muted-foreground">
            Preencha os parâmetros e clique em Calcular venda.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">Preço de venda</p>
                <strong className="mt-2 block text-2xl tabular-nums">
                  {money(view.calculated.snapshot.result.grossCents)}
                </strong>
              </div>
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">
                  Líquido após encargos e custo
                </p>
                <strong
                  className={`mt-2 block text-2xl tabular-nums ${view.calculated.snapshot.result.netCents < 0 ? "text-destructive" : ""}`}
                >
                  {money(view.calculated.snapshot.result.netCents)}
                </strong>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              {[
                ["Impostos", view.calculated.snapshot.result.taxCents],
                ["Taxas", view.calculated.snapshot.result.feeCents],
                ["Comissão", view.calculated.snapshot.result.commissionCents],
                ["Custo", view.calculated.snapshot.result.costCents],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex justify-between gap-3 border-b py-2"
                >
                  <dt>{label}</dt>
                  <dd className="tabular-nums">{money(Number(value))}</dd>
                </div>
              ))}
            </dl>
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Memória do cálculo
              </summary>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {view.calculated.snapshot.result.breakdown.map((i) => (
                  <p key={i.name}>
                    {i.name} ({i.kind === "tax" ? "imposto" : "taxa"}):{" "}
                    {i.rateBps / 100}% + {money(i.fixedCents)} ={" "}
                    {money(i.amountCents)}
                  </p>
                ))}
                <p>{view.calculated.snapshot.commissionSource}</p>
                <p>
                  Perfil {view.calculated.snapshot.profileName} · versão{" "}
                  {view.calculated.snapshot.profileVersion}. Arredondamento em
                  centavos por item.
                </p>
              </div>
            </details>
            {canSave && (
              <form
                className="space-y-3 border-t pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({ view, title });
                }}
              >
                <Field label="Nome para salvar no histórico">
                  <Input
                    maxLength={180}
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: Proposta de hospedagem — cenário 1"
                    disabled={saved || save.isPending}
                  />
                </Field>
                <Button type="submit" disabled={saved || save.isPending}>
                  {saved
                    ? "Simulação salva no histórico"
                    : save.isPending
                      ? "Salvando…"
                      : "Salvar simulação"}
                </Button>
              </form>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Os percentuais incidem sobre o preço bruto e os valores fixos uma vez
          por venda. É uma simulação com os parâmetros informados; não apura
          tributos por regime, retenções ou créditos. O cálculo não cria
          cobranças ou pagamentos.
        </p>
      </section>
    </div>
  );
}
