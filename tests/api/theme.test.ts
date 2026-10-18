import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  isSafeColor,
  isSafeRadius,
  themeCss,
  themePackageSchema,
  toTokens,
} from "../../apps/api/src/theme/model";

const parse = (input: unknown) => v.safeParse(themePackageSchema, input);
const base = { schema: 1, name: "Qerza" };

describe("Pacote de tema", () => {
  it("aceita cores, raio e fontes válidos e gera as variáveis", () => {
    const r = parse({
      ...base,
      radius: "0.5rem",
      fonts: { sans: "Roboto, ui-sans-serif, sans-serif" },
      light: { primary: "#8743DF", primaryForeground: "#fff" },
      dark: { primary: "rgba(135, 67, 223, 0.9)", cardForeground: "#eee" },
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    const css = themeCss(toTokens(r.output));
    expect(css).toContain("--radius:0.5rem;");
    expect(css).toContain("--font-sans:Roboto, ui-sans-serif, sans-serif;");
    expect(css).toContain(":root:not(.dark){");
    expect(css).toContain("--primary:#8743DF;--primary-foreground:#fff;");
    expect(css).toContain(".dark{");
    expect(css).toContain("--primary:rgba(135, 67, 223, 0.9);");
    expect(css).toContain("--card-foreground:#eee;");
  });
  it("recusa valores que poderiam injetar CSS", () => {
    for (const bad of [
      "red; } body { display:none",
      "url(https://evil.test/x.png)",
      "#fff; --x:1",
      "expression(alert(1))",
      "var(--x)",
      "#ggg",
    ])
      expect(isSafeColor(bad)).toBe(false);
    expect(
      parse({ ...base, light: { primary: "#fff;}body{x:y" } }).success,
    ).toBe(false);
    expect(parse({ ...base, fonts: { sans: "Roboto; } a{" } }).success).toBe(
      false,
    );
    expect(parse({ ...base, fonts: { heading: "x\\\\y" } }).success).toBe(
      false,
    );
  });
  it("valida raio com limite", () => {
    expect(isSafeRadius("0.5rem")).toBe(true);
    expect(isSafeRadius("8px")).toBe(true);
    expect(isSafeRadius("0")).toBe(false);
    expect(isSafeRadius("40px")).toBe(false);
    expect(isSafeRadius("5rem")).toBe(false);
    expect(isSafeRadius("1em")).toBe(false);
  });
  it("recusa chave de cor desconhecida, versão errada e nome vazio", () => {
    expect(parse({ ...base, light: { primaryy: "#fff" } }).success).toBe(false);
    expect(parse({ schema: 2, name: "X" }).success).toBe(false);
    expect(parse({ schema: 1, name: "  " }).success).toBe(false);
  });
  it("ignora campos extras fora das cores (como logo ou scripts)", () => {
    const r = parse({ ...base, logo: "data:image/svg+xml,<svg/>", js: "x()" });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.output)).not.toContain("js");
  });
  it("não emite chaves ou valores fora da lista, mesmo vindos do banco", () => {
    const css = themeCss({
      radius: "9rem",
      fontSans: "a;b",
      fontHeading: null,
      light: { primary: "#fff", evil: "#000", border: "red;}" },
      dark: {},
    });
    expect(css).toBe(":root{}:root:not(.dark){--primary:#fff;}.dark{}");
  });
});
