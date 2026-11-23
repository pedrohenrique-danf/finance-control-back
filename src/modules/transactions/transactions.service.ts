import type { Notifier } from "@/modules/notifications";
import type { RecurrencesService } from "@/modules/recurrences";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { formatBrl, formatDateBr } from "@/shared/format";
import { type ReferenceLookups, referenceIssues } from "@/shared/references";
import type { TransactionsRepository, TransactionWrite } from "./transactions.repository";
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  TransactionDto,
  UpdateTransactionInput,
} from "./transactions.schemas";

function toWrite(input: UpdateTransactionInput): TransactionWrite {
  return {
    type: input.type,
    nature: input.type === "despesa" ? (input.nature ?? null) : null,
    description: input.description,
    amount: input.amount,
    date: input.date,
    status: input.status,
    categoryId: input.categoryId ?? null,
    valueSourceId: input.valueSourceId ?? null,
  };
}

export function createTransactionsService(deps: {
  repository: TransactionsRepository;
  lookups: ReferenceLookups;
  recurrences: Pick<RecurrencesService, "materializeDue" | "createFromTransaction">;
  notifier: Notifier;
}) {
  const { repository, lookups, recurrences, notifier } = deps;

  async function assertReferences(userId: string, input: TransactionWrite) {
    const issues = await referenceIssues(lookups, userId, input);
    if (issues.length) throw new ValidationError(issues);
  }

  async function get(userId: string, id: string): Promise<TransactionDto> {
    const found = await repository.findById(userId, id);
    if (!found) throw new NotFoundError("Transação");
    return found;
  }

  return {
    async list(userId: string, query: ListTransactionsQuery, now: Date) {
      await recurrences.materializeDue(userId, now);
      const result = await repository.list(userId, query);
      return {
        data: result.rows,
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
          summary: result.summary,
          dayTotals: result.dayTotals,
        },
      };
    },

    get,

    async create(userId: string, input: CreateTransactionInput, now: Date): Promise<TransactionDto> {
      const data = toWrite(input);
      await assertReferences(userId, data);
      let created: TransactionDto;
      if (input.repeatMonthly) {
        // A ocorrência é de uma recorrência: despesa vira fixa (ck_transacoes_natureza continua válido).
        const id = await recurrences.createFromTransaction(
          userId,
          { ...data, repeatMonthly: input.repeatMonthly },
          now,
        );
        created = await get(userId, id);
      } else {
        created = await repository.insert(userId, data);
      }
      await notifier.notify(userId, {
        type: "transacao_registrada",
        title: created.type === "receita" ? "Receita registrada" : "Despesa registrada",
        message: `${created.description} · ${formatBrl(created.amount)} em ${formatDateBr(created.date)}`,
        transactionId: created.id,
      });
      return created;
    },

    /** PUT substitui os campos editáveis; origem e recorrência são preservadas. */
    async update(userId: string, id: string, input: UpdateTransactionInput): Promise<TransactionDto> {
      const data = toWrite(input);
      await get(userId, id); // 404 antes de validar o corpo contra os recursos do usuário
      await assertReferences(userId, data);
      const updated = await repository.update(userId, id, data);
      if (!updated) throw new NotFoundError("Transação");
      return updated;
    },

    async remove(userId: string, id: string): Promise<void> {
      if (!(await repository.delete(userId, id))) throw new NotFoundError("Transação");
    },
  };
}

export type TransactionsService = ReturnType<typeof createTransactionsService>;
