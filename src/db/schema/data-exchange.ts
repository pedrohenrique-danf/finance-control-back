import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { dataFormats, dataOperationStatuses, dataOperationTypes } from "@/shared/enums";
import { users } from "./auth";
import { createdAt, inList } from "./helpers";

/** Histórico de cada operação de importação ou exportação de dados (RF07). */
export const dataOperations = pgTable(
  "importacoes_exportacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("tipo", { length: 12 }).notNull(),
    format: varchar("formato", { length: 10 }).notNull(),
    status: varchar("status", { length: 25 }).notNull().default("pendente"),
    fileName: varchar("nome_arquivo", { length: 255 }),
    periodStart: date("periodo_inicio", { mode: "string" }), // filtro opcional da exportação
    periodEnd: date("periodo_fim", { mode: "string" }),
    totalRows: integer("total_linhas").notNull().default(0),
    successRows: integer("linhas_sucesso").notNull().default(0),
    errorRows: integer("linhas_erro").notNull().default(0),
    errorMessage: text("mensagem_erro"), // falha geral da operação
    createdAt: createdAt(),
    completedAt: timestamp("concluido_em", { withTimezone: true }),
  },
  (t) => [
    check("ck_importacoes_exportacoes_tipo", sql`${t.type} in (${inList(dataOperationTypes)})`),
    check("ck_importacoes_exportacoes_formato", sql`${t.format} in (${inList(dataFormats)})`),
    check("ck_importacoes_exportacoes_status", sql`${t.status} in (${inList(dataOperationStatuses)})`),
    check(
      "ck_importacoes_exportacoes_periodo",
      sql`${t.periodStart} is null or ${t.periodEnd} is null or ${t.periodEnd} >= ${t.periodStart}`,
    ),
    check(
      "ck_importacoes_exportacoes_linhas",
      sql`${t.totalRows} >= 0 and ${t.successRows} >= 0 and ${t.errorRows} >= 0`,
    ),
    index("idx_importacoes_exportacoes_usuario_criado").on(t.userId, t.createdAt),
  ],
);

/** Erros linha a linha encontrados durante uma importação. */
export const importErrors = pgTable(
  "importacao_erros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operationId: uuid("operacao_id")
      .notNull()
      .references(() => dataOperations.id, { onDelete: "cascade" }),
    lineNumber: integer("numero_linha").notNull(),
    field: varchar("campo", { length: 60 }),
    message: text("mensagem").notNull(),
    lineContent: text("conteudo_linha"),
    createdAt: createdAt(),
  },
  (t) => [index("idx_importacao_erros_operacao").on(t.operationId)],
);
