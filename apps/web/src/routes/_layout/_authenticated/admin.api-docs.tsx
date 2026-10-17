import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  Braces,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileJson,
  LockKeyhole,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import Layout from "@/components/common/layout";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAdminOpenApiSpec,
  type OpenApiDocument,
  type OpenApiOperation,
  type OpenApiSchema,
} from "@/fetchers/admin/get-admin-openapi";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
type Endpoint = {
  method: HttpMethod;
  path: string;
  operation: OpenApiOperation;
  tag: string;
};

const methodStyles: Record<HttpMethod, string> = {
  get: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  post: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  put: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  patch:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  delete: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

export const Route = createFileRoute("/_layout/_authenticated/admin/api-docs")({
  beforeLoad: async () => {
    try {
      return { apiSpec: await getAdminOpenApiSpec() };
    } catch {
      throw redirect({ to: "/admin" });
    }
  },
  component: AdminApiDocsPage,
});

function schemaLabel(schema?: OpenApiSchema): string {
  if (!schema) return "sem schema";
  if (schema.$ref) {
    const parts = schema.$ref.split("/");
    return parts[parts.length - 1] || schema.$ref;
  }
  if (schema.enum) return schema.enum.map(String).join(" | ");
  if (schema.type === "array") return `array<${schemaLabel(schema.items)}>`;
  if (schema.oneOf) return schema.oneOf.map(schemaLabel).join(" | ");
  if (schema.anyOf) return schema.anyOf.map(schemaLabel).join(" | ");
  if (schema.allOf) return schema.allOf.map(schemaLabel).join(" & ");
  return [schema.type ?? "object", schema.format].filter(Boolean).join(":");
}

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <Badge
      className={cn(
        "w-16 shrink-0 justify-center rounded-md border font-mono font-semibold text-[11px] uppercase",
        methodStyles[method],
      )}
      variant="outline"
    >
      {method}
    </Badge>
  );
}

function SchemaBlock({
  title,
  schema,
}: {
  title: string;
  schema?: OpenApiSchema;
}) {
  if (!schema) return null;

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="font-medium text-muted-foreground text-xs">{title}</div>
      <pre className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
        {JSON.stringify(schema, null, 2)}
      </pre>
    </div>
  );
}

function EndpointDetails({
  endpoint,
  serverUrl,
}: {
  endpoint: Endpoint;
  serverUrl: string;
}) {
  const { operation } = endpoint;
  const requestContent = operation.requestBody?.content;
  const requestEntry = requestContent
    ? Object.entries(requestContent)[0]
    : undefined;
  const [copied, setCopied] = useState(false);

  async function copyUrl(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(`${serverUrl}${endpoint.path}`);
    setCopied(true);
    toast.success("URL copiada");
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <details className="group border-border border-b last:border-b-0">
      <summary className="grid min-h-14 cursor-pointer list-none grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 hover:bg-muted/30">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        <MethodBadge method={endpoint.method} />
        <div className="min-w-0">
          <div className="truncate font-mono text-sm">{endpoint.path}</div>
          <div className="truncate text-muted-foreground text-xs">
            {operation.summary ||
              operation.description ||
              operation.operationId}
          </div>
        </div>
        <Button
          aria-label="Copiar URL"
          size="icon-sm"
          title="Copiar URL"
          variant="ghost"
          onClick={copyUrl}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </summary>

      <div className="space-y-5 border-border border-t bg-background px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{endpoint.tag}</Badge>
          {operation.operationId && (
            <code className="text-muted-foreground text-xs">
              {operation.operationId}
            </code>
          )}
          {(operation.security?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
              <LockKeyhole className="size-3.5" />
              Bearer
            </span>
          )}
        </div>

        {operation.description && (
          <p className="max-w-4xl text-sm leading-relaxed">
            {operation.description}
          </p>
        )}

        {(operation.parameters?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Parâmetros</h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Local</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {operation.parameters?.map((parameter) => (
                    <tr
                      className="border-border border-t"
                      key={`${parameter.in}-${parameter.name}`}
                    >
                      <td className="px-3 py-2 font-mono">
                        {parameter.name}
                        {parameter.required && (
                          <span className="ml-1 text-red-500">*</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{parameter.in}</td>
                      <td className="px-3 py-2 font-mono">
                        {schemaLabel(parameter.schema)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {parameter.description || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {requestEntry && (
          <SchemaBlock
            title={`Corpo da requisição · ${requestEntry[0]}${
              operation.requestBody?.required ? " · obrigatório" : ""
            }`}
            schema={requestEntry[1].schema}
          />
        )}

        {operation.responses && (
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Respostas</h3>
            <div className="divide-y rounded-md border">
              {Object.entries(operation.responses).map(([status, response]) => {
                const responseSchema = response.content
                  ? Object.values(response.content)[0]?.schema
                  : undefined;
                return (
                  <div
                    className="grid gap-2 px-3 py-2 md:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)]"
                    key={status}
                  >
                    <code className="font-semibold text-xs">{status}</code>
                    <span className="text-xs">
                      {response.description || "Resposta"}
                    </span>
                    <code className="truncate text-muted-foreground text-xs">
                      {schemaLabel(responseSchema)}
                    </code>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function AdminApiDocsPage() {
  const { apiSpec } = Route.useRouteContext();
  const spec = apiSpec as OpenApiDocument;
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<HttpMethod | "all">("all");
  const [tag, setTag] = useState("all");

  const endpoints = useMemo<Endpoint[]>(
    () =>
      Object.entries(spec.paths).flatMap(([path, pathItem]) =>
        HTTP_METHODS.flatMap((httpMethod) => {
          const operation = pathItem[httpMethod];
          if (!operation) return [];
          return [
            {
              method: httpMethod,
              path,
              operation,
              tag: operation.tags?.[0] || "Outros",
            },
          ];
        }),
      ),
    [spec.paths],
  );

  const tags = useMemo(
    () => Array.from(new Set(endpoints.map((endpoint) => endpoint.tag))).sort(),
    [endpoints],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = endpoints.filter((endpoint) => {
    if (method !== "all" && endpoint.method !== method) return false;
    if (tag !== "all" && endpoint.tag !== tag) return false;
    if (!normalizedQuery) return true;
    return [
      endpoint.path,
      endpoint.operation.summary,
      endpoint.operation.description,
      endpoint.operation.operationId,
      endpoint.tag,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedQuery));
  });
  const grouped = tags
    .map((groupTag) => ({
      tag: groupTag,
      endpoints: filtered.filter((endpoint) => endpoint.tag === groupTag),
    }))
    .filter((group) => group.endpoints.length > 0);
  const serverUrl = spec.servers?.[0]?.url?.replace(/\/$/, "") || "/api";
  const schemaCount = Object.keys(spec.components?.schemas ?? {}).length;

  function downloadSpec() {
    const blob = new Blob([JSON.stringify(spec, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "nortys-openapi.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout>
      <PageTitle title="Documentação da API" />
      <Layout.Header className="h-12 items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Braces className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate font-semibold text-sm">
            Documentação da API
          </h1>
          <Badge className="hidden sm:inline-flex" variant="outline">
            OpenAPI {spec.openapi}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Baixar OpenAPI"
            size="icon-sm"
            title="Baixar OpenAPI"
            variant="outline"
            onClick={downloadSpec}
          >
            <Download />
          </Button>
          <Button size="sm" variant="outline" render={<Link to="/admin" />}>
            <ArrowLeft />
            Administração
          </Button>
        </div>
      </Layout.Header>

      <Layout.Content className="overflow-auto bg-sidebar">
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
          <section className="grid overflow-hidden rounded-lg border bg-background sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-b p-4 sm:border-r lg:border-b-0">
              <div className="text-muted-foreground text-xs">API</div>
              <div className="mt-1 font-semibold text-sm">
                {spec.info.title}
              </div>
              <div className="text-muted-foreground text-xs">
                versão {spec.info.version}
              </div>
            </div>
            <div className="border-b p-4 lg:border-r lg:border-b-0">
              <div className="text-muted-foreground text-xs">Endpoints</div>
              <div className="mt-1 font-semibold text-2xl">
                {endpoints.length}
              </div>
            </div>
            <div className="border-b p-4 sm:border-r sm:border-b-0">
              <div className="text-muted-foreground text-xs">Grupos</div>
              <div className="mt-1 font-semibold text-2xl">{tags.length}</div>
            </div>
            <div className="p-4">
              <div className="text-muted-foreground text-xs">Schemas</div>
              <div className="mt-1 font-semibold text-2xl">{schemaCount}</div>
            </div>
          </section>

          <section className="grid min-h-[36rem] overflow-hidden rounded-lg border bg-background lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="hidden border-r lg:block">
              <div className="border-b p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <FileJson className="size-3.5" />
                  {serverUrl}
                </div>
              </div>
              <nav className="max-h-[calc(100vh-16rem)] overflow-auto p-2">
                <button
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted",
                    tag === "all" && "bg-muted font-medium",
                  )}
                  type="button"
                  onClick={() => setTag("all")}
                >
                  Todos
                  <span className="text-muted-foreground text-xs">
                    {endpoints.length}
                  </span>
                </button>
                {tags.map((item) => (
                  <button
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted",
                      tag === item && "bg-muted font-medium",
                    )}
                    key={item}
                    type="button"
                    onClick={() => setTag(item)}
                  >
                    <span className="truncate">{item}</span>
                    <span className="text-muted-foreground text-xs">
                      {
                        endpoints.filter((endpoint) => endpoint.tag === item)
                          .length
                      }
                    </span>
                  </button>
                ))}
              </nav>
            </aside>

            <div className="min-w-0">
              <div className="space-y-3 border-b p-3">
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar rota, operação ou descrição"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="xs"
                    variant={method === "all" ? "default" : "outline"}
                    onClick={() => setMethod("all")}
                  >
                    Todos
                  </Button>
                  {HTTP_METHODS.map((item) => (
                    <Button
                      className="font-mono uppercase"
                      key={item}
                      size="xs"
                      variant={method === item ? "default" : "outline"}
                      onClick={() => setMethod(item)}
                    >
                      {item}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                {grouped.map((group) => (
                  <section key={group.tag}>
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-muted/95 px-4 py-2 backdrop-blur">
                      <h2 className="font-semibold text-xs uppercase">
                        {group.tag}
                      </h2>
                      <span className="text-muted-foreground text-xs">
                        {group.endpoints.length}
                      </span>
                    </div>
                    {group.endpoints.map((endpoint) => (
                      <EndpointDetails
                        endpoint={endpoint}
                        key={`${endpoint.method}-${endpoint.path}`}
                        serverUrl={serverUrl}
                      />
                    ))}
                  </section>
                ))}

                {grouped.length === 0 && (
                  <div className="flex min-h-48 items-center justify-center text-muted-foreground text-sm">
                    Nenhum endpoint encontrado.
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      </Layout.Content>
    </Layout>
  );
}
