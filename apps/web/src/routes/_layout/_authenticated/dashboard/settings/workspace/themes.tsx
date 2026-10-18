import { createFileRoute } from "@tanstack/react-router";
import { Check, Download, Eye, Palette, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { qerzaTheme, themeTemplate } from "@/constants/theme-presets";
import {
  useThemeMutations,
  useWorkspaceThemes,
} from "@/hooks/queries/theme/use-workspace-theme";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { useThemePreviewStore } from "@/store/theme-preview";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/themes",
)({
  component: RouteComponent,
});

const MAX_BYTES = 20_000;
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Não foi possível concluir a ação.";

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function RouteComponent() {
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id;
  const { canManageWorkspace } = useWorkspacePermission();
  const canManage = canManageWorkspace();
  const { data, isLoading } = useWorkspaceThemes(
    canManage ? workspaceId : undefined,
  );
  const m = useThemeMutations(workspaceId ?? "");
  const preview = useThemePreviewStore();
  const input = useRef<HTMLInputElement>(null);
  const themes = data?.themes ?? [];
  const hasActive = themes.some((t) => t.isActive);

  if (!canManage)
    return (
      <p className="text-sm text-muted-foreground">
        Somente quem gerencia o workspace pode configurar temas.
      </p>
    );

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES)
      return toast.error("Arquivo grande demais. O limite é de 20 KB.");
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return toast.error("O arquivo não é um JSON válido.");
    }
    await run(
      () => m.create.mutateAsync(json as Parameters<typeof m.create.mutate>[0]),
      "Tema enviado. Pré-visualize antes de ativar.",
    );
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Temas" />
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-base font-medium">
          <Palette className="size-4" /> Temas do workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          O tema ativo vale para todos os usuários deste workspace: cores, raio
          das bordas, fonte e, quando o tema pedir, o formato da tela (menu,
          cabeçalho, cards e tabelas). O visual padrão do sistema nunca é
          apagado e pode ser restaurado a qualquer momento. Cada usuário
          continua escolhendo entre claro e escuro.
        </p>
      </header>

      {preview.css && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
          <span>Pré-visualizando “{preview.name}”. Nada foi salvo.</span>
          <Button size="sm" variant="outline" onClick={preview.stop}>
            Sair da pré-visualização
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button onClick={() => input.current?.click()}>
          <Upload className="size-4" /> Enviar tema (.json)
        </Button>
        <Button
          variant="outline"
          disabled={themes.some((t) => t.name === qerzaTheme.name)}
          onClick={() =>
            run(
              () => m.create.mutateAsync(qerzaTheme),
              "Tema Qerza adicionado.",
            )
          }
        >
          Adicionar tema Qerza
        </Button>
        <Button
          variant="outline"
          onClick={() => download("modelo-de-tema.json", themeTemplate)}
        >
          <Download className="size-4" /> Baixar modelo
        </Button>
      </div>

      <ul className="space-y-2">
        <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">
              Padrão do sistema{" "}
              {!hasActive && <Badge variant="outline">Em uso</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">
              Aparência original, sempre disponível.
            </p>
          </div>
          {hasActive && (
            <Button
              size="sm"
              variant="outline"
              disabled={m.reset.isPending}
              onClick={() =>
                run(() => m.reset.mutateAsync(), "Aparência padrão restaurada.")
              }
            >
              <Check className="size-4" /> Usar padrão
            </Button>
          )}
        </li>
        {isLoading && (
          <li className="text-sm text-muted-foreground">Carregando…</li>
        )}
        {themes.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t.name} {t.isActive && <Badge variant="outline">Em uso</Badge>}{" "}
                {t.layout === "qerza" && (
                  <Badge variant="info">Layout Qerza</Badge>
                )}
              </p>
              {t.description && (
                <p className="text-xs text-muted-foreground">{t.description}</p>
              )}
              <div className="mt-2 flex gap-1" aria-hidden="true">
                {[t.tokens.light.primary, t.tokens.dark.primary]
                  .filter(Boolean)
                  .map((c) => (
                    <span
                      key={c}
                      className="size-4 rounded-full border"
                      style={{ background: c }}
                    />
                  ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => preview.start(t.name, t.css, t.layout)}
              >
                <Eye className="size-4" /> Pré-visualizar
              </Button>
              {t.name === qerzaTheme.name && t.layout !== "qerza" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={m.update.isPending}
                  onClick={() =>
                    run(
                      () =>
                        m.update.mutateAsync({ id: t.id, json: qerzaTheme }),
                      "Tema Qerza atualizado com o novo formato.",
                    )
                  }
                >
                  Atualizar para o formato Qerza
                </Button>
              )}
              {!t.isActive && (
                <Button
                  size="sm"
                  disabled={m.activate.isPending}
                  onClick={() =>
                    run(async () => {
                      await m.activate.mutateAsync(t.id);
                      preview.stop();
                    }, "Tema ativado para o workspace.")
                  }
                >
                  <Check className="size-4" /> Ativar
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remover ${t.name}`}
                disabled={m.remove.isPending}
                onClick={() => {
                  if (window.confirm(`Remover o tema “${t.name}”?`))
                    run(() => m.remove.mutateAsync(t.id), "Tema removido.");
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Limite de {data?.max ?? 20} temas. O arquivo é um JSON com{" "}
        <code>schema</code>, <code>name</code> e, opcionalmente,{" "}
        <code>layout</code> (<code>"default"</code> ou <code>"qerza"</code>),{" "}
        <code>radius</code>, <code>fonts</code>, <code>light</code> e{" "}
        <code>dark</code>. Use “Baixar modelo” como ponto de partida. Arquivos
        de fonte e CSS próprio não são aceitos.
      </p>
    </div>
  );
}
