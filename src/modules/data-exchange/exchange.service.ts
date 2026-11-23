import type { Notifier } from "@/modules/notifications";
import type { RecurrencesService } from "@/modules/recurrences";
import type { FieldIssue } from "@/shared/errors";
import { ValidationError } from "@/shared/errors";
import { formatDateBr, formatDecimalBr, formatMonthLabel, plural } from "@/shared/format";
import type { ReferenceLookups } from "@/shared/references";
import type { ExchangeRepository } from "./exchange.repository";
import type { ConfirmImportInput, DataOperationDto } from "./exchange.schemas";
import { CSV_COLUMNS, toCsvLine } from "./parsers/csv";

const MAX_ISSUES = 50;

/** CSV no formato de importação (padrão Excel pt-BR), com BOM para o Excel reconhecer os acentos. */
export function buildTransactionsCsv(
  rows: ReadonlyArray<{
    date: string;
    description: string;
    amount: string;
    type: string;
    nature: string | null;
    status: string;
    category: string | null;
    account: string | null;
  }>,
): string {
  const lines = [
    CSV_COLUMNS.join(";"),
    ...rows.map((t) =>
      toCsvLine([
        formatDateBr(t.date),
        t.description,
        formatDecimalBr(t.amount),
        t.type,
        t.nature ?? "",
        t.status,
        t.category ?? "",
        t.account ?? "",
      ]),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function createExchangeService(deps: {
  repository: ExchangeRepository;
  lookups: ReferenceLookups;
  recurrences: Pick<RecurrencesService, "materializeDue">;
  notifier: Notifier;
}) {
  const { repository, lookups, recurrences, notifier } = deps;

  /** Mesmas regras das transações, linha a linha (buscas memoizadas: poucas categorias e contas distintas). */
  async function rowIssues(userId: string, rows: ConfirmImportInput["rows"]): Promise<FieldIssue[]> {
    const categoryCache = new Map<string, Promise<{ type: string } | null>>();
    const accountCache = new Map<string, Promise<object | null>>();
    const category = (id: string) => {
      if (!categoryCache.has(id)) categoryCache.set(id, lookups.categories.find(userId, id));
      return categoryCache.get(id) as Promise<{ type: string } | null>;
    };
    const account = (id: string) => {
      if (!accountCache.has(id)) accountCache.set(id, lookups.valueSources.find(userId, id));
      return accountCache.get(id) as Promise<object | null>;
    };

    const issues: FieldIssue[] = [];
    for (const [i, row] of rows.entries()) {
      if ((row.type === "receita") !== (row.nature === null)) {
        issues.push({ path: `rows.${i}.nature`, message: "Natureza só se aplica a despesas." });
      }
      if (row.categoryId) {
        const found = await category(row.categoryId);
        if (!found) issues.push({ path: `rows.${i}.categoryId`, message: "Categoria não encontrada." });
        else if (found.type !== row.type) {
          issues.push({ path: `rows.${i}.categoryId`, message: "Tipo da categoria incompatível." });
        }
      }
      if (row.valueSourceId && !(await account(row.valueSourceId))) {
        issues.push({ path: `rows.${i}.valueSourceId`, message: "Conta não encontrada." });
      }
      if (issues.length >= MAX_ISSUES) break;
    }
    return issues;
  }

  return {
    async confirmImport(userId: string, input: ConfirmImportInput, now: Date): Promise<DataOperationDto> {
      const issues = await rowIssues(userId, input.rows);
      if (issues.length) throw new ValidationError(issues);
      const operation = await repository.saveImport(userId, input, now);
      const withErrors = input.errors.length ? ` (${input.errors.length} com erro)` : "";
      await notifier.notify(userId, {
        type: "importacao_concluida",
        title: "Importação concluída",
        message: `${plural(input.rows.length, "transação importada", "transações importadas")} de ${input.fileName}${withErrors}.`,
      });
      return operation;
    },

    history: (userId: string) => repository.history(userId),

    async exportCsv(userId: string, month: string, now: Date): Promise<{ fileName: string; content: string }> {
      await recurrences.materializeDue(userId, now);
      const rows = await repository.exportRows(userId, month);
      const fileName = `financecontrol-${month}.csv`;
      await repository.saveExport(userId, { fileName, month, rows: rows.length }, now);
      await notifier.notify(userId, {
        type: "exportacao_pronta",
        title: "Exportação pronta",
        message: `${formatMonthLabel(month)}: ${plural(rows.length, "transação", "transações")} em ${fileName}.`,
      });
      return { fileName, content: buildTransactionsCsv(rows) };
    },
  };
}

export type ExchangeService = ReturnType<typeof createExchangeService>;
