// Seed idempotente de desenvolvimento — NUNCA em produção.
// Cria o usuário de demonstração (via Better Auth, que gera as categorias padrão e a Carteira) e, se ele ainda
// não tem transações, grava os dados de demonstração relativos ao mês atual.
import { and, count, eq } from "drizzle-orm";
import { loadConfig } from "@/app/config";
import { createApp } from "@/app/create-app";
import { createDb } from "@/db/client";
import { categories, recurrences, transactions, users, valueSources } from "@/db/schema";
import { TERMS_VERSION } from "@/modules/auth";
import { monthOf, todayIn } from "@/shared/dates";
import { buildDemoData, CATEGORY_NAMES, DEMO_ACCOUNTS } from "./demo-data";

const DEMO_USER = {
  name: "Pessoa Demonstração",
  email: "demo@financecontrol.local",
  password: "Demo-FinanceControl-2026",
};

const config = loadConfig();
if (config.env === "production") throw new Error("Seed bloqueado em produção.");

const { db, close } = createDb(config.databaseUrl);
const app = createApp({ ...config, logLevel: "warn" }, { db });
try {
  let [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_USER.email));
  if (!user) {
    const result = await app.services.auth.api.signUpEmail({ body: { ...DEMO_USER, termsVersion: TERMS_VERSION } });
    user = { id: result.user.id };
    console.info(`Seed: usuário ${DEMO_USER.email} criado.`);
  }
  const userId = user.id;

  const [existing] = await db.select({ total: count() }).from(transactions).where(eq(transactions.userId, userId));
  if ((existing?.total ?? 0) > 0) {
    console.info("Seed: o usuário de demonstração já tem dados; nada a fazer.");
  } else {
    await app.onUserCreated(userId); // garante categorias padrão e Carteira (idempotente)
    const today = todayIn(new Date());
    const demo = buildDemoData(today);

    await db.transaction(async (tx) => {
      // contas: a Carteira padrão recebe o saldo da demonstração
      await tx
        .update(valueSources)
        .set({ initialBalance: "180.00", institution: "Dinheiro" })
        .where(and(eq(valueSources.userId, userId), eq(valueSources.name, "Carteira")));
      await tx
        .insert(valueSources)
        .values(DEMO_ACCOUNTS.filter((a) => a.key !== "carteira").map(({ key: _key, ...a }) => ({ ...a, userId })))
        .onConflictDoNothing();

      const accountRows = await tx
        .select({ id: valueSources.id, name: valueSources.name })
        .from(valueSources)
        .where(eq(valueSources.userId, userId));
      const categoryRows = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, userId));
      const accountId = (key: (typeof DEMO_ACCOUNTS)[number]["key"]) =>
        accountRows.find((a) => a.name === DEMO_ACCOUNTS.find((d) => d.key === key)?.name)?.id ?? null;
      const categoryId = (key: keyof typeof CATEGORY_NAMES) =>
        categoryRows.find((c) => c.name === CATEGORY_NAMES[key])?.id ?? null;

      const recurrenceIds: string[] = [];
      for (const rec of demo.recurrences) {
        const [row] = await tx
          .insert(recurrences)
          .values({
            userId,
            type: "despesa",
            description: rec.description,
            amount: rec.amount,
            dueDay: rec.dueDay,
            startDate: rec.startDate,
            endDate: rec.endDate,
            categoryId: categoryId(rec.category),
            valueSourceId: accountId(rec.account),
            lastMaterializedMonth: `${monthOf(today)}-01`, // o mês atual já vai lançado abaixo
          })
          .returning({ id: recurrences.id });
        recurrenceIds.push(row?.id ?? "");
      }

      await tx.insert(transactions).values(
        demo.transactions.map((t) => ({
          userId,
          type: t.type,
          nature: t.nature,
          description: t.description,
          amount: t.amount,
          date: t.date,
          status: t.status,
          origin: t.recurrence === undefined ? "manual" : "recorrencia",
          recurrenceId: t.recurrence === undefined ? null : (recurrenceIds[t.recurrence] ?? null),
          categoryId: categoryId(t.category),
          valueSourceId: accountId(t.account),
        })),
      );
    });
    console.info(`Seed: ${demo.transactions.length} transações e ${demo.recurrences.length} despesas fixas criadas.`);
  }
  console.info(`Seed: entre com ${DEMO_USER.email} / ${DEMO_USER.password}`);
} finally {
  await close();
}
