import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DealServicesEditor } from "./deal-services-editor";

const setServices = vi.fn();
const updateDeal = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@/hooks/queries/crm/use-crm-services", () => ({
  useCrmServices: () => ({ data: [] }),
}));

vi.mock("@/hooks/mutations/crm/use-crm-service-mutations", () => ({
  useSetCrmDealServices: () => ({ mutateAsync: setServices, isPending: false }),
}));

vi.mock("@/hooks/mutations/crm/use-crm-mutations", () => ({
  useUpdateDeal: () => ({ mutateAsync: updateDeal, isPending: false }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const soldLine = {
  id: "line-1",
  serviceId: "svc-traffic",
  name: "Gestão de tráfego",
  billingType: "monthly" as const,
  quantity: 1,
  unitPriceCents: 250_000,
  discountPercent: 0,
  totalCents: 250_000,
};

function renderEditor(overrides?: Partial<{ valueIsManual: boolean }>) {
  return render(
    <DealServicesEditor
      workspaceId="w1"
      dealId="d1"
      currency="BRL"
      valueCents={250_000}
      valueIsManual={overrides?.valueIsManual ?? false}
      lines={[soldLine]}
      canEdit
    />,
  );
}

describe("DealServicesEditor", () => {
  afterEach(cleanup);

  beforeEach(() => {
    setServices.mockReset().mockResolvedValue({});
    updateDeal.mockReset().mockResolvedValue({});
  });

  it("previews the line total while typing and sends the whole list", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /crm:services.edit/ }));
    fireEvent.click(screen.getByRole("button", { name: /crm:services.add/ }));

    const names = screen.getAllByLabelText("crm:services.name");
    fireEvent.change(names[1] as HTMLElement, {
      target: { value: "Sessão de fotos" },
    });
    fireEvent.change(
      screen.getAllByLabelText("crm:services.quantity")[1] as HTMLElement,
      { target: { value: "2" } },
    );
    fireEvent.change(
      screen.getAllByLabelText("crm:services.unitPrice")[1] as HTMLElement,
      { target: { value: "600,00" } },
    );
    fireEvent.change(
      screen.getAllByLabelText("crm:services.discount")[1] as HTMLElement,
      { target: { value: "10" } },
    );

    // 2 × R$ 600 − 10% = R$ 1.080; somado ao tráfego, R$ 3.580.
    expect(screen.getByText(/1\.080,00/)).toBeInTheDocument();
    expect(screen.getByText(/3\.580,00/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.save" }),
    );

    await waitFor(() => expect(setServices).toHaveBeenCalledTimes(1));
    expect(setServices).toHaveBeenCalledWith({
      dealId: "d1",
      payload: {
        workspaceId: "w1",
        items: [
          // A linha já vendida volta com a própria cópia de nome e preço.
          {
            serviceId: "svc-traffic",
            name: "Gestão de tráfego",
            billingType: "monthly",
            quantity: 1,
            unitPriceCents: 250_000,
            discountPercent: 0,
          },
          {
            serviceId: null,
            name: "Sessão de fotos",
            billingType: "one_time",
            quantity: 2,
            unitPriceCents: 60_000,
            discountPercent: 10,
          },
        ],
      },
    });
  });

  it("locks the value only through the explicit action", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /crm:services.lock/ }));
    fireEvent.change(screen.getByLabelText("crm:services.lockValueLabel"), {
      target: { value: "2.000,00" },
    });
    const lockButtons = screen.getAllByRole("button", {
      name: /crm:services.lock/,
    });
    const confirm = lockButtons[lockButtons.length - 1] as HTMLElement;
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(updateDeal).toHaveBeenCalledWith({
        dealId: "d1",
        payload: {
          workspaceId: "w1",
          valueIsManual: true,
          valueCents: 200_000,
        },
      }),
    );
  });

  it("offers to hand the value back to the items once locked", async () => {
    renderEditor({ valueIsManual: true });
    expect(screen.getByText("crm:services.lockedHint")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /crm:services.unlock/ }),
    );
    await waitFor(() =>
      expect(updateDeal).toHaveBeenCalledWith({
        dealId: "d1",
        payload: { workspaceId: "w1", valueIsManual: false },
      }),
    );
  });
});
