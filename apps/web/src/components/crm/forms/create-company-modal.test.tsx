import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCompanyForm, toCompanyPayload } from "./company-fields";
import { CreateCompanyModal } from "./create-company-modal";

const createCompany = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@/hooks/queries/crm/use-crm-taxonomy", () => ({
  useCrmSources: () => ({
    data: [{ id: "src-meta", name: "Meta Ads", channel: "paid" }],
  }),
  useCrmSegments: () => ({ data: [{ id: "seg-food", name: "Alimentação" }] }),
  useCrmCompanyCities: () => ({ data: ["São Paulo"] }),
}));

vi.mock("@/hooks/mutations/crm/use-crm-contact-mutations", () => ({
  useCreateCompany: () => ({ mutateAsync: createCompany, isPending: false }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function saveButton() {
  return screen.getByRole("button", { name: "common:actions.save" });
}

describe("CreateCompanyModal", () => {
  afterEach(cleanup);

  beforeEach(() => {
    createCompany.mockReset();
    createCompany.mockResolvedValue({ id: "c1", possibleDuplicates: [] });
  });

  it("cannot be saved without a primary contact", () => {
    render(<CreateCompanyModal workspaceId="w1" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("crm:company.name"), {
      target: { value: "Padaria do Zé" },
    });
    // Uma empresa sem pessoa é um registro com o qual não se faz nada.
    expect(saveButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("crm:company.contactFirstName"), {
      target: { value: "José" },
    });
    expect(saveButton()).toBeEnabled();
  });

  it("sends the company and its primary contact in one request", async () => {
    const onClose = vi.fn();
    render(<CreateCompanyModal workspaceId="w1" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("crm:company.name"), {
      target: { value: "  Padaria do Zé  " },
    });
    fireEvent.change(screen.getByLabelText("crm:company.taxIdPj"), {
      target: { value: "11.222.333/0001-81" },
    });
    fireEvent.change(screen.getByLabelText("crm:company.city"), {
      target: { value: "São Paulo" },
    });
    fireEvent.change(screen.getByLabelText("crm:company.contactFirstName"), {
      target: { value: "José" },
    });
    fireEvent.change(screen.getByLabelText("crm:company.contactEmail"), {
      target: { value: "jose@padaria.com.br" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => expect(createCompany).toHaveBeenCalledTimes(1));
    expect(createCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        name: "Padaria do Zé",
        personType: "pj",
        taxId: "11.222.333/0001-81",
        city: "São Paulo",
        status: "prospect",
        // Campo não preenchido vai como null, não como string vazia.
        sourceId: null,
        segmentId: null,
        state: null,
        primaryContact: {
          firstName: "José",
          lastName: null,
          email: "jose@padaria.com.br",
          phone: null,
          jobTitle: null,
        },
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("offers the cities already typed in the workspace", () => {
    render(<CreateCompanyModal workspaceId="w1" onClose={vi.fn()} />);

    const city = screen.getByLabelText("crm:company.city");
    const listId = city.getAttribute("list");
    expect(listId).toBeTruthy();

    const options = document.querySelectorAll(`#${listId} option`);
    expect([...options].map((option) => option.getAttribute("value"))).toEqual([
      "São Paulo",
    ]);
  });
});

describe("toCompanyPayload", () => {
  it("turns blanks into null and keeps the chosen classifications", () => {
    const payload = toCompanyPayload({
      ...emptyCompanyForm,
      name: " Studio Ana ",
      personType: "pf",
      taxId: " 529.982.247-25 ",
      sourceId: "src-meta",
      state: "SP",
      billingDay: "10",
      clientSince: "2025-03-10",
    });

    expect(payload.name).toBe("Studio Ana");
    expect(payload.personType).toBe("pf");
    expect(payload.taxId).toBe("529.982.247-25");
    expect(payload.sourceId).toBe("src-meta");
    expect(payload.segmentId).toBeNull();
    expect(payload.state).toBe("SP");
    expect(payload.billingDay).toBe(10);
    expect(payload.legalName).toBeNull();
    expect(payload.paymentTerms).toBeNull();
    // Meio-dia local: meia-noite viraria o dia anterior em UTC-3.
    expect(payload.clientSince?.startsWith("2025-03-10")).toBe(true);
  });
});
