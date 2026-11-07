# 06 — Persistência: Drizzle ORM, Neon e Migrações

> Unidade 6 (camada de persistência, mapeamento objeto-relacional, modelo físico, relacionamentos, restrições, `flask shell`/validação, `create_all` × migrações versionadas).

## Objetivo

Definir como o schema do banco é modelado (Drizzle), como as tabelas evoluem (migrações versionadas) e como garantir integridade (FKs, unicidade, `ON DELETE SET NULL`, UUID). O schema Drizzle é a **única fonte de verdade**.

## Escopo

**Cobre:** schema, relações, integridade, cliente de banco, repositórios, consultas agregadas, projeção de recorrências (RF04), fluxo de migração, seed, testes de integridade.
**Não cobre:** configuração do Better Auth (07). Tabelas de notificações (`notificacoes`, `preferencias_notificacao`) **estão fora do MVP**; não as crie agora.

## Regras e padrões

### Papéis (equivalência com a Unidade 6)

| Unidade 6 (Flask) | FinanceControl |
|---|---|
| Classe SQLAlchemy = tabela | `pgTable(...)` do Drizzle |
| `db = SQLAlchemy()` + `init_app` | `createDb(url)` chamado em `createApp` (sem singleton) |
| `register_models()` | `src/db/schema/index.ts` reexporta todas as tabelas |
| `db.create_all()` (só didático) | **proibido**; use migrações |
| Flask-Migrate/Alembic | Drizzle Kit (`generate`/`migrate`) |
| `flask shell` para validar | seed + testes de integração |
| SQLite em dev | **sempre PostgreSQL (Neon)**; use branch de dev |

### Neon e Drizzle

- O Neon é **apenas hospedagem** do PostgreSQL. Não crie nem altere tabelas pelo painel.
- Estrutura definida **somente** em `src/db/schema/` e versionada em `drizzle/`.
- Tabelas de autenticação do Better Auth também vivem neste schema (ver 07).
- Driver: **`pg` (node-postgres)** via `drizzle-orm/node-postgres`, com `Pool` (TCP). Motivo: o backend é um servidor Node de longa duração; `pg` é o driver mais maduro e suporta `db.transaction`. Não use `neon-http` (sem transações). Se a hospedagem futura for serverless/edge, reavalie `@neondatabase/serverless` — só `src/db/client.ts` conhece o driver.
- Operações multi-linha: prefira **um único `INSERT` com várias linhas** (atômico); use `db.transaction` quando houver leitura + escrita dependentes.
- A sintaxe dos exemplos (opção `{ client }`, terceiro argumento de `pgTable` como array) foi validada com o Drizzle ORM 0.45 instalado.

### Regras do schema

- PK: `uuid` com `defaultRandom()` (RNF03). Nunca IDs sequenciais.
- Timestamps `timestamptz`; `criado_em` com `defaultNow()`, `atualizado_em` com `$onUpdate`.
- Dinheiro: `numeric(14,2)`. O Drizzle devolve **string** — preserve como string; some **no SQL** (`sum`), nunca em `number`.
- Datas de transação: `date` com `mode: "string"` (`"YYYY-MM-DD"`), evitando deslocamento de fuso.
- Enums como `varchar` + **CHECK constraint** usando as listas de `shared/enums.ts` (evita `pgEnum`, que é mais difícil de migrar).
- `usuario_id` em toda tabela de dados: `NOT NULL`, FK com `ON DELETE CASCADE` **[confirmar no ER]**.
- **RNF02:** `transacoes.categoria_id` → `categorias.id` com **`ON DELETE SET NULL`** (coluna nullable). Idem `fonte_valor_id`, `recorrencia_id`, `operacao_dados_id`.
- Nomes: tabelas/colunas do banco em pt-BR `snake_case` (conforme o modelo físico); propriedades TypeScript em inglês `camelCase`.
- Não use a API relacional do Drizzle (`relations`) sem decisão registrada; use `join` explícito.
- Índices: `(usuario_id, data_transacao)` em `transacoes`; FKs consultadas com frequência.

### Tabelas do MVP

| Tabela (banco) | Export (TS) | RF |
|---|---|---|
| `usuarios`, contas/sessões/verificações do Better Auth | `users`, `accounts`, `sessions`, `verifications` | RF01 |
| `categorias` | `categories` | RF02 |
| `fontes_valor` | `valueSources` | RF03 (vínculo opcional) |
| `transacoes` | `transactions` | RF03, RF05, RF06 |
| `recorrencias` | `recurrences` | RF04 |
| `importacoes_exportacoes`, `importacao_erros` | `dataOperations`, `importErrors` | RF07 |

### Reconciliação ER × Better Auth — **[PENDENTE DE DEFINIÇÃO]**

O ER lista `usuarios` (com `senha_hash`), `identidades_oauth` e `tokens_usuario`. O Better Auth guarda a **senha** na tabela de contas (`account.password`) e exige tabela de **sessão**. Para evitar duas fontes de verdade:

- **Não** crie `usuarios.senha_hash`; o hash fica no Better Auth.
- Mapeie `user` → `usuarios` e `account` → tabela de contas (substitui `identidades_oauth`), `verification` → substitui `tokens_usuario`; acrescente `session`.
- Atualize o ER/modelo físico do projeto para refletir isso **depois da aprovação**.
- Gere a referência com `@better-auth/cli generate`, adapte nomes e **passe a mantê-la manualmente** em `src/db/schema/auth.ts`.
- Estado atual: `src/db/schema/auth.ts` contém um **rascunho** (`usuarios`, `sessoes`, `contas`, `verificacoes`) seguindo estas regras. **Nenhuma migração foi gerada nem aplicada**; isso só acontece após a aprovação.

### Fluxo obrigatório de alteração estrutural

1. Editar o schema em `src/db/schema/`.
2. `db:generate` (use `--name` descritivo).
3. **Revisar o SQL gerado** (renomeações viram drop/create se mal interpretadas).
4. Commitar schema **e** `drizzle/` no mesmo commit.
5. `db:migrate` na branch Neon `homologacao` (o `.env` local aponta para ela); depois teste; depois `production` (antes do deploy da aplicação).
6. `db:check` na CI para garantir schema ↔ histórico sincronizados.

Proibido: `drizzle-kit push` em ambientes compartilhados; editar migração já aplicada; alterar tabela pelo painel do Neon. Correção = **nova migração** (Drizzle não tem *down*). Use `DATABASE_URL_DIRECT` para migrar.

## Exemplos de código

### Cliente (sem singleton)

```ts
// src/db/client.ts — driver pg (node-postgres)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle({ client: pool, schema });
  return { db, close: () => pool.end() };   // createApp().close() encerra o pool
}
export type Database = ReturnType<typeof createDb>["db"];
```

### Schema: categorias

```ts
// src/db/schema/categories.ts
import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, char, timestamp, check, uniqueIndex } from "drizzle-orm/pg-core";
import { transactionTypes } from "@/shared/enums";
import { users } from "./auth";

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

export const categories = pgTable(
  "categorias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("usuario_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("nome", { length: 50 }).notNull(),
    type: varchar("tipo", { length: 10 }).notNull(),
    color: char("cor", { length: 7 }).notNull(),
    icon: varchar("icone", { length: 40 }),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    check("categorias_tipo_chk", sql`${t.type} in (${inList(transactionTypes)})`),
    // unicidade por usuário/tipo/nome — proposta; alinhar com o ER [PENDENTE DE DEFINIÇÃO]
    uniqueIndex("categorias_usuario_tipo_nome_uq").on(t.userId, t.type, t.name),
  ],
);
```

### Schema: transações (RNF02)

```ts
// src/db/schema/transactions.ts
import { sql } from "drizzle-orm";
import {
  pgTable, uuid, varchar, numeric, date as dateColumn, timestamp, check, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { transactionTypes, transactionNatures, transactionOrigins } from "@/shared/enums";

export const transactions = pgTable(
  "transacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("usuario_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("categoria_id").references(() => categories.id, { onDelete: "set null" }), // RNF02
    valueSourceId: uuid("fonte_valor_id").references(() => valueSources.id, { onDelete: "set null" }),
    recurrenceId: uuid("recorrencia_id").references(() => recurrences.id, { onDelete: "set null" }),
    dataOperationId: uuid("operacao_dados_id").references(() => dataOperations.id, { onDelete: "set null" }),
    type: varchar("tipo", { length: 10 }).notNull(),
    nature: varchar("natureza", { length: 10 }),          // nulo para receitas
    description: varchar("descricao", { length: 160 }).notNull(),
    amount: numeric("valor", { precision: 14, scale: 2 }).notNull(),   // string no TypeScript
    date: dateColumn("data_transacao", { mode: "string" }).notNull(),
    status: varchar("status", { length: 10 }).notNull(),  // valores [PENDENTE DE DEFINIÇÃO]
    origin: varchar("origem", { length: 12 }).notNull(),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("transacoes_usuario_data_idx").on(t.userId, t.date),
    check("transacoes_valor_chk", sql`${t.amount} > 0`),
    check("transacoes_tipo_chk", sql`${t.type} in (${inList(transactionTypes)})`),
    check("transacoes_natureza_chk", sql`${t.nature} is null or ${t.nature} in (${inList(transactionNatures)})`),
    check("transacoes_origem_chk", sql`${t.origin} in (${inList(transactionOrigins)})`),
    // idempotência da projeção (RF04): proposta; alinhar com o ER [PENDENTE DE DEFINIÇÃO]
    uniqueIndex("transacoes_recorrencia_data_uq").on(t.recurrenceId, t.date).where(sql`${t.recurrenceId} is not null`),
  ],
);
```

`recurrences` (`recorrencias`), `valueSources` (`fontes_valor`), `dataOperations` (`importacoes_exportacoes`) e `importErrors` (`importacao_erros`) seguem o modelo físico do projeto com as mesmas regras (uuid, `usuario_id`, `timestamptz`, `numeric(14,2)`).

### Schema: usuários (alinhado ao Better Auth)

```ts
// src/db/schema/auth.ts (trecho) — demais tabelas: gerar via CLI e adaptar
export const users = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("nome", { length: 120 }).notNull(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  emailVerified: boolean("email_verificado").notNull().default(false),
  image: text("imagem"),                                    // exigido por login social; diverge do ER
  active: boolean("ativo").notNull().default(true),         // additionalField
  lastLoginAt: timestamp("ultimo_login_em", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
```

### `drizzle.config.ts` (exceção documentada: lê `process.env`)

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
```

### Repositório (sempre filtra por `userId`)

```ts
// src/modules/categories/categories.repository.ts
export interface CategoriesRepository {
  listByUser(userId: string): Promise<Category[]>;
  findById(userId: string, id: string): Promise<Category | null>;
  insert(userId: string, data: CreateCategoryInput): Promise<Category>;
  update(userId: string, id: string, data: UpdateCategoryInput): Promise<Category | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export function createCategoriesRepository(db: Database): CategoriesRepository {
  return {
    listByUser: (userId) =>
      db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.name)),

    async findById(userId, id) {
      const [row] = await db.select().from(categories)
        .where(and(eq(categories.id, id), eq(categories.userId, userId))).limit(1);
      return row ?? null;
    },

    async insert(userId, data) {
      try {
        const [row] = await db.insert(categories).values({ ...data, userId }).returning();
        if (!row) throw new Error("insert não retornou linha");
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("Já existe categoria com este nome e tipo.");
        throw error;
      }
    },

    async update(userId, id, data) {
      const [row] = await db.update(categories).set(data)
        .where(and(eq(categories.id, id), eq(categories.userId, userId))).returning();
      return row ?? null;
    },

    async delete(userId, id) {
      const rows = await db.delete(categories)
        .where(and(eq(categories.id, id), eq(categories.userId, userId)))
        .returning({ id: categories.id });
      return rows.length > 0;
    },
  };
}
```

```ts
// src/shared/db-errors.ts — o Drizzle pode encapsular o erro do driver em `cause`
export function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined);
  return code(error) === "23505" || code((error as { cause?: unknown })?.cause) === "23505";
}
```

### Dashboard (RF05): agregação exata no SQL

```ts
const [row] = await db
  .select({
    income: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'income'), 0)`,
    fixedExpenses: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'expense' and ${transactions.nature} = 'fixed'), 0)`,
    variableExpenses: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'expense' and ${transactions.nature} = 'variable'), 0)`,
    balance: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else -${transactions.amount} end), 0)`,
  })
  .from(transactions)
  .where(and(eq(transactions.userId, userId), gte(transactions.date, range.start), lt(transactions.date, range.endExclusive)));
```

Resposta da API: `{ "month": "2026-11", "income": "5000.00", "fixedExpenses": "1800.00", "variableExpenses": "950.40", "balance": "2249.60" }`.

### Funções puras de data (RF04, RF05)

```ts
// src/shared/dates.ts
const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();   // month: 1–12
}

export function monthRange(month: string): { start: string; endExclusive: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return { start: `${y}-${pad(m)}-01`, endExclusive: `${next.y}-${pad(next.m)}-01` };
}

export function isRealCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Datas (YYYY-MM-DD) das ocorrências de uma recorrência, ajustando o dia em meses curtos. */
export function projectDates(input: {
  startDate: string; endDate: string | null; dueDay: number; months: number;
}): string[] {
  const [startYear, startMonth] = input.startDate.split("-").map(Number) as [number, number];
  const dates: string[] = [];
  for (let i = 0; i < input.months; i++) {
    const index = startMonth - 1 + i;
    const year = startYear + Math.floor(index / 12);
    const month = (index % 12) + 1;
    const day = Math.min(input.dueDay, daysInMonth(year, month));
    const date = `${year}-${pad(month)}-${pad(day)}`;
    if (date < input.startDate) continue;
    if (input.endDate && date > input.endDate) break;
    dates.push(date);
  }
  return dates;
}
```

### Projeção de despesa fixa (RF04) em um único `INSERT`

```ts
async function materialize(db: Database, recurrence: Recurrence, months: number) {
  const dates = projectDates({
    startDate: recurrence.startDate, endDate: recurrence.endDate, dueDay: recurrence.dueDay, months,
  });
  if (dates.length === 0) return 0;
  const rows = await db.insert(transactions)
    .values(dates.map((date) => ({
      userId: recurrence.userId, recurrenceId: recurrence.id, categoryId: recurrence.categoryId,
      type: recurrence.type, nature: "fixed" as const, description: recurrence.description,
      amount: recurrence.amount, date, status: "pending", origin: "recurrence" as const,
    })))
    .onConflictDoNothing()                               // idempotente com o índice único
    .returning({ id: transactions.id });
  return rows.length;
}
```

### Seed (substitui o `flask shell` para dados de dev)

```ts
// src/db/seed/index.ts — idempotente; NUNCA em produção
const config = loadConfig();
if (config.env === "production") throw new Error("Seed bloqueado em produção.");
const { db } = createDb(config.databaseUrl);
// 1) criar usuário de dev via Better Auth (não insira hash manualmente)
// 2) inserir categorias padrão com onConflictDoNothing
```

## Boas práticas e anti-padrões

| Faça | Evite |
|---|---|
| Schema Drizzle como fonte única | Criar tabela no painel do Neon |
| Migração gerada, revisada e versionada | `drizzle-kit push` em dev/prod compartilhados |
| `numeric` + string + soma no SQL | `float`/`number` para dinheiro |
| `ON DELETE SET NULL` em `categoria_id` | Apagar transações ao apagar categoria |
| Toda query com `userId` | Buscar por `id` sem escopo do usuário |
| `date` como string `YYYY-MM-DD` | `new Date("2026-11-05")` (desloca fuso) |
| CHECK constraints a partir de `shared/enums` | Enum duplicado em Zod, TS e SQL à mão |
| Operação multi-linha atômica | `forEach` com vários `insert` sem atomicidade |
| Nova migração para corrigir | Editar migração já aplicada |

## Checklist de conformidade

- [ ] Toda mudança estrutural passou por schema → `db:generate` → revisão → commit → `db:migrate`.
- [ ] `src/db/schema` e `drizzle/` estão sincronizados (`db:check` limpo).
- [ ] PKs são `uuid`; datas de transação são `date`; dinheiro é `numeric(14,2)`.
- [ ] `transacoes.categoria_id` usa `ON DELETE SET NULL` e há teste de integração.
- [ ] Nenhuma tabela foi criada ou alterada manualmente no Neon.
- [ ] Nenhuma coluna `senha_hash` própria foi criada (hash no Better Auth).
- [ ] Repositórios nunca consultam sem `userId`.
- [ ] `DATABASE_URL` não é exposta ao frontend.
