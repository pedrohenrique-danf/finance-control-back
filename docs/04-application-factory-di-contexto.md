# 04 — Application Factory, Injeção de Dependência e Contextos

> Unidade 4 (importações circulares, Application Factory, lazy initialization, IoC/DI, ciclo de vida, Application Context × Request Context, monólito modular).

## Objetivo

Definir como a aplicação é construída (`createApp`), como dependências são injetadas, como evitar ciclos de importação e como separar o estado da aplicação do estado de cada requisição.

## Escopo

**Cobre:** composition root, DI manual, regras anti-ciclo, ciclo de vida, `RequestContext`, monólito modular.
**Não cobre:** detalhes de Better Auth (07) e de Drizzle (06). O adaptador do framework HTTP (**Hono**) está descrito ao final deste arquivo.

## Regras e padrões

### O problema (equivalente ao `app` global do Flask)

Instanciar dependências no topo de um módulo (`export const db = connect()`) e importá-las em todo lugar cria acoplamento global e ciclos. Solução: **nenhum módulo cria dependências globais**; `createApp(config)` as cria sob demanda e as injeta.

### As três fases do ciclo de vida

| Fase | O que acontece | Onde |
|---|---|---|
| 1. Setup | valida config, cria `db`, `auth`, módulos, rotas | `createApp()` |
| 2. Contexto da aplicação | estado compartilhado e **imutável**: `config`, `db`, `auth`, `logger` | fechado dentro de `createApp` (closure) |
| 3. Contexto da requisição | estado **efêmero** de uma requisição: `requestId`, `user`, `now`, `logger` | `RequestContext` criado em `dispatch` e passado por argumento |

Regra de ouro: todo `RequestContext` pertence a uma aplicação; nem toda tarefa (seed, migração, script) tem requisição.
Não use variável global para guardar dados da requisição (risco de vazamento entre requisições concorrentes). Passe `ctx` explicitamente.

### Injeção de dependência (IoC)

- DI **manual por parâmetro** (sem biblioteca de container). Módulos declaram o que precisam; `createApp` fornece.
- Módulos recebem **interfaces** (ex.: `CategoriesService`), não implementações concretas de outro domínio.
- Overrides para teste: `createApp(config, { db, logger, auth })`.

### Regras anti-ciclo

1. Direção única: `routes → service → repository → db/schema`; `shared/` não importa de `modules/`.
2. Módulos conversam por **interfaces injetadas**, nunca importando arquivos internos.
3. `db/schema` não importa de `modules/`.
4. Proibido contornar ciclo com import tardio/no fim do arquivo. Extraia a interface ou a função compartilhada para `shared/` ou inverta a dependência via parâmetro.
5. Barrel (`index.ts`) apenas na borda de módulo.

### Monólito modular

- Um processo, um deploy, módulos coesos por domínio (`categories`, `transactions`, `recurrences`, `dashboard`, `data-exchange`, `auth`).
- Não introduza microsserviços. Isso só se justificaria com times independentes ou gargalo computacional isolado — nenhum se aplica ao MVP.
- Docker/Redis não são parte da stack definida; não os adicione.

## Exemplos de código

### Módulo de domínio (composition local)

```ts
// src/modules/categories/categories.module.ts
export function createCategoriesModule(deps: { db: Database }) {
  const repository = createCategoriesRepository(deps.db);
  const service = createCategoriesService({ repository });
  return { service, routes: createCategoriesRoutes(service) };
}
```

### Dependência entre módulos via interface

```ts
// src/modules/transactions/transactions.service.ts
import type { CategoriesService } from "@/modules/categories";   // API pública, não arquivo interno

export function createTransactionsService(deps: {
  repository: TransactionsRepository;
  categories: Pick<CategoriesService, "find">;   // find() devolve Category | null, sem lançar
}) {
  return {
    async create(userId: string, input: CreateTransactionInput) {
      if (input.categoryId) {
        const category = await deps.categories.find(userId, input.categoryId); // escopo do usuário
        if (!category) {
          throw new ValidationError([{ path: "categoryId", message: "Categoria não encontrada." }]);
        }
        if (category.type !== input.type) {
          throw new ValidationError([
            { path: "categoryId", message: "Tipo da categoria incompatível com o tipo da transação." },
          ]);
        }
      }
      return deps.repository.insert(userId, { ...input, origin: "manual", status: "paid" }); // status: [PENDENTE DE DEFINIÇÃO]
    },
  };
}
```

> Referência inexistente **dentro do corpo** de um POST é erro de entrada: retorne **400** com `details`, não 404. O 404 é reservado ao recurso identificado pela URI.

### Composition root: `createApp`

```ts
// src/app/create-app.ts
export interface AppOverrides {
  db?: Database;
  logger?: Logger;
  auth?: Auth;
}

export function createApp(config: AppConfig, overrides: AppOverrides = {}) {
  const logger = overrides.logger ?? createConsoleLogger(config.logLevel);
  const db = overrides.db ?? createDb(config.databaseUrl).db;
  const auth = overrides.auth ?? createAuth({ db, config });

  const categories = createCategoriesModule({ db });
  const transactions = createTransactionsModule({ db, categories: categories.service });
  const recurrences = createRecurrencesModule({ db, categories: categories.service });
  const dashboard = createDashboardModule({ db });
  const dataExchange = createDataExchangeModule({ db });

  const routes: RouteDefinition[] = [
    healthRoute,
    ...categories.routes,
    ...transactions.routes,
    ...recurrences.routes,
    ...dashboard.routes,
    ...dataExchange.routes,
  ];

  async function dispatch(
    route: RouteDefinition,
    req: Request,
    params: Record<string, string>,
  ): Promise<Response> {
    const requestId = crypto.randomUUID();                 // sempre gerado no servidor
    try {
      const user = await resolveUser(auth, req);           // contexto da requisição
      if (route.access === "private" && !user) throw new UnauthenticatedError();
      const ctx: RequestContext = { requestId, user, logger, now: new Date() };
      const res = await route.handler(req, ctx, params);
      res.headers.set("X-Request-Id", requestId);
      return res;
    } catch (error) {
      return toErrorResponse(error, { requestId, logger });
    }
  }

  return {
    config,
    routes,
    dispatch,                                              // usado pelo adaptador do framework
    authHandler: (req: Request) => auth.handler(req),      // monte em /api/auth/*
    async close() { /* encerrar recursos, se o driver exigir */ },
  };
}

export type App = ReturnType<typeof createApp>;
```

### Resolução de sessão (contexto da requisição)

```ts
// src/modules/auth/resolve-user.ts
export async function resolveUser(auth: Auth, req: Request): Promise<RequestContext["user"]> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session
    ? { id: session.user.id, email: session.user.email, name: session.user.name }
    : null;
}
```

### Adaptador do framework (Hono)

O Hono só aparece no adaptador e em `main.ts`. Rotas, serviços e repositórios continuam usando `Request`/`Response` padrão.

```ts
// src/app/http/hono-adapter.ts
export function createHonoServer(app: App): Hono {
  const hono = new Hono();
  if (app.config.corsOrigins.length > 0) {
    hono.use("/api/*", cors({ origin: app.config.corsOrigins, credentials: true /* ... */ }));
  }
  hono.on(["GET", "POST"], "/api/auth/*", (c) => app.authHandler(c.req.raw));
  for (const route of app.routes) {
    hono.on(route.method, route.path, (c) => app.dispatch(route, c.req.raw, c.req.param()));
  }
  hono.notFound(() => app.notFound());     // 404 no envelope padrão
  hono.onError((error) => app.onError(error));
  return hono;
}
```

```ts
// src/main.ts
const app = createApp(loadConfig());
const server = serve({ fetch: createHonoServer(app).fetch, port: app.config.port });
// SIGINT/SIGTERM: server.close() → app.close() (encerra o pool do banco)
```

Em testes, use `createHonoServer(app).request("/api/v1/...")` para exercitar a pilha HTTP sem abrir porta.

### Teste que prova o benefício da factory

```ts
it("cria apps isolados com configurações diferentes", async () => {
  const a = createApp(testConfig, { db: dbA, auth: fakeAuth({ id: "u1" }) });
  const b = createApp(testConfig, { db: dbB, auth: fakeAuth({ id: "u2" }) });
  // cada app tem seu próprio db, sem estado compartilhado
  expect(a.routes.length).toBe(b.routes.length);
});
```

## Boas práticas e anti-padrões

| Faça | Evite |
|---|---|
| `createApp(config, overrides)` | `export const app = ...` / `export const db = ...` globais |
| Passar `ctx` por argumento | Guardar usuário atual em variável de módulo |
| Interfaces entre módulos | Importar `categories.repository.ts` de dentro de `transactions` |
| Efeitos (conexão, listen) só na factory/`main.ts` | Conectar ao banco ao importar um arquivo |
| `requestId` gerado no servidor | Confiar em `X-Request-Id` enviado pelo cliente |
| Monólito modular | Microsserviços, Docker, Redis sem decisão |
| Resolver ciclo extraindo interface | Mover `import` para o fim do arquivo |

## Checklist de conformidade

- [ ] Existe um único composition root (`createApp`) e `main.ts` é o único ponto de entrada.
- [ ] Nenhuma dependência (db, auth, logger) é singleton global.
- [ ] Testes constroem a aplicação com `createApp(testConfig, overrides)`.
- [ ] Módulos dependem de interfaces injetadas e do `index.ts` de outros módulos.
- [ ] Nenhum ciclo de importação (verificar manualmente ou com ferramenta **[PENDENTE DE DEFINIÇÃO]**).
- [ ] `RequestContext` é criado por requisição e nunca compartilhado entre requisições.
- [ ] Rotas `private` são rejeitadas com 401 quando não há sessão.
