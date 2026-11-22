import { afterAll, describe, expect, it } from "vitest";
import { dueDateIn, monthOf, shiftMonth, todayIn } from "@/shared/dates";
import { setupIntegration } from "./support";

const it_ = setupIntegration();
afterAll(() => it_.teardown());

const today = todayIn(new Date());
const thisMonth = monthOf(today);

async function defaults(api: Awaited<ReturnType<typeof it_.signUp>>["api"]) {
  const categories = (await api.get("/api/v1/categories")).data.data as Array<{
    id: string;
    name: string;
    type: string;
  }>;
  const accounts = (await api.get("/api/v1/value-sources")).data.data as Array<{ id: string; name: string }>;
  const cat = (name: string) => categories.find((c) => c.name === name)?.id as string;
  return { categories, accounts, cat, wallet: accounts[0]?.id as string };
}

describe("cadastro", () => {
  it("cria as categorias padrão e a conta Carteira", async () => {
    const { api } = await it_.signUp();
    const { categories, accounts } = await defaults(api);
    expect(categories).toHaveLength(10);
    expect(categories.map((c) => c.name)).toContain("Alimentação");
    expect(categories[0]?.name).toBe("Alimentação"); // ordem alfabética pt-BR
    expect(accounts).toMatchObject([
      { name: "Carteira", type: "carteira", initialBalance: "0.00", currentBalance: "0.00" },
    ]);
  });
});

describe("categorias (RF02) e RNF02", () => {
  it("CRUD, 409 com o campo e exclusão mantendo a transação", async () => {
    const { api } = await it_.signUp();
    const created = await api.post("/api/v1/categories", {
      name: "Pets",
      type: "despesa",
      color: "#AA5500",
      icon: "paw",
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("Location")).toBe(`/api/v1/categories/${created.data.id}`);

    const dup = await api.post("/api/v1/categories", { name: "Pets", type: "despesa", color: "#000000" });
    expect(dup.status).toBe(409);
    expect(dup.data.error.details).toEqual([{ path: "name", message: "Já existe uma categoria com este nome." }]);
    // mesmo nome em outro tipo é permitido (uq por usuário + tipo + nome)
    expect((await api.post("/api/v1/categories", { name: "Pets", type: "receita", color: "#000000" })).status).toBe(
      201,
    );

    const updated = await api.put(`/api/v1/categories/${created.data.id}`, {
      name: "Animais",
      color: "#112233",
      icon: null,
    });
    expect(updated.data).toMatchObject({ name: "Animais", type: "despesa", icon: null });

    const tx = await api.post("/api/v1/transactions", {
      type: "despesa",
      nature: "variavel",
      description: "Ração",
      amount: "120.5",
      date: today,
      categoryId: created.data.id,
    });
    expect(tx.status).toBe(201);
    expect(tx.data.amount).toBe("120.50");

    expect((await api.delete(`/api/v1/categories/${created.data.id}`)).status).toBe(204);
    const after = await api.get(`/api/v1/transactions/${tx.data.id}`);
    expect(after.data).toMatchObject({ categoryId: null, amount: "120.50", description: "Ração" });
    expect((await api.get(`/api/v1/categories/${created.data.id}`)).status).toBe(404);
  });
});

describe("isolamento entre usuários", () => {
  it("recurso de outro usuário é 404 e referência alheia no corpo é 400", async () => {
    const a = await it_.signUp("A");
    const b = await it_.signUp("B");
    const da = await defaults(a.api);
    const tx = await a.api.post("/api/v1/transactions", {
      type: "receita",
      description: "Salário",
      amount: "100.00",
      date: today,
      categoryId: da.cat("Salário"),
    });
    expect((await b.api.get(`/api/v1/transactions/${tx.data.id}`)).status).toBe(404);
    expect((await b.api.delete(`/api/v1/transactions/${tx.data.id}`)).status).toBe(404);
    expect((await b.api.get(`/api/v1/value-sources/${da.wallet}`)).status).toBe(404);

    const foreign = await b.api.post("/api/v1/transactions", {
      type: "receita",
      description: "x",
      amount: "1.00",
      date: today,
      categoryId: da.cat("Salário"),
      valueSourceId: da.wallet,
    });
    expect(foreign.status).toBe(400);
    expect(foreign.data.error.details.map((d: { path: string }) => d.path)).toEqual(["categoryId", "valueSourceId"]);
  });
});

describe("transações (RF03, RF06) e saldo das contas", () => {
  it("regras, extrato com filtros, summary, saldo por dia e saldo da conta", async () => {
    const { api } = await it_.signUp();
    const d = await defaults(api);
    const account = await api.post("/api/v1/value-sources", {
      name: "Nubank",
      type: "conta_corrente",
      institution: "Nubank",
      initialBalance: "-150.00",
    });
    expect(account.status).toBe(201);
    expect(account.data).toMatchObject({ initialBalance: "-150.00", currentBalance: "-150.00", active: true });
    expect((await api.post("/api/v1/value-sources", { ...account.data, id: undefined })).status).toBe(400); // strict
    expect(
      (await api.post("/api/v1/value-sources", { name: "Nubank", type: "outro", initialBalance: "0" })).status,
    ).toBe(409);

    const wrongType = await api.post("/api/v1/transactions", {
      type: "receita",
      description: "x",
      amount: "1.00",
      date: today,
      categoryId: d.cat("Moradia"),
    });
    expect(wrongType.status).toBe(400);
    expect(wrongType.data.error.details).toEqual([{ path: "categoryId", message: "Tipo da categoria incompatível." }]);

    const day1 = `${thisMonth}-01`;
    const post = (body: object) => api.post("/api/v1/transactions", { date: day1, ...body });
    await post({ type: "receita", description: "Salário", amount: "1000.00", valueSourceId: account.data.id });
    await post({
      type: "despesa",
      nature: "variavel",
      description: "Mercado Pão de Açúcar",
      amount: "200.00",
      valueSourceId: account.data.id,
      categoryId: d.cat("Alimentação"),
    });
    await post({
      type: "despesa",
      nature: "fixa",
      description: "Internet",
      amount: "99.90",
      status: "pendente",
      valueSourceId: account.data.id,
    });

    // saldo: só efetivadas → -150 + 1000 - 200
    expect((await api.get(`/api/v1/value-sources/${account.data.id}`)).data.currentBalance).toBe("650.00");

    const page = await api.get(`/api/v1/transactions?month=${thisMonth}&pageSize=2`);
    expect(page.data.meta).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      summary: { income: "1000.00", expense: "299.90", balance: "700.10" },
      dayTotals: { [day1]: "700.10" },
    });
    expect(page.data.data[0].description).toBe("Internet"); // último lançado primeiro no mesmo dia

    const search = await api.get(`/api/v1/transactions?month=${thisMonth}&q=${encodeURIComponent("ACUCAR")}`);
    expect(search.data.data.map((t: { description: string }) => t.description)).toEqual(["Mercado Pão de Açúcar"]);
    const pending = await api.get(`/api/v1/transactions?month=${thisMonth}&status=pendente&type=despesa`);
    expect(pending.data.meta.total).toBe(1);
    const byCategory = await api.get(`/api/v1/transactions?month=${thisMonth}&categoryIds=${d.cat("Alimentação")}`);
    expect(byCategory.data.meta.summary.expense).toBe("200.00");
    const byAccount = await api.get(`/api/v1/transactions?valueSourceIds=${account.data.id}&pageSize=10`);
    expect(byAccount.data.meta.total).toBe(3);

    // PUT substitui; a origem continua manual
    const internet = page.data.data[0];
    const edited = await api.put(`/api/v1/transactions/${internet.id}`, {
      type: "despesa",
      nature: "fixa",
      description: "Internet fibra",
      amount: "99.90",
      date: day1,
      status: "efetivada",
      categoryId: null,
      valueSourceId: account.data.id,
    });
    expect(edited.data).toMatchObject({ description: "Internet fibra", status: "efetivada", origin: "manual" });
    expect((await api.get(`/api/v1/value-sources/${account.data.id}`)).data.currentBalance).toBe("550.10");

    // desativar conta (sem DELETE no MVP)
    const off = await api.put(`/api/v1/value-sources/${account.data.id}`, {
      name: "Nubank",
      type: "conta_corrente",
      institution: null,
      initialBalance: "-150.00",
      active: false,
    });
    expect(off.data).toMatchObject({ active: false, institution: null, currentBalance: "550.10" });
  });
});

describe("despesas fixas (RF04)", () => {
  it("materializa do início ao mês corrente, sem recriar ocorrência excluída, e mantém lançamentos ao encerrar", async () => {
    const { api } = await it_.signUp();
    const d = await defaults(api);
    const start = `${shiftMonth(thisMonth, -2)}-10`;
    const created = await api.post("/api/v1/recurrences", {
      description: "Aluguel",
      amount: "1200.00",
      dueDay: 10,
      startDate: start,
      endDate: null,
      categoryId: d.cat("Moradia"),
      valueSourceId: d.wallet,
    });
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({ type: "despesa", active: true, amount: "1200.00" });

    const list = async () =>
      (await api.get(`/api/v1/transactions?from=${start}&to=${dueDateIn(31, thisMonth)}&pageSize=50`)).data
        .data as Array<{
        id: string;
        date: string;
        status: string;
        nature: string;
        origin: string;
        recurrenceId: string | null;
      }>;
    const occurrences = await list();
    expect(occurrences.map((t) => t.date).sort()).toEqual([
      start,
      `${shiftMonth(thisMonth, -1)}-10`,
      `${thisMonth}-10`,
    ]);
    expect(occurrences.every((t) => t.status === "pendente" && t.nature === "fixa" && t.origin === "recorrencia")).toBe(
      true,
    );

    // excluir uma ocorrência: a leitura seguinte não a recria
    const middle = occurrences.find((t) => t.date.startsWith(shiftMonth(thisMonth, -1))) as { id: string };
    expect((await api.delete(`/api/v1/transactions/${middle.id}`)).status).toBe(204);
    expect(await list()).toHaveLength(2);

    const detail = await api.get(`/api/v1/recurrences/${created.data.id}`);
    expect(detail.data.schedule).toHaveLength(6);
    expect(detail.data.schedule[0]).toMatchObject({ month: thisMonth, status: "pendente" });
    expect(detail.data.schedule[1]).toMatchObject({ month: shiftMonth(thisMonth, 1), status: "prevista" });

    // tipo é imutável no PUT; categoria de receita é recusada
    const bad = await api.put(`/api/v1/recurrences/${created.data.id}`, {
      description: "Aluguel",
      amount: "1300.00",
      dueDay: 10,
      startDate: start,
      endDate: null,
      categoryId: d.cat("Salário"),
      valueSourceId: d.wallet,
      active: true,
    });
    expect(bad.status).toBe(400);

    // pausar não materializa nem aparece em "próximas"
    const paused = await api.put(`/api/v1/recurrences/${created.data.id}`, {
      description: "Aluguel",
      amount: "1300.00",
      dueDay: 10,
      startDate: start,
      endDate: null,
      categoryId: d.cat("Moradia"),
      valueSourceId: d.wallet,
      active: false,
    });
    expect(paused.data).toMatchObject({ active: false, amount: "1300.00" });
    const summary = await api.get(`/api/v1/dashboard/summary?month=${thisMonth}`);
    expect(summary.data.upcoming).toEqual([]);

    // encerrar: lançamentos ficam com recurrenceId null (RNF02)
    expect((await api.delete(`/api/v1/recurrences/${created.data.id}`)).status).toBe(204);
    const remaining = await list();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((t) => t.recurrenceId === null)).toBe(true);
  });

  it('"repetir todo mês" cria a recorrência e ocupa a ocorrência do próprio mês', async () => {
    const { api } = await it_.signUp();
    const date = `${shiftMonth(thisMonth, -1)}-03`;
    const created = await api.post("/api/v1/transactions", {
      type: "despesa",
      nature: "variavel",
      description: "Academia",
      amount: "89.90",
      date,
      status: "efetivada",
      repeatMonthly: { dueDay: 15, endDate: null },
    });
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({ date, nature: "fixa", origin: "recorrencia", status: "efetivada" });

    const recurrences = (await api.get("/api/v1/recurrences")).data.data;
    expect(recurrences).toMatchObject([{ description: "Academia", dueDay: 15, startDate: date }]);
    const txs = (await api.get(`/api/v1/transactions?from=${date}&to=${dueDateIn(31, thisMonth)}`)).data.data;
    expect(txs.map((t: { date: string }) => t.date).sort()).toEqual([date, `${thisMonth}-15`]);

    const invalid = await api.post("/api/v1/transactions", {
      type: "receita",
      description: "Bolsa",
      amount: "10.00",
      date: today,
      repeatMonthly: { dueDay: 1, endDate: "2000-01-01" },
    });
    expect(invalid.status).toBe(400);
  });
});

describe("início (RF05)", () => {
  it("cards, categorias, histórico de 6 meses e próximas despesas fixas", async () => {
    const { api } = await it_.signUp();
    const d = await defaults(api);
    const day = `${thisMonth}-01`;
    const post = (body: object) => api.post("/api/v1/transactions", { date: day, ...body });
    await post({ type: "receita", description: "Salário", amount: "5000.00", categoryId: d.cat("Salário") });
    await post({ type: "receita", description: "Freela", amount: "500.00", status: "pendente" });
    await post({
      type: "despesa",
      nature: "variavel",
      description: "Mercado",
      amount: "300.00",
      categoryId: d.cat("Alimentação"),
    });
    await post({ type: "despesa", nature: "fixa", description: "Luz", amount: "150.00", status: "pendente" });
    await api.post("/api/v1/transactions", {
      date: `${shiftMonth(thisMonth, -1)}-05`,
      type: "despesa",
      nature: "variavel",
      description: "Mês passado",
      amount: "42.00",
    });

    const s = (await api.get(`/api/v1/dashboard/summary?month=${thisMonth}`)).data;
    expect(s).toMatchObject({
      month: thisMonth,
      income: "5500.00",
      fixedExpenses: "150.00",
      variableExpenses: "300.00",
      paidIncome: "5000.00",
      paidExpenses: "300.00",
      balance: "4700.00",
      forecast: "5050.00",
    });
    expect(s.byCategory).toEqual(
      expect.arrayContaining([
        { type: "despesa", categoryId: d.cat("Alimentação"), total: "300.00" },
        { type: "despesa", categoryId: null, total: "150.00" },
        { type: "receita", categoryId: null, total: "500.00" },
      ]),
    );
    expect(s.history).toHaveLength(6);
    expect(s.history.at(-1)).toEqual({ month: thisMonth, income: "5500.00", expense: "450.00" });
    expect(s.history.at(-2)).toEqual({ month: shiftMonth(thisMonth, -1), income: "0.00", expense: "42.00" });
    expect(s.history[0]).toEqual({ month: shiftMonth(thisMonth, -5), income: "0.00", expense: "0.00" });
  });
});

describe("importar, exportar e notificações (RF07)", () => {
  it("confirma a importação, registra o histórico, exporta o CSV e gera notificações", async () => {
    const { api } = await it_.signUp();
    const d = await defaults(api);
    const row = {
      date: `${thisMonth}-02`,
      description: "Feira",
      amount: "45.00",
      type: "despesa",
      nature: "variavel",
      status: "efetivada",
      categoryId: d.cat("Alimentação"),
      valueSourceId: d.wallet,
    };

    const invalid = await api.post("/api/v1/imports", {
      fileName: "x.csv",
      format: "csv",
      rows: [{ ...row, categoryId: d.cat("Salário") }],
      errors: [],
    });
    expect(invalid.status).toBe(400);
    expect(invalid.data.error.details[0].path).toBe("rows.0.categoryId");

    const imported = await api.post("/api/v1/imports", {
      fileName: "extrato.csv",
      format: "csv",
      rows: [
        row,
        { ...row, description: "Salário", type: "receita", nature: null, amount: "1000.00", categoryId: null },
      ],
      errors: [{ line: 4, field: "valor", message: "Valor inválido.", content: "x;y" }],
    });
    expect(imported.status).toBe(201);
    expect(imported.data).toMatchObject({
      type: "importacao",
      format: "csv",
      status: "concluida_com_erros",
      totalRows: 3,
      successRows: 2,
      errorRows: 1,
      periodStart: row.date,
      periodEnd: row.date,
    });
    const txs = (await api.get(`/api/v1/transactions?month=${thisMonth}`)).data.data;
    expect(txs.every((t: { origin: string }) => t.origin === "importacao")).toBe(true);

    const exported = await api.get(`/api/v1/exports/transactions?month=${thisMonth}&format=csv`);
    expect(exported.status).toBe(200);
    expect(exported.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(exported.headers.get("Content-Disposition")).toBe(`attachment; filename="financecontrol-${thisMonth}.csv"`);
    expect(exported.data).toContain("Feira;45,00;despesa;variavel;efetivada;Alimentação;Carteira");

    const history = (await api.get("/api/v1/data-operations")).data.data;
    expect(history.map((o: { type: string }) => o.type)).toEqual(["exportacao", "importacao"]);

    const notifications = await api.get("/api/v1/notifications?pageSize=2");
    expect(notifications.data.meta).toMatchObject({ page: 1, pageSize: 2, unread: 2, total: 2 });
    expect(notifications.data.data.map((n: { type: string }) => n.type)).toEqual([
      "exportacao_pronta",
      "importacao_concluida",
    ]);
    const first = notifications.data.data[0];
    const read = await api.put(`/api/v1/notifications/${first.id}`, { status: "lida" });
    expect(read.data).toMatchObject({ id: first.id, status: "lida" });
    expect(read.data.readAt).not.toBeNull();
    expect((await api.put(`/api/v1/notifications/${first.id}`, { status: "enviada" })).status).toBe(400);
    expect((await api.put("/api/v1/notifications", { status: "lida" })).data).toEqual({ updated: 1 });
    expect((await api.get("/api/v1/notifications")).data.meta.unread).toBe(0);
  });

  it("lançar transação e criar categoria geram notificações do sistema", async () => {
    const { api } = await it_.signUp();
    await api.post("/api/v1/categories", { name: "Viagem", type: "despesa", color: "#123456" });
    await api.post("/api/v1/transactions", {
      type: "despesa",
      nature: "variavel",
      description: "Passagem",
      amount: "1234.50",
      date: "2026-11-05",
    });
    const list = (await api.get("/api/v1/notifications")).data.data;
    expect(list.map((n: { title: string; message: string }) => [n.title, n.message])).toEqual([
      ["Despesa registrada", "Passagem · R$ 1.234,50 em 05/11/2026"],
      ["Categoria criada", "Viagem (despesa)"],
    ]);
  });
});
