import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FilterPanel } from "@/components/ui/filter-panel";
import { StatCard } from "@/components/ui/stat-card";

describe("FilterPanel", () => {
  beforeEach(() => localStorage.clear());

  it("conta só filtros ativos e lembra o estado aberto", () => {
    const values = {
      from: "2026-10-01",
      to: "2026-10-29",
      status: "open",
      search: "",
    };
    const first = render(
      <FilterPanel values={values}>
        <input aria-label="campo" />
      </FilterPanel>,
    );
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("01/10/2026 a 29/10/2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    expect(localStorage.getItem("nortys:ledger-filters-open")).toBe("1");
    first.unmount();
    render(
      <FilterPanel values={values}>
        <input aria-label="campo" />
      </FilterPanel>,
    );
    expect(
      screen
        .getByRole("button", { name: /Filtros/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
});

describe("StatCard", () => {
  it("renderiza rótulo, valor e ícone automático", () => {
    const { container } = render(
      <StatCard label="Receita" value="R$ 10" trend="+5%" />,
    );
    expect(screen.getByText("R$ 10")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
