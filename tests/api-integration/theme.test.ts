import { randomUUID } from "node:crypto";
import { defaultRolePayloads } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import theme from "../../apps/api/src/theme";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

function appFor(userId: string) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/theme", theme);
  app.onError((e, c) =>
    e instanceof HTTPException
      ? c.json({ message: e.message }, e.status)
      : c.json({ message: String(e) }, 500),
  );
  return app;
}
async function seed(role: "admin" | "member" = "admin") {
  const m = await createWorkspaceMember({ role });
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId: m.workspace.id,
    role,
    permission: JSON.stringify(defaultRolePayloads[role]),
  });
  return { ...m, app: appFor(m.user.id), base: `/theme/${m.workspace.id}` };
}
type Seed = Awaited<ReturnType<typeof seed>>;
async function addMember(m: Seed, role: "member") {
  const id = `user-${randomUUID()}`;
  await db.insert(schema.userTable).values({
    id,
    email: `${id}@example.com`,
    emailVerified: true,
    name: "Membro",
  });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId: m.workspace.id,
    userId: id,
    role,
    joinedAt: new Date(),
  });
  if (
    !(
      await db
        .select()
        .from(schema.workspaceRoleTable)
        .where(eq(schema.workspaceRoleTable.workspaceId, m.workspace.id))
    ).some((r) => r.role === role)
  )
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: m.workspace.id,
      role,
      permission: JSON.stringify(defaultRolePayloads[role]),
    });
  return appFor(id);
}
const send = (
  app: ReturnType<typeof appFor>,
  path: string,
  method: string,
  body?: unknown,
) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const pkg = (name: string, extra: Record<string, unknown> = {}) => ({
  schema: 1,
  name,
  light: { primary: "#8743DF" },
  dark: { primary: "#a78bfa" },
  ...extra,
});

beforeEach(resetTestDatabase);

describe("Central de temas do workspace", () => {
  it("envia, ativa, troca e volta ao padrão, com um só tema ativo", async () => {
    const m = await seed();
    const a = await send(m.app, m.base, "POST", pkg("Roxo"));
    const b = await send(m.app, m.base, "POST", pkg("Azul", { radius: "8px" }));
    expect(a.status).toBe(201);
    const idA = ((await a.json()) as { id: string }).id;
    const idB = ((await b.json()) as { id: string }).id;
    const active = async () =>
      (await (await m.app.request(`${m.base}/active`)).json()) as {
        theme: { name: string; css: string } | null;
      };
    expect((await active()).theme).toBeNull();
    expect((await send(m.app, `${m.base}/${idA}/activate`, "PUT")).status).toBe(
      200,
    );
    const first = (await active()).theme;
    expect(first?.name).toBe("Roxo");
    expect(first?.css).toContain("--primary:#8743DF;");
    await send(m.app, `${m.base}/${idB}/activate`, "PUT");
    expect((await active()).theme?.name).toBe("Azul");
    const rows = await db.select().from(schema.workspaceThemeTable);
    expect(rows.filter((r) => r.isActive)).toHaveLength(1);
    await send(m.app, `${m.base}/default`, "PUT");
    expect((await active()).theme).toBeNull();
    const audits = await db.select().from(schema.auditLogTable);
    expect(audits.map((x) => x.action)).toEqual(
      expect.arrayContaining([
        "workspace.theme.enviado",
        "workspace.theme.ativado",
        "workspace.theme.padrao",
      ]),
    );
  });

  it("recusa pacote malicioso, nome repetido e excesso de temas", async () => {
    const m = await seed();
    const bad = await send(
      m.app,
      m.base,
      "POST",
      pkg("Mau", { light: { primary: "red;}body{display:none" } }),
    );
    expect(bad.status).toBe(400);
    expect(
      (
        await send(
          m.app,
          m.base,
          "POST",
          pkg("Fonte", { fonts: { sans: "a;}x{" } }),
        )
      ).status,
    ).toBe(400);
    expect((await send(m.app, m.base, "POST", pkg("Unico"))).status).toBe(201);
    expect((await send(m.app, m.base, "POST", pkg("unico"))).status).toBe(409);
    for (let i = 0; i < 19; i++)
      await send(m.app, m.base, "POST", pkg(`Tema ${i}`));
    expect((await send(m.app, m.base, "POST", pkg("Extra"))).status).toBe(400);
    expect(await db.select().from(schema.workspaceThemeTable)).toHaveLength(20);
  });

  it("membro comum só lê o tema ativo; não lista, envia, ativa nem remove", async () => {
    const m = await seed();
    const member = await addMember(m, "member");
    const created = await send(m.app, m.base, "POST", pkg("Roxo"));
    const id = ((await created.json()) as { id: string }).id;
    await send(m.app, `${m.base}/${id}/activate`, "PUT");
    const read = await member.request(`${m.base}/active`);
    expect(read.status).toBe(200);
    expect(
      ((await read.json()) as { theme: { name: string } }).theme.name,
    ).toBe("Roxo");
    expect((await member.request(m.base)).status).toBe(403);
    expect((await send(member, m.base, "POST", pkg("X"))).status).toBe(403);
    expect((await send(member, `${m.base}/${id}/activate`, "PUT")).status).toBe(
      403,
    );
    expect((await send(member, `${m.base}/default`, "PUT")).status).toBe(403);
    expect((await send(member, `${m.base}/${id}`, "DELETE")).status).toBe(403);
  });

  it("isola workspaces e remove o tema ativo voltando ao padrão", async () => {
    const a = await seed();
    const b = await seed();
    const created = await send(a.app, a.base, "POST", pkg("Roxo"));
    const id = ((await created.json()) as { id: string }).id;
    await send(a.app, `${a.base}/${id}/activate`, "PUT");
    expect((await send(b.app, `${b.base}/${id}/activate`, "PUT")).status).toBe(
      404,
    );
    expect((await send(b.app, `${b.base}/${id}`, "DELETE")).status).toBe(404);
    // Quem não é membro do outro workspace nem lê o tema ativo dele.
    expect((await b.app.request(`${a.base}/active`)).status).not.toBe(200);
    expect(
      (
        (await (await b.app.request(`${b.base}/active`)).json()) as {
          theme: unknown;
        }
      ).theme,
    ).toBeNull();
    expect((await send(a.app, `${a.base}/${id}`, "DELETE")).status).toBe(200);
    expect(
      (
        (await (await a.app.request(`${a.base}/active`)).json()) as {
          theme: unknown;
        }
      ).theme,
    ).toBeNull();
  });

  it("guarda o layout e substitui o pacote de um tema existente", async () => {
    const m = await seed();
    const created = await send(m.app, m.base, "POST", pkg("Qerza"));
    const id = ((await created.json()) as { id: string }).id;
    await send(m.app, `${m.base}/${id}/activate`, "PUT");
    const active = async () =>
      (await (await m.app.request(`${m.base}/active`)).json()) as {
        theme: { layout: string; css: string } | null;
      };
    expect((await active()).theme?.layout).toBe("default");

    const up = await send(
      m.app,
      `${m.base}/${id}`,
      "PUT",
      pkg("Qerza", { layout: "qerza", light: { primary: "#111111" } }),
    );
    expect(up.status).toBe(200);
    const now = (await active()).theme;
    expect(now?.layout).toBe("qerza");
    expect(now?.css).toContain("--primary:#111111;");
    const rows = await db.select().from(schema.workspaceThemeTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isActive).toBe(true);

    expect(
      (await send(m.app, `${m.base}/${id}`, "PUT", pkg("X", { layout: "x" })))
        .status,
    ).toBe(400);
    expect(
      (await send(m.app, `${m.base}/nao-existe`, "PUT", pkg("Y"))).status,
    ).toBe(404);
    await send(m.app, m.base, "POST", pkg("Outro"));
    expect(
      (await send(m.app, `${m.base}/${id}`, "PUT", pkg("outro"))).status,
    ).toBe(409);
    const member = await addMember(m, "member");
    expect(
      (await send(member, `${m.base}/${id}`, "PUT", pkg("Qerza"))).status,
    ).toBe(403);
  });
});
