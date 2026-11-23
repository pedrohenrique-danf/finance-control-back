import { fold } from "./pt-br";

// Movimentações entre a conta e as reservas do próprio banco (cofrinho do PicPay, caixinha do Nubank,
// porquinho do Inter, aplicações e resgates). Aparecem no extrato como entrada/saída, mas não são receita
// nem despesa: a revisão sugere não importar (o usuário pode marcar de volta).

const INTERNAL =
  /\b(COFRINHO|CAIXINHA|PORQUINHO|DINHEIRO GUARDADO|DINHEIRO RESGATADO|RESGATE RDB|APLICACAO RDB|APLICACAO AUTOMATICA|RESGATE AUTOMATICO)\b/;

export const INTERNAL_TRANSFER_NOTE = "Movimentação entre a conta e uma reserva do banco: não é receita nem despesa.";

export function isInternalTransfer(description: string): boolean {
  return INTERNAL.test(fold(description));
}
