import { describe, expect, it, vi } from "vitest";
import { createLogMailer } from "@/shared/mailer";
import { passwordResetEmail } from "./password-reset-email";

const url =
  "http://localhost:3001/api/auth/reset-password/abc?callbackURL=http%3A%2F%2Flocalhost%3A3000%2Freset-password";

describe("passwordResetEmail", () => {
  it("leva o link, a validade e o primeiro nome", () => {
    const mail = passwordResetEmail({ to: "ana@x.com", name: "Ana Paula Souza", url, expiresInMinutes: 60 });
    expect(mail.to).toBe("ana@x.com");
    expect(mail.subject).toBe("Redefinir sua senha do FinanceControl");
    expect(mail.text).toContain("Oi, Ana!");
    expect(mail.text).toContain(url);
    expect(mail.text).toContain("60 minutos");
    expect(mail.html).toContain(`href="${url}"`);
  });

  it("escapa o nome no HTML", () => {
    const mail = passwordResetEmail({ to: "x@x.com", name: "<script>", url, expiresInMinutes: 60 });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});

describe("createLogMailer", () => {
  it("não envia: registra destinatário, assunto e links no log", async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const mail = passwordResetEmail({ to: "ana@x.com", name: "Ana", url, expiresInMinutes: 60 });
    await createLogMailer(logger).send(mail);
    expect(logger.info).toHaveBeenCalledWith("email_not_sent_dev", {
      to: "ana@x.com",
      subject: mail.subject,
      links: [url],
    });
  });
});
