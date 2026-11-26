import { DEFAULT_ROLE_NAMES, statement } from "@kaneo/permissions";
import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { auth } from "../auth";
import db, { schema } from "../database";

type Vars = { Variables: { userId: string; user?: { role?: string | null } } };

const MAX_ROLES_PER_WORKSPACE = 25;
const RESERVED_ROLE_NAMES = new Set<string>(["owner", ...DEFAULT_ROLE_NAMES]);

const permissionSchema = v.record(v.string(), v.array(v.string()));
const params = validator(
  "param",
  v.object({ workspaceId: v.string(), role: v.optional(v.string()) }),
);

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Workspaces"],
    responses: { 200: { description: "Função salva" } },
  });

/**
 * O Better Auth só deixa quem edita uma função conceder permissões que o
 * próprio papel dele no workspace já tem. Quem é superadmin da plataforma ou
 * proprietário do workspace pode conceder qualquer permissão, então esses dois
 * gravam direto; os demais continuam passando pela regra original.
 */
async function canManageAnyRole(
  c: { get: (key: "userId") => string },
  user: { role?: string | null } | undefined,
  workspaceId: string,
) {
  if (user?.role === "superadmin") return true;
  const [member] = await db
    .select({ role: schema.workspaceUserTable.role })
    .from(schema.workspaceUserTable)
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        eq(schema.workspaceUserTable.userId, c.get("userId")),
      ),
    )
    .limit(1);
  return member?.role === "owner";
}

function validatePermission(permission: Record<string, string[]>) {
  const known = statement as Record<string, readonly string[]>;
  for (const [resource, actions] of Object.entries(permission)) {
    const allowed = known[resource];
    if (!allowed)
      throw new HTTPException(400, {
        message: `Recurso de permissão inválido: ${resource}.`,
      });
    for (const action of actions) {
      if (!allowed.includes(action))
        throw new HTTPException(400, {
          message: `Ação inválida em ${resource}: ${action}.`,
        });
    }
  }
}

async function viaBetterAuth<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Não foi possível salvar a função.";
    const status =
      error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : 400;
    throw new HTTPException(status === 403 ? 403 : 400, { message });
  }
}

export const workspaceRoles = new Hono<Vars>()
  .put(
    "/:workspaceId/roles/:role",
    doc(
      "updateWorkspaceRolePermissions",
      "Atualizar as permissões de uma função",
    ),
    params,
    validator("json", v.object({ permission: permissionSchema })),
    async (c) => {
      const { workspaceId, role } = c.req.valid("param");
      const { permission } = c.req.valid("json");
      if (!role) throw new HTTPException(400, { message: "Função inválida." });
      if (!Object.values(permission).some((actions) => actions.length > 0))
        throw new HTTPException(400, {
          message: "Marque ao menos uma permissão.",
        });
      validatePermission(permission);

      if (!(await canManageAnyRole(c, c.get("user"), workspaceId))) {
        return c.json(
          await viaBetterAuth(() =>
            auth.api.updateOrgRole({
              headers: c.req.raw.headers,
              body: {
                organizationId: workspaceId,
                roleName: role,
                data: { permission },
              },
            }),
          ),
        );
      }

      const updated = await db
        .update(schema.workspaceRoleTable)
        .set({ permission: JSON.stringify(permission) })
        .where(
          and(
            eq(schema.workspaceRoleTable.workspaceId, workspaceId),
            eq(schema.workspaceRoleTable.role, role),
          ),
        )
        .returning({ id: schema.workspaceRoleTable.id });
      if (updated.length === 0)
        throw new HTTPException(404, { message: "Função não encontrada." });
      return c.json({ success: true });
    },
  )
  .post(
    "/:workspaceId/roles",
    doc("createWorkspaceRole", "Criar uma função personalizada"),
    params,
    validator(
      "json",
      v.object({
        role: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
        permission: permissionSchema,
      }),
    ),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const { permission } = c.req.valid("json");
      const role = c.req.valid("json").role.toLowerCase();
      validatePermission(permission);

      if (!(await canManageAnyRole(c, c.get("user"), workspaceId))) {
        return c.json(
          await viaBetterAuth(() =>
            auth.api.createOrgRole({
              headers: c.req.raw.headers,
              body: { organizationId: workspaceId, role, permission },
            }),
          ),
        );
      }

      if (RESERVED_ROLE_NAMES.has(role))
        throw new HTTPException(400, {
          message: "Este nome é reservado para uma função padrão.",
        });
      const [counted] = await db
        .select({ total: count() })
        .from(schema.workspaceRoleTable)
        .where(eq(schema.workspaceRoleTable.workspaceId, workspaceId));
      if ((counted?.total ?? 0) >= MAX_ROLES_PER_WORKSPACE)
        throw new HTTPException(400, {
          message: "O workspace atingiu o limite de funções.",
        });
      const [taken] = await db
        .select({ id: schema.workspaceRoleTable.id })
        .from(schema.workspaceRoleTable)
        .where(
          and(
            eq(schema.workspaceRoleTable.workspaceId, workspaceId),
            eq(schema.workspaceRoleTable.role, role),
          ),
        )
        .limit(1);
      if (taken)
        throw new HTTPException(400, {
          message: "Já existe uma função com este nome.",
        });
      await db.insert(schema.workspaceRoleTable).values({
        workspaceId,
        role,
        permission: JSON.stringify(permission),
      });
      return c.json({ success: true });
    },
  );
