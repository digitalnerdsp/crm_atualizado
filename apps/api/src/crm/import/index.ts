import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { IMPORT_FIELDS } from "./controllers/fields";
import { importRows } from "./controllers/import-rows";

/** Um lote por chamada. Acima disso a requisição fica grande e o navegador
 * perde a noção de progresso; abaixo, são chamadas demais. */
const MAX_ROWS_PER_BATCH = 500;

const entitySchema = v.picklist(["company", "contact", "deal"]);

const batchSchema = v.object({
  workspaceId: v.string(),
  entity: entitySchema,
  policy: v.optional(v.picklist(["skip", "update", "create"])),
  pipelineId: v.optional(v.string()),
  /** Linha da planilha em que o lote começa, para o relatório apontar onde
   * corrigir. */
  firstLine: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  rows: v.pipe(
    v.array(v.record(v.string(), v.optional(v.string()))),
    v.maxLength(MAX_ROWS_PER_BATCH),
  ),
});

/**
 * Importação da base atual.
 *
 * A tela mapeia coluna → campo e manda as linhas já com as chaves canônicas,
 * em lotes: o mapeamento é decisão de quem conhece a planilha, e a validação
 * é de quem grava.
 *
 * Importar é escrever em massa no cadastro de clientes, então pede as mesmas
 * permissões de criar empresa e contato.
 */
const importRoutes = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/fields",
    describeRoute({
      operationId: "listCrmImportFields",
      tags: ["CRM"],
      description: "The columns a spreadsheet can map to, per entity",
      responses: {
        200: {
          description: "Importable fields",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmCompany: ["read"] }),
    (c) => c.json(IMPORT_FIELDS),
  )
  .post(
    "/preview",
    describeRoute({
      operationId: "previewCrmImport",
      tags: ["CRM"],
      description:
        "Says what each row would do — created, updated, skipped or rejected — without writing anything.",
      responses: {
        200: {
          description: "Per-row outcome",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("json", batchSchema),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmCompany: ["create"] }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json({
        rows: await importRows({
          workspaceId: c.get("workspaceId"),
          ownerUserId: c.get("userId"),
          entity: body.entity,
          rows: body.rows,
          policy: body.policy ?? "skip",
          dryRun: true,
          firstLine: body.firstLine ?? 2,
          pipelineId: body.pipelineId,
        }),
      });
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "runCrmImport",
      tags: ["CRM"],
      description:
        "Imports one batch. What lands, stays: a twenty-thousand-row file is not a single transaction.",
      responses: {
        200: {
          description: "Per-row outcome",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("json", batchSchema),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ crmCompany: ["create"] }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json({
        rows: await importRows({
          workspaceId: c.get("workspaceId"),
          ownerUserId: c.get("userId"),
          entity: body.entity,
          rows: body.rows,
          policy: body.policy ?? "skip",
          dryRun: false,
          firstLine: body.firstLine ?? 2,
          pipelineId: body.pipelineId,
        }),
      });
    },
  );

export default importRoutes;
