import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import ptBR from "../../../../i18n/pt-BR.json";
import WorkspaceInvitationEmail from "./workspace-invitation";

describe("WorkspaceInvitationEmail", () => {
  it("renders the invitation in Portuguese for a Brazilian locale", async () => {
    const html = await render(
      createElement(WorkspaceInvitationEmail, {
        workspaceName: "Equipe Produto",
        inviterName: "Camila",
        inviterEmail: "camila@example.com",
        invitationLink: "https://kaneo.example/invite/abc",
        to: "invite@example.com",
        copy: ptBR.invitations.email,
      }),
    );

    expect(html).toContain("Entrar em Equipe Produto");
    expect(html).toContain("Aceitar convite");
    expect(html).toContain("Camila (camila@example.com)");
  });
});
