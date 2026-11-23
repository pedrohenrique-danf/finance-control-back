import { dueDateIn, monthOf, shiftMonth } from "@/shared/dates";
import type { TransactionStatus } from "@/shared/enums";

// Dados de demonstração (os mesmos do protótipo e do antigo backend simulado do frontend), relativos ao
// mês atual para as telas nunca ficarem vazias. Só para o seed de desenvolvimento.

export const DEMO_ACCOUNTS = [
  { key: "nubank", name: "Nubank", type: "conta_corrente", institution: "Nubank", initialBalance: "2350.00" },
  { key: "carteira", name: "Carteira", type: "carteira", institution: "Dinheiro", initialBalance: "180.00" },
  { key: "cartao", name: "Cartão Inter", type: "cartao_credito", institution: "Banco Inter", initialBalance: "0.00" },
] as const;

/** Chave → nome da categoria padrão (criada no cadastro). */
export const CATEGORY_NAMES = {
  alimentacao: "Alimentação",
  moradia: "Moradia",
  transporte: "Transporte",
  lazer: "Lazer",
  saude: "Saúde",
  educacao: "Educação",
  assinaturas: "Assinaturas",
  salario: "Salário",
  freelance: "Freelance",
  outros: "Outros",
} as const;
type CategoryKey = keyof typeof CATEGORY_NAMES;
type AccountKey = (typeof DEMO_ACCOUNTS)[number]["key"];

const RECURRENCES: Array<[string, string, CategoryKey, AccountKey, number, number?]> = [
  ["Aluguel", "1200.00", "moradia", "nubank", 5],
  ["Internet fibra", "99.90", "moradia", "nubank", 10],
  ["Academia", "89.90", "saude", "cartao", 15],
  ["Streaming", "55.90", "assinaturas", "cartao", 22],
  ["Faculdade", "650.00", "educacao", "nubank", 25, 1],
];

type Row = [
  day: number,
  description: string,
  amount: string,
  category: CategoryKey,
  account: AccountKey,
  pending?: true,
];

const CURRENT_EXPENSES: Row[] = [
  [1, "Padaria do bairro", "18.50", "alimentacao", "carteira"],
  [1, "Uber para casa", "23.90", "transporte", "nubank"],
  [2, "Mercado Pão de Açúcar", "214.37", "alimentacao", "cartao"],
  [3, "Recarga bilhete único", "50.00", "transporte", "nubank"],
  [3, "Café com a turma", "16.00", "alimentacao", "carteira"],
  [4, "Farmácia São Paulo", "42.80", "saude", "nubank"],
  [6, "iFood – japonês", "68.90", "alimentacao", "cartao"],
  [7, "Cinema", "44.00", "lazer", "cartao"],
  [7, "Pipoca e refri", "32.00", "lazer", "carteira"],
  [8, "Feira livre", "37.50", "alimentacao", "carteira"],
  [9, "Livro de cálculo", "89.90", "educacao", "cartao"],
  [10, "Uber para o estágio", "19.40", "transporte", "nubank"],
  [11, "Almoço restaurante", "34.90", "alimentacao", "nubank"],
  [12, "Spotify Família", "34.90", "assinaturas", "cartao"],
  [13, "Mercado Dia", "96.12", "alimentacao", "nubank"],
  [14, "Show no Audio", "120.00", "lazer", "cartao"],
  [14, "Lanche pós-show", "27.50", "alimentacao", "carteira"],
  [16, "Consulta dentista", "150.00", "saude", "nubank"],
  [17, "Recarga bilhete único", "50.00", "transporte", "nubank"],
  [17, "iFood – pizza", "59.90", "alimentacao", "cartao"],
  [18, "Curso online de Excel", "39.90", "educacao", "cartao"],
  [18, "Padaria do bairro", "14.20", "alimentacao", "carteira"],
  [19, "Barbearia", "45.00", "lazer", "carteira"],
  [19, "Mercado Pão de Açúcar", "162.48", "alimentacao", "cartao"],
  [20, "Uber para a faculdade", "21.70", "transporte", "nubank"],
  [20, "Almoço bandejão", "12.00", "alimentacao", "carteira"],
  [21, "Presente aniversário Ana", "85.00", "lazer", "cartao", true],
  [27, "Revisão da bike", "70.00", "transporte", "nubank", true],
  [28, "Happy hour do estágio", "60.00", "lazer", "cartao", true],
];

const CURRENT_INCOME: Row[] = [
  [5, "Salário estágio", "4200.00", "salario", "nubank"],
  [8, "Venda de livros usados", "120.00", "outros", "carteira"],
  [12, "Freelance – site da padaria", "850.00", "freelance", "nubank"],
  [19, "Freelance – identidade visual", "400.00", "freelance", "nubank"],
  [30, "Freelance – manutenção mensal", "300.00", "freelance", "nubank", true],
];

// Meses anteriores: tudo na conta corrente (a demonstração não modela pagamento de fatura nem saque).
const HISTORY_EXPENSES: Array<[string, number, CategoryKey]> = [
  ["Mercado", 280, "alimentacao"],
  ["iFood", 75, "alimentacao"],
  ["Uber", 64, "transporte"],
  ["Bilhete único", 100, "transporte"],
  ["Cinema e lanche", 70, "lazer"],
  ["Farmácia", 38, "saude"],
  ["Padaria", 46, "alimentacao"],
  ["Saída com amigos", 95, "lazer"],
];

/** Fator de gasto e receita extra dos 6 meses anteriores (do mais antigo ao mais recente). */
const HISTORY = [
  { factor: 1.05, extraIncome: 0 },
  { factor: 0.92, extraIncome: 300 },
  { factor: 1.3, extraIncome: 0 },
  { factor: 0.98, extraIncome: 650 },
  { factor: 1.12, extraIncome: 200 },
  { factor: 1.0, extraIncome: 500 },
];

export interface DemoTransaction {
  type: "receita" | "despesa";
  nature: "fixa" | "variavel" | null;
  description: string;
  amount: string;
  date: string;
  status: TransactionStatus;
  category: CategoryKey;
  account: AccountKey;
  /** Índice em `recurrences` quando a transação é ocorrência de uma despesa fixa. */
  recurrence?: number;
}

export interface DemoRecurrence {
  description: string;
  amount: string;
  dueDay: number;
  startDate: string;
  endDate: string | null;
  category: CategoryKey;
  account: AccountKey;
}

/** Monta a demonstração relativa a `today` (YYYY-MM-DD). */
export function buildDemoData(today: string): { recurrences: DemoRecurrence[]; transactions: DemoTransaction[] } {
  const month = monthOf(today);
  const day = Number(today.slice(8, 10));
  const startMonth = shiftMonth(month, -HISTORY.length);
  const transactions: DemoTransaction[] = [];

  const recurrences: DemoRecurrence[] = RECURRENCES.map(([description, amount, category, account, dueDay, end]) => ({
    description,
    amount,
    dueDay,
    startDate: dueDateIn(dueDay, startMonth),
    endDate: end ? dueDateIn(dueDay, shiftMonth(month, end)) : null,
    category,
    account,
  }));

  for (const [type, rows] of [
    ["despesa", CURRENT_EXPENSES],
    ["receita", CURRENT_INCOME],
  ] as const) {
    for (const [d, description, amount, category, account, pending] of rows) {
      transactions.push({
        type,
        nature: type === "despesa" ? "variavel" : null,
        description,
        amount,
        date: dueDateIn(d, month),
        status: pending || d > day ? "pendente" : "efetivada",
        category,
        account,
      });
    }
  }

  HISTORY.forEach((h, hi) => {
    const m = shiftMonth(month, hi - HISTORY.length);
    const paid = { status: "efetivada" as const, account: "nubank" as const };
    transactions.push({
      type: "receita",
      nature: null,
      description: "Salário estágio",
      amount: "4200.00",
      date: dueDateIn(5, m),
      category: "salario",
      ...paid,
    });
    if (h.extraIncome) {
      transactions.push({
        type: "receita",
        nature: null,
        description: "Freelance",
        amount: `${h.extraIncome}.00`,
        date: dueDateIn(18, m),
        category: "freelance",
        ...paid,
      });
    }
    HISTORY_EXPENSES.forEach(([description, base, category], vi) => {
      const cents = Math.round(base * 100 * h.factor * (1 + ((vi + hi) % 3) * 0.07));
      transactions.push({
        type: "despesa",
        nature: "variavel",
        description,
        amount: (cents / 100).toFixed(2),
        date: dueDateIn(2 + ((vi * 3 + hi) % 26), m),
        category,
        ...paid,
      });
    });
  });

  // Despesas fixas já lançadas (histórico + mês atual); as do mês ainda não vencidas ficam pendentes.
  recurrences.forEach((rec, index) => {
    for (let delta = -HISTORY.length; delta <= 0; delta++) {
      const date = dueDateIn(rec.dueDay, shiftMonth(month, delta));
      if (date < rec.startDate) continue;
      transactions.push({
        type: "despesa",
        nature: "fixa",
        description: rec.description,
        amount: rec.amount,
        date,
        status: delta === 0 && rec.dueDay > day ? "pendente" : "efetivada",
        category: rec.category,
        account: rec.account,
        recurrence: index,
      });
    }
  });

  return { recurrences, transactions };
}
