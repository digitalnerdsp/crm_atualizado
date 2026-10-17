import { describe, expect, it } from "vitest";
import { ASSIGNABLE_DEFAULT_ROLES, buildRoleOptions } from "./workspace-roles";

describe("buildRoleOptions", () => {
  it("offers the commercial roles, which the old fixed list left out", () => {
    const values = buildRoleOptions([]).map((option) => option.value);
    expect(values).toEqual([...ASSIGNABLE_DEFAULT_ROLES]);
    expect(values).toContain("sales");
    expect(values).toContain("sales_manager");
  });

  it("does not repeat the seeded roles the API returns alongside custom ones", () => {
    const options = buildRoleOptions([
      { role: "sales" },
      { role: "member" },
      { role: "owner" },
      { role: "financeiro" },
      { role: "financeiro" },
    ]);

    expect(options.filter((option) => option.value === "sales")).toHaveLength(
      1,
    );
    expect(options.filter((option) => option.value === "member")).toHaveLength(
      1,
    );
    // Owner não é atribuível aqui: transferir propriedade é outro fluxo.
    expect(options.some((option) => option.value === "owner")).toBe(false);
    expect(options.filter((option) => option.value === "financeiro")).toEqual([
      { value: "financeiro", isDefault: false },
    ]);
  });

  it("puts the broadest role first, so the list reads as a ladder", () => {
    const values = buildRoleOptions([]).map((option) => option.value);
    expect(values.indexOf("admin")).toBeLessThan(values.indexOf("sales"));
    expect(values.indexOf("sales")).toBeLessThan(values.indexOf("viewer"));
  });
});
