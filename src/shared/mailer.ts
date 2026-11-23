import nodemailer from "nodemailer";
import type { Logger } from "./logger";

export interface MailConfig {
  host: string;
  port: number;
  /** TLS direto (porta 465); nas demais portas a conexão sobe para TLS com STARTTLS. */
  secure: boolean;
  user: string;
  pass: string;
  /** Remetente, ex.: "FinanceControl <nao-responda@exemplo.com>". */
  from: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Envio de e-mails transacionais. Os módulos dependem só desta interface (docs/04). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** SMTP (Gmail com senha de app, Brevo, Resend, SES...). Só o servidor muda entre provedores. */
export function createSmtpMailer(config: MailConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure, // nas portas sem TLS direto, exige STARTTLS: credenciais nunca em texto puro
    auth: { user: config.user, pass: config.pass },
  });
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, ...message });
    },
  };
}

/**
 * Sem SMTP o e-mail não sai.
 * - Dev/test (`exposeLinks`): vai para o log com os links em destaque, para testar a recuperação de senha.
 * - Produção: só um aviso, sem destinatário nem link (um link de redefinição no log daria acesso à conta).
 */
export function createLogMailer(logger: Logger, { exposeLinks }: { exposeLinks: boolean }): Mailer {
  return {
    async send({ to, subject, text }) {
      if (exposeLinks) {
        logger.info("email_not_sent_dev", { to, subject, links: text.match(/https?:\/\/\S+/g) ?? [] });
      } else {
        logger.warn("email_not_sent_no_smtp", { subject });
      }
    },
  };
}
