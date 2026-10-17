import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail: state.sendMail }),
}));

import { sendClientNoticeEmail } from "./send-email";

const config = {
  host: "smtp.example.test",
  port: 587,
  from: "noreply@example.test",
  secure: false,
};
beforeEach(() => {
  state.sendMail.mockReset();
  state.sendMail.mockResolvedValue({ accepted: ["client@example.test"] });
});
describe("Aviso ao cliente", () => {
  it("não tenta envio sem SMTP configurado", async () => {
    expect(
      await sendClientNoticeEmail("client@example.test", "Aviso", "Texto", {}),
    ).toEqual({ success: false, reason: "SMTP_NOT_CONFIGURED" });
    expect(state.sendMail).not.toHaveBeenCalled();
  });
  it("envia texto puro e informa somente aceitação pelo SMTP", async () => {
    expect(
      await sendClientNoticeEmail(
        "client@example.test",
        "Aviso",
        "Olá <cliente>",
        config,
      ),
    ).toEqual({ success: true });
    expect(state.sendMail).toHaveBeenCalledWith({
      from: config.from,
      to: "client@example.test",
      subject: "Aviso",
      text: "Olá <cliente>",
    });
  });
  it("não considera destinatário recusado como sucesso", async () => {
    state.sendMail.mockResolvedValue({ accepted: [] });
    await expect(
      sendClientNoticeEmail("client@example.test", "Aviso", "Texto", config),
    ).rejects.toThrow("did not accept");
  });
  it("propaga falhas de transporte para registro de estado incerto", async () => {
    state.sendMail.mockRejectedValue(new Error("connection reset"));
    await expect(
      sendClientNoticeEmail("client@example.test", "Aviso", "Texto", config),
    ).rejects.toThrow("connection reset");
  });
});
