import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/** Cria o pool e o cliente Drizzle (node-postgres). Sem singleton: chamado por createApp. */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle({ client: pool, schema });
  return { db, close: () => pool.end() };
}

export type Database = ReturnType<typeof createDb>["db"];

/** Transação aberta por `db.transaction(async (tx) => …)`. */
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Banco ou transação aberta: as funções de escrita compartilhadas aceitam os dois. */
export type DbExecutor = Database | DbTransaction;
