import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";

export const createdAt = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Lista literal para CHECK constraints (`col in (...)`). Só use com constantes de `shared/enums`. */
export const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));
