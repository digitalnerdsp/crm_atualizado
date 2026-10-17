import { Link, Section, Text } from "@react-email/components";
import React from "react";
import { resolveEmailLocale } from "./resolve-locale";
import { EmailShell, styles } from "./shell";

void React;

export type MagicLinkEmailProps = {
  magicLink: string;
  locale?: string | null;
};

const messages = {
  pt: {
    preview: "Entrar no Nortys",
    title: "Seu link seguro de entrada",
    subtitle: "Use este link para continuar no seu workspace do Nortys.",
    cta: "Entrar no Nortys",
    expiry: "Este link expira em 5 minutos por segurança.",
    ignore: "Se você não solicitou isso, pode ignorar este e-mail.",
    footer: "E-mail de segurança do Nortys",
  },
  en: {
    preview: "Sign in to Nortys",
    title: "Your secure sign-in link",
    subtitle: "Use this link to continue to your Nortys workspace.",
    cta: "Sign in to Nortys",
    expiry: "This link expires in 5 minutes for your security.",
    ignore: "If you didn't request this, you can ignore this email.",
    footer: "Nortys security email",
  },
} as const;

const MagicLinkEmail = ({ magicLink, locale }: MagicLinkEmailProps) => {
  const copy = messages[resolveEmailLocale(locale)];

  return (
    <EmailShell
      preview={copy.preview}
      title={copy.title}
      subtitle={copy.subtitle}
    >
      <Section>
        <Link style={styles.button} href={magicLink}>
          {copy.cta}
        </Link>
        <Text style={styles.paragraph}>{copy.expiry}</Text>
        <Text style={styles.muted}>{copy.ignore}</Text>
        <Section style={styles.divider} />
        <Text style={styles.footer}>{copy.footer}</Text>
      </Section>
    </EmailShell>
  );
};

MagicLinkEmail.PreviewProps = {
  magicLink: "https://app.example",
  locale: "pt-BR",
} as MagicLinkEmailProps;

export default MagicLinkEmail;
