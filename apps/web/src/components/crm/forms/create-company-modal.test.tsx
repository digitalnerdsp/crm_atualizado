import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CompanyFields,
  emptyCompanyForm,
  toCompanyPayload,
} from "./company-fields";
import { CreateCompanyModal } from "./create-company-modal";

const createCompany = vi.fn();
const lookupCnpj = vi.fn();
const lookupCep = vi.fn();

vi.mock("@/fetchers/crm/company/lookup", () => ({
  lookupCompanyCnpj: (...args: unknown[]) => lookupCnpj(...args),
  lookupCompanyCep: (...args: unknown[]) => lookupCep(...args),
}));

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
    lookupCnpj.mockReset();
    lookupCep.mockReset();
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

  it("fills only empty fields from the CNPJ and keeps the primary contact manual", async () => {
    lookupCnpj.mockResolvedValue({
      source: "brasilapi",
      stale: false,
      data: {
        name: "Nome oficial",
        legalName: "Razão oficial",
        postalCode: "01311902",
        addressLine: "Av. Paulista",
        addressNumber: "37",
        addressComplement: "Andar 4",
        district: "Bela Vista",
        city: "São Paulo",
        state: "SP",
      },
    });
    render(<CreateCompanyModal workspaceId="w1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("crm:company.name"), {
      target: { value: "Nome usado pela agência" },
    });
    fireEvent.change(screen.getByLabelText("crm:company.taxIdPj"), {
      target: { value: "19.131.243/0001-97" },
    });
    fireEvent.blur(screen.getByLabelText("crm:company.taxIdPj"));
    await waitFor(() =>
      expect(screen.getByLabelText("crm:company.legalName")).toHaveValue(
        "Razão oficial",
      ),
    );
    expect(screen.getByLabelText("crm:company.name")).toHaveValue(
      "Nome usado pela agência",
    );
    expect(screen.getByLabelText("Nº")).toHaveValue("37");
    expect(screen.getByLabelText("Complemento")).toHaveValue("Andar 4");
    expect(saveButton()).toBeDisabled();
    expect(lookupCnpj).toHaveBeenCalledWith("w1", "19131243000197");
  });

  it("ignores an old lookup after the CNPJ changes", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    lookupCnpj
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({
        source: "cnpjws",
        stale: false,
        data: { name: "Empresa correta", legalName: "Razão correta" },
      });
    render(<CreateCompanyModal workspaceId="w1" onClose={vi.fn()} />);
    const input = screen.getByLabelText("crm:company.taxIdPj");
    fireEvent.change(input, { target: { value: "19.131.243/0001-97" } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "00.000.000/0001-91" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar CNPJ" }));
    await waitFor(() =>
      expect(screen.getByLabelText("crm:company.legalName")).toHaveValue(
        "Razão correta",
      ),
    );
    await act(async () => {
      resolveOld({
        source: "brasilapi",
        stale: false,
        data: { name: "Antiga", legalName: "Razão antiga" },
      });
    });
    expect(lookupCnpj).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("crm:company.legalName")).toHaveValue(
      "Razão correta",
    );
  });
});

function EditFieldsHarness() {
  const [form, setForm] = useState({
    ...emptyCompanyForm,
    name: "Nome da agência",
    taxId: "19.131.243/0001-97",
    postalCode: "01001-000",
    addressLine: "Rua cadastrada",
  });
  return (
    <CompanyFields
      workspaceId="w1"
      form={form}
      mode="edit"
      idPrefix="company-edit-test"
      onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
    />
  );
}

describe("CompanyFields lookups on edit", () => {
  afterEach(cleanup);
  beforeEach(() => {
    lookupCnpj.mockReset();
    lookupCep.mockReset();
  });

  it("requires an explicit action to replace an existing address", async () => {
    lookupCep.mockResolvedValue({
      source: "viacep",
      stale: false,
      data: {
        addressLine: "Praça da Sé",
        city: "São Paulo",
        district: "Sé",
        state: "SP",
      },
    });
    render(<EditFieldsHarness />);
    fireEvent.blur(screen.getByLabelText("CEP"));
    await waitFor(() =>
      expect(screen.getByText(/Endereço encontrado/)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Logradouro")).toHaveValue("Rua cadastrada");
    fireEvent.click(
      screen.getByRole("button", { name: "Preencher campos vazios" }),
    );
    expect(screen.getByLabelText("Logradouro")).toHaveValue("Rua cadastrada");
    expect(screen.getByLabelText("crm:company.city")).toHaveValue("São Paulo");
    fireEvent.click(screen.getByRole("button", { name: "Consultar CEP" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Substituir pelos dados consultados",
        }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Substituir pelos dados consultados",
      }),
    );
    expect(screen.getByLabelText("Logradouro")).toHaveValue("Praça da Sé");
    expect(screen.getByLabelText("Nº")).toHaveValue("");
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
