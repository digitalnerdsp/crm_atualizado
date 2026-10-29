import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserFormPage } from "@/components/admin/user-form-page";

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock("@/hooks/mutations/admin/use-admin-user-mutations", () => ({
  useCreateAdminUser: () => ({ mutateAsync, isPending: false }),
  useUpdateAdminUser: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/hooks/queries/admin/use-admin-workspaces", () => ({
  useAdminWorkspaces: () => ({
    data: { workspaces: [{ id: "w1", name: "Digital Nerd" }] },
  }),
}));
vi.mock("@/hooks/queries/admin/use-admin-projects", () => ({
  useAdminProjects: () => ({
    data: {
      projects: [
        {
          id: "p1",
          name: "teste",
          workspaceId: "w1",
          workspaceName: "Digital Nerd",
        },
      ],
    },
  }),
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));

describe("UserFormPage", () => {
  it("mostra conta e acessos e cria o usuário", () => {
    render(<UserFormPage roles={["user", "admin"]} canManageRoles />);
    expect(screen.getByText("Conta")).toBeTruthy();
    expect(screen.getByText("Acessos")).toBeTruthy();
    expect(
      screen.getByText("Digital Nerd", { selector: "span.truncate" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Criar usuário" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Buscar workspace"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("Nenhum workspace encontrado.")).toBeTruthy();
  });
});
