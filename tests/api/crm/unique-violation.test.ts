import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "../../../apps/api/src/crm/shared/unique-violation";

/** Erro do `pg` como ele chega quando o Drizzle não embrulha. */
function pgError(constraint: string) {
  return Object.assign(new Error("duplicate key"), {
    code: "23505",
    constraint,
  });
}

describe("isUniqueViolation", () => {
  it("recognises the bare pg error", () => {
    expect(isUniqueViolation(pgError("crm_source_workspace_name_unique"))).toBe(
      true,
    );
  });

  it("recognises it through the DrizzleQueryError wrapper", () => {
    // Sem descer a cadeia de causas, uma origem duplicada devolvia 500 no
    // lugar de 409 — foi assim que o bug apareceu.
    const wrapped = Object.assign(new Error("Failed query"), {
      cause: pgError("crm_source_workspace_name_unique"),
    });

    expect(isUniqueViolation(wrapped)).toBe(true);
    expect(isUniqueViolation(wrapped, "crm_source_workspace_name_unique")).toBe(
      true,
    );
    expect(isUniqueViolation(wrapped, "outra_constraint")).toBe(false);
  });

  it("says no to anything that is not a unique violation", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("boom")).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(
      isUniqueViolation(Object.assign(new Error("fk"), { code: "23503" })),
    ).toBe(false);
  });

  it("stops instead of looping on a self-referencing cause", () => {
    const looping: { cause?: unknown } = {};
    looping.cause = looping;
    expect(isUniqueViolation(looping)).toBe(false);
  });
});
