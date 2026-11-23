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
 * Desenvolvimento e testes sem SMTP: o e-mail não sai, vai para o log com os links em destaque.
 * Nunca usado em produção (a configuração exige SMTP lá).
 */
export function createLogMailer(logger: Logger): Mailer {
  return {
    async send({ to, subject, text }) {
      logger.info("email_not_sent_dev", { to, subject, links: text.match(/https?:\/\/\S+/g) ?? [] });
    },
  };
}
