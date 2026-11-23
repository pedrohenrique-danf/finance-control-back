import type { MailMessage } from "@/shared/mailer";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * E-mail com o link de redefinição. O link aponta para o Better Auth, que valida o token e redireciona
 * para a tela do front (`/reset-password?token=…`, ou `?error=INVALID_TOKEN` se expirou/foi usado).
 */
export function passwordResetEmail(input: { to: string; name: string; url: string; expiresInMinutes: number }) {
  const firstName = input.name.trim().split(/\s+/)[0] || "olá";
  const validity = `${input.expiresInMinutes} minutos`;
  const text = [
    `Oi, ${firstName}!`,
    "",
    "Recebemos um pedido para redefinir a senha da sua conta no FinanceControl.",
    "Para criar uma nova senha, abra o link abaixo:",
    "",
    input.url,
    "",
    `O link vale por ${validity} e só pode ser usado uma vez.`,
    "Se não foi você, ignore este e-mail: sua senha atual continua valendo.",
  ].join("\n");

  const url = escapeHtml(input.url);
  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#FAFBF7;font-family:Arial,Helvetica,sans-serif;color:#2F3127">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
      <h1 style="margin:0 0 16px;font-size:20px;color:#4E4F3D">Redefinir sua senha</h1>
      <p style="margin:0 0 12px;line-height:1.5">Oi, ${escapeHtml(firstName)}!</p>
      <p style="margin:0 0 20px;line-height:1.5">
        Recebemos um pedido para redefinir a senha da sua conta no FinanceControl.
      </p>
      <p style="margin:0 0 24px">
        <a href="${url}" style="display:inline-block;background:#636851;color:#ffffff;text-decoration:none;
          font-weight:bold;padding:12px 20px;border-radius:12px">Criar nova senha</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#7A7E6B">
        O link vale por ${validity} e só pode ser usado uma vez. Se o botão não funcionar, copie este endereço:<br>
        <span style="word-break:break-all">${url}</span>
      </p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#7A7E6B">
        Se não foi você, ignore este e-mail: sua senha atual continua valendo.
      </p>
    </div>
  </body>
</html>`;

  return { to: input.to, subject: "Redefinir sua senha do FinanceControl", text, html } satisfies MailMessage;
}
