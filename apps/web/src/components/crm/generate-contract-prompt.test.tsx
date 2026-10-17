import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateContractPrompt } from "./generate-contract-prompt";

const generate = vi.fn();
const navigate = vi.fn();
let deal: Record<string, unknown> | undefined;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}));

vi.mock("@/hooks/queries/crm/use-crm-deal", () => ({
  useCrmDeal: () => ({ data: deal }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canCreateDeals: () => true }),
}));

vi.mock("@/hooks/mutations/crm/use-crm-contract-mutations", () => ({
  useCreateCrmContractFromDeal: () => ({
    mutateAsync: generate,
    isPending: false,
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function wonDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    status: "won",
    companyId: "c1",
    contract: null,
    services: [
      { billingType: "monthly", totalCents: 250_000 },
      { billingType: "yearly", totalCents: 120_000 },
      { billingType: "one_time", totalCents: 800_000 },
    ],
    ...overrides,
  };
}

describe("GenerateContractPrompt", () => {
  afterEach(cleanup);

  beforeEach(() => {
    generate.mockReset().mockResolvedValue({ id: "k1" });
    navigate.mockReset();
  });

  it("offers the contract with the monthly equivalent of the recurring items", async () => {
    deal = wonDeal();
    render(<GenerateContractPrompt workspaceId="w1" dealId="d1" />);

    // R$ 2.500 mensal + R$ 1.200 anual ÷ 12 = R$ 2.600; o pontual fica fora.
    expect(screen.getByText(/2\.600,00/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /crm:contracts.generate/ }),
    );
    await waitFor(() =>
      expect(generate).toHaveBeenCalledWith({
        dealId: "d1",
        payload: { workspaceId: "w1" },
      }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { workspaceId: "w1", contractId: "k1" },
        }),
      ),
    );
  });

  it("stays out of the way when there is nothing recurring to sign", () => {
    deal = wonDeal({
      services: [{ billingType: "one_time", totalCents: 800_000 }],
    });
    const { container } = render(
      <GenerateContractPrompt workspaceId="w1" dealId="d1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not offer a contract before the deal is won", () => {
    deal = wonDeal({ status: "open" });
    const { container } = render(
      <GenerateContractPrompt workspaceId="w1" dealId="d1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
