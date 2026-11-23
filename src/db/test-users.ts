/** Padrões (SQL LIKE) dos e-mails gerados pelos testes: E2E do front (e2e+) e integração do back (it+). */
export const TEST_EMAIL_PATTERNS = ["e2e+%@financecontrol.local", "it+%@financecontrol.local"] as const;

/** Mesmo critério dos padrões, conferido em memória antes de apagar (o `_` e o `%` do LIKE são curingas). */
export function isTestEmail(email: string): boolean {
  return /^(e2e|it)\+[^@]*@financecontrol\.local$/.test(email);
}
