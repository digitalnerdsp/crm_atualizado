import { and, asc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import {
  MAX_THEMES_PER_WORKSPACE,
  type ThemePackage,
  themeCss,
  toTokens,
} from "./model";

type Scope = { workspaceId: string; userId: string };
function fail(status: 400 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}
const t = schema.workspaceThemeTable;
async function audit(
  tx: Pick<typeof db, "insert">,
  s: Scope,
  entityId: string,
  action: string,
  after: unknown,
) {
  await tx.insert(schema.auditLogTable).values({
    workspaceId: s.workspaceId,
    actorUserId: s.userId,
    entityType: "workspace_theme",
    entityId,
    action: `workspace.theme.${action}`,
    summary: `Tema do workspace: ${action}`,
    before: null,
    after,
  });
}
const view = (row: typeof t.$inferSelect) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isActive: row.isActive,
  tokens: row.tokens,
  css: themeCss(row.tokens),
  createdAt: row.createdAt,
});

/** Tema em uso no workspace, ou null para a aparência padrão. */
export async function activeTheme(workspaceId: string) {
  const [row] = await db
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.isActive, true)));
  return row ? { id: row.id, name: row.name, css: themeCss(row.tokens) } : null;
}
export async function listThemes(workspaceId: string) {
  const rows = await db
    .select()
    .from(t)
    .where(eq(t.workspaceId, workspaceId))
    .orderBy(asc(t.name));
  return { themes: rows.map(view), max: MAX_THEMES_PER_WORKSPACE };
}
export async function createTheme(s: Scope, pkg: ThemePackage) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`theme:${s.workspaceId}`},0))`,
    );
    const existing = await tx
      .select({ id: t.id, name: t.name })
      .from(t)
      .where(eq(t.workspaceId, s.workspaceId));
    if (existing.length >= MAX_THEMES_PER_WORKSPACE)
      fail(
        400,
        `Limite de ${MAX_THEMES_PER_WORKSPACE} temas. Remova um para enviar outro.`,
      );
    if (existing.some((e) => e.name.toLowerCase() === pkg.name.toLowerCase()))
      fail(409, "Já existe um tema com esse nome.");
    const [row] = await tx
      .insert(t)
      .values({
        workspaceId: s.workspaceId,
        name: pkg.name,
        description: pkg.description ?? "",
        tokens: toTokens(pkg),
        createdBy: s.userId,
      })
      .returning();
    if (!row) throw new Error("Falha ao salvar o tema");
    await audit(tx, s, row.id, "enviado", { name: row.name });
    return view(row);
  });
}
/** Ativa um tema (e desativa o anterior) ou volta ao padrão com `id` null. */
export async function setActiveTheme(s: Scope, id: string | null) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`theme:${s.workspaceId}`},0))`,
    );
    if (id) {
      const [row] = await tx
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.id, id), eq(t.workspaceId, s.workspaceId)));
      if (!row) fail(404, "Tema não encontrado.");
    }
    await tx
      .update(t)
      .set({ isActive: false })
      .where(and(eq(t.workspaceId, s.workspaceId), eq(t.isActive, true)));
    if (id)
      await tx
        .update(t)
        .set({ isActive: true })
        .where(and(eq(t.id, id), eq(t.workspaceId, s.workspaceId)));
    await audit(tx, s, id ?? s.workspaceId, id ? "ativado" : "padrao", {
      themeId: id,
    });
  });
}
export async function deleteTheme(s: Scope, id: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(t)
      .where(and(eq(t.id, id), eq(t.workspaceId, s.workspaceId)))
      .returning({ id: t.id, name: t.name });
    if (!row) fail(404, "Tema não encontrado.");
    await audit(tx, s, row.id, "removido", { name: row.name });
  });
}
