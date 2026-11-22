import type { Notifier } from "@/modules/notifications";
import { lastDayOf, monthOf, shiftMonth, todayIn } from "@/shared/dates";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { type ReferenceLookups, referenceIssues } from "@/shared/references";
import { buildSchedule, SCHEDULE_MONTHS } from "./occurrences";
import { type RecurrencesRepository, toRecurrenceDto } from "./recurrences.repository";
import type {
  CreateRecurrenceInput,
  RecurrenceDetailDto,
  RecurrenceDto,
  RepeatedTransactionInput,
  UpdateRecurrenceInput,
} from "./recurrences.schemas";

const currentMonth = (now: Date) => monthOf(todayIn(now));

export function createRecurrencesService(deps: {
  repository: RecurrencesRepository;
  lookups: ReferenceLookups;
  notifier: Notifier;
}) {
  const { repository, lookups, notifier } = deps;

  async function assertReferences(userId: string, input: Parameters<typeof referenceIssues>[2]) {
    const issues = await referenceIssues(lookups, userId, input);
    if (issues.length) throw new ValidationError(issues);
  }

  /**
   * Materialização sob demanda (decisão registrada em docs/07): chamada antes das leituras que mostram
   * transações (extrato, início, agenda, exportação). Idempotente e barata quando não há mês novo.
   */
  async function materializeDue(userId: string, now: Date): Promise<void> {
    const month = currentMonth(now);
    for (const rec of await repository.dueForMaterialization(userId, month)) {
      await repository.materialize(rec, month);
    }
  }

  return {
    materializeDue,

    /** Ativas primeiro, depois por dia de vencimento e descrição. */
    async list(userId: string): Promise<RecurrenceDto[]> {
      const rows = await repository.listByUser(userId);
      return rows
        .sort(
          (a, b) =>
            Number(b.active) - Number(a.active) ||
            a.dueDay - b.dueDay ||
            a.description.localeCompare(b.description, "pt-BR"),
        )
        .map(toRecurrenceDto);
    },

    async get(userId: string, id: string, now: Date): Promise<RecurrenceDetailDto> {
      await materializeDue(userId, now);
      const rec = await repository.findById(userId, id);
      if (!rec) throw new NotFoundError("Recorrência");
      const from = currentMonth(now);
      const posted = await repository.occurrences(
        userId,
        id,
        `${from}-01`,
        lastDayOf(shiftMonth(from, SCHEDULE_MONTHS - 1)),
      );
      return { ...toRecurrenceDto(rec), schedule: buildSchedule(rec, from, posted) };
    },

    async create(userId: string, input: CreateRecurrenceInput, now: Date): Promise<RecurrenceDto> {
      await assertReferences(userId, input);
      const created = await repository.createAndMaterialize(userId, input, currentMonth(now));
      await notifier.notify(userId, {
        type: "sistema",
        title: created.type === "receita" ? "Receita fixa criada" : "Despesa fixa criada",
        message: `${created.description} · todo dia ${created.dueDay}`,
        recurrenceId: created.id,
      });
      return toRecurrenceDto(created);
    },

    async update(userId: string, id: string, input: UpdateRecurrenceInput, now: Date): Promise<RecurrenceDto> {
      const current = await repository.findById(userId, id);
      if (!current) throw new NotFoundError("Recorrência");
      await assertReferences(userId, { ...input, type: current.type as RecurrenceDto["type"] });
      const updated = await repository.updateAndMaterialize(userId, id, input, currentMonth(now));
      if (!updated) throw new NotFoundError("Recorrência");
      return toRecurrenceDto(updated);
    },

    /** Encerra: os lançamentos ficam no extrato com recorrencia_id = NULL (RNF02). */
    async remove(userId: string, id: string): Promise<void> {
      if (!(await repository.delete(userId, id))) throw new NotFoundError("Recorrência");
    },

    /**
     * "Repetir todo mês" do POST /transactions. As referências já foram validadas pelo módulo de transações.
     * Devolve o id da transação lançada.
     */
    async createFromTransaction(userId: string, input: RepeatedTransactionInput, now: Date): Promise<string> {
      if (input.repeatMonthly.endDate && input.repeatMonthly.endDate < input.date) {
        throw new ValidationError([
          { path: "repeatMonthly.endDate", message: "A data final deve ser depois da data da transação." },
        ]);
      }
      const { recurrence, transactionId } = await repository.createFromTransaction(userId, input, currentMonth(now));
      await notifier.notify(userId, {
        type: "sistema",
        title: recurrence.type === "receita" ? "Receita fixa criada" : "Despesa fixa criada",
        message: `${recurrence.description} · todo dia ${recurrence.dueDay}`,
        recurrenceId: recurrence.id,
      });
      return transactionId;
    },
  };
}

export type RecurrencesService = ReturnType<typeof createRecurrencesService>;
