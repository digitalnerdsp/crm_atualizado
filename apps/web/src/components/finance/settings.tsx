import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  type CategoryPayload,
  type FinanceMetadata,
  type PartyPayload,
  saveCategory,
  saveParty,
} from "@/fetchers/finance";
import { useFinanceMutation } from "@/hooks/mutations/finance/use-finance-mutation";
import { Field } from "./shared";
export function FinanceSettings({
  workspaceId,
  metadata,
}: {
  workspaceId: string;
  metadata: FinanceMetadata;
}) {
  const [category, setCategory] = useState<
    FinanceMetadata["categories"][number] | null
  >(null);
  const [party, setParty] = useState<FinanceMetadata["parties"][number] | null>(
    null,
  );
  const [direction, setDirection] = useState<"payable" | "receivable">(
    "payable",
  );
  const [categoryKey, setCategoryKey] = useState(0);
  const [partyKey, setPartyKey] = useState(0);
  const categories = useFinanceMutation(
    workspaceId,
    (input: CategoryPayload) => saveCategory(workspaceId, input, category?.id),
    () => {
      setCategory(null);
      setCategoryKey((k) => k + 1);
    },
  );
  const parties = useFinanceMutation(
    workspaceId,
    (input: PartyPayload) => saveParty(workspaceId, input, party?.id),
    () => {
      setParty(null);
      setPartyKey((k) => k + 1);
    },
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Categorias e subcategorias</h2>
        <form
          key={categoryKey}
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            categories.mutate({
              name: String(f.get("name")),
              direction: category?.direction ?? direction,
              parentId: category
                ? category.parentId
                : String(f.get("parentId") ?? "") || null,
              isActive: f.get("active") === "on",
            });
          }}
        >
          <Field label="Nome">
            <Input
              required
              name="name"
              maxLength={120}
              defaultValue={category?.name}
            />
          </Field>
          <Field label="Tipo">
            <NativeSelect
              value={category?.direction ?? direction}
              disabled={Boolean(category)}
              onChange={(e) => setDirection(e.target.value as typeof direction)}
            >
              <option value="payable">Contas a pagar</option>
              <option value="receivable">Contas a receber</option>
            </NativeSelect>
          </Field>
          <Field label="Categoria principal">
            <NativeSelect
              key={category?.id ?? direction}
              name="parentId"
              defaultValue={category?.parentId ?? ""}
              disabled={Boolean(category)}
            >
              <option value="">Categoria principal</option>
              {metadata.categories
                .filter(
                  (c) =>
                    !c.parentId &&
                    c.direction === (category?.direction ?? direction) &&
                    c.isActive &&
                    c.id !== category?.id,
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={category?.isActive ?? true}
            />
            Ativa
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={categories.isPending}>
              {category ? "Atualizar" : "Cadastrar categoria"}
            </Button>
            {category && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCategory(null);
                  setCategoryKey((k) => k + 1);
                }}
              >
                Cancelar edição
              </Button>
            )}
          </div>
        </form>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {metadata.categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 border-t py-2 text-sm"
            >
              <span>
                {c.parentId
                  ? `${metadata.categories.find((p) => p.id === c.parentId)?.name} / `
                  : ""}
                {c.name}
                <small className="ml-2 text-muted-foreground">
                  {c.direction === "payable" ? "A pagar" : "A receber"}
                  {c.isActive ? "" : " · inativa"}
                </small>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCategory(c);
                  setCategoryKey((k) => k + 1);
                }}
              >
                Editar
              </Button>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">Favorecidos e colaboradores</h2>
        <form
          key={partyKey}
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            parties.mutate({
              name: String(f.get("name")),
              laborType: (String(f.get("laborType")) ||
                null) as PartyPayload["laborType"],
              isActive: f.get("active") === "on",
            });
          }}
        >
          <Field label="Nome">
            <Input
              required
              name="name"
              maxLength={180}
              defaultValue={party?.name}
            />
          </Field>
          <Field label="Vínculo">
            <NativeSelect
              name="laborType"
              defaultValue={party?.laborType ?? ""}
            >
              <option value="">Fornecedor ou favorecido</option>
              <option value="pj">Colaborador PJ</option>
              <option value="freelance">Freelance</option>
              <option value="clt">Colaborador CLT</option>
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={party?.isActive ?? true}
            />
            Ativo
          </label>
          <p className="text-xs text-muted-foreground">
            O vínculo é preservado nos lançamentos anteriores. Este cadastro não
            calcula folha de pagamento.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={parties.isPending}>
              {party ? "Atualizar" : "Cadastrar favorecido"}
            </Button>
            {party && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setParty(null);
                  setPartyKey((k) => k + 1);
                }}
              >
                Cancelar edição
              </Button>
            )}
          </div>
        </form>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {metadata.parties.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border-t py-2 text-sm"
            >
              <span>
                {p.name}
                <small className="ml-2 text-muted-foreground">
                  {p.laborType?.toUpperCase() ?? "Fornecedor"}
                  {p.isActive ? "" : " · inativo"}
                </small>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setParty(p);
                  setPartyKey((k) => k + 1);
                }}
              >
                Editar
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
