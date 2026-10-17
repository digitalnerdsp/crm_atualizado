import { Link, Section, Text } from "@react-email/components";
import React from "react";
import { resolveEmailLocale } from "./resolve-locale";
import { EmailShell, styles } from "./shell";

void React;

export type NotificationEmailProps = {
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string;
  locale?: string | null;
};

const messages = {
  pt: {
    preview: "Você tem uma nova notificação do Nortys",
    subtitle: "Uma notificação correspondeu às suas preferências de entrega.",
    footer: "Notificação do Nortys",
    actionLabel: "Abrir no Nortys",
  },
  en: {
    preview: "You have a new Nortys notification",
    subtitle: "A notification matched your delivery preferences.",
    footer: "Nortys notification",
    actionLabel: "Open in Nortys",
  },
} as const;

const NotificationEmail = ({
  title,
  message,
  actionUrl,
  actionLabel,
  locale,
}: NotificationEmailProps) => {
  const copy = messages[resolveEmailLocale(locale)];

  return (
    <EmailShell preview={copy.preview} title={title} subtitle={copy.subtitle}>
      <Section>
        <Text style={styles.paragraph}>{message}</Text>
        {actionUrl ? (
          <Link style={styles.button} href={actionUrl}>
            {actionLabel ?? copy.actionLabel}
          </Link>
        ) : null}
        <Section style={styles.divider} />
        <Text style={styles.footer}>{copy.footer}</Text>
      </Section>
    </EmailShell>
  );
};

NotificationEmail.PreviewProps = {
  title: "Tarefa atribuída a você",
  message: "Você foi atribuído à tarefa Configurar notificações da conta.",
  actionUrl: "https://app.example",
  locale: "pt-BR",
} as NotificationEmailProps;

export default NotificationEmail;
