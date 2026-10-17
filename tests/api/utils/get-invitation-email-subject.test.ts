import { describe, expect, it } from "vitest";
import { getInvitationEmailSubject } from "../../../apps/api/src/utils/get-invitation-email-subject";

describe("getInvitationEmailSubject", () => {
  it("uses Portuguese copy for Brazilian locales", () => {
    const locale = "pt-BR";
    const inviterName = "Alice";
    const workspaceName = "Equipe produto";

    const subject = getInvitationEmailSubject(
      locale,
      inviterName,
      workspaceName,
    );

    expect(subject).toBe(
      "Alice convidou você para entrar em Equipe produto no Nortys",
    );
  });

  it("uses Portuguese copy for regional Portuguese locales", () => {
    const locale = "pt-PT";
    const inviterName = "Alice";
    const workspaceName = "Produto";

    const subject = getInvitationEmailSubject(
      locale,
      inviterName,
      workspaceName,
    );

    expect(subject).toBe(
      "Alice convidou você para entrar em Produto no Nortys",
    );
  });

  it("uses the English fallback for unsupported locales", () => {
    const locale = "it-IT";
    const inviterName = "Alice";
    const workspaceName = "Producto";

    const subject = getInvitationEmailSubject(
      locale,
      inviterName,
      workspaceName,
    );

    expect(subject).toBe("Alice invited you to join Producto on Nortys");
  });
});
