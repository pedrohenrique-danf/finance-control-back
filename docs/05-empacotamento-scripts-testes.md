# 05 — Empacotamento, Dependências, Scripts e Testes

> Unidade 5 (projeto como pacote instalável, `pyproject.toml`, dependências de runtime × desenvolvimento, `invoke`, PyTest, fixtures, cobertura).

## Objetivo

Definir o `package.json` (equivalente ao `pyproject.toml`), a separação de dependências, os scripts de automação (equivalente ao `invoke`/`tasks.py`) e a estratégia de testes do backend.

## Escopo

**Cobre:** `package.json`, dependências, scripts, convenção de testes, exemplos de testes unitários, de integração e de fluxo (Playwright), CI mínima.
**Não cobre:** conteúdo do schema (06) nem configuração do Better Auth (07).

## Regras e padrões

### Empacotamento

- `package.json` é a fonte de metadados, dependências e scripts. `"private": true` (não será publicado).
- `"type": "module"` (ES Modules).
- Versão do Node em `engines` (`>=22.16.0`) e `.nvmrc`; gerenciador fixado em `packageManager` (`pnpm@12`).
- **Fixe as versões** das bibliotecas: adicione sempre com `pnpm add --save-exact` (sem `^`, `~` ou `latest`) e versione o `pnpm-lock.yaml`.
- Instalação padronizada para qualquer dev: clonar → `pnpm install` → copiar `.env.example` para `.env` → `pnpm db:migrate` → `pnpm dev`.

### Dependências

| Grupo | Pacotes (definidos) | Observação |
|---|---|---|
| `dependencies` | `hono`, `@hono/node-server`, `drizzle-orm`, `pg`, `better-auth`, `zod` | `pg` é o driver do banco (ver 06) |
| `devDependencies` | `typescript`, `@types/node`, `@types/pg`, `drizzle-kit`, `tsx`, `tsup`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `@biomejs/biome` | |

Não adicione pacote fora desta tabela sem autorização.

### Scripts obrigatórios

| Script | Finalidade | Comando |
|---|---|---|
| `dev` | servidor local com recarga | `tsx watch --env-file-if-exists=.env src/main.ts` |
| `build` | compilação (bundle ESM em `dist/`) | `tsup` |
| `start` | execução em produção | `node --env-file-if-exists=.env dist/main.js` |
| `typecheck` | tipos | `tsc --noEmit` |
| `lint` | análise estática | `biome lint .` |
| `format` / `format:check` | formatação | `biome format --write .` / `biome format .` |
| `check` | lint + formatação + organização de imports | `biome check .` |
| `test` | todos os testes unitários | `vitest run --dir src` |
| `test:integration` | testes com banco real | `vitest run --dir tests/integration` |
| `test:e2e` | fluxos de API | `playwright test` |
| `test:coverage` | cobertura | `vitest run --dir src --coverage` |
| `db:generate` | gerar migração do schema | `drizzle-kit generate` |
| `db:migrate` | aplicar migrações | `drizzle-kit migrate` |
| `db:check` | validar consistência das migrações | `drizzle-kit check` |
| `db:studio` | inspecionar dados (somente dev) | `drizzle-kit studio` |
| `db:seed` | popular dados de desenvolvimento | `tsx --env-file-if-exists=.env src/db/seed/index.ts` |
| `verify` | `typecheck` + `lint` + `test` | encadeado |

### Estratégia de testes

| Nível | O que testa | Ferramenta | Banco |
|---|---|---|---|
| Unitário | serviços (regras), funções puras (datas, dinheiro), config, schemas Zod, pilha HTTP via `createHonoServer(app).request()` | Vitest | nenhum (repositório em memória) |
| Integração | repositórios + constraints do PostgreSQL (FK, unique, `ON DELETE SET NULL`, check) | Vitest | **real**, dedicado a testes **[PENDENTE DE DEFINIÇÃO]** (ex.: branch Neon de teste; nunca `production`) |
| Fluxo (API) | cadastro → login → CRUD completo, 400/401/404 | Playwright (`request`) | real, de teste |

Regras:

- Nunca rode testes de integração contra o banco de produção.
- Isolamento: cada teste cria seu **próprio usuário** (e-mail único). Remover o usuário apaga seus dados em cascata. Não dependa de ordem entre testes.
- Teste **regra de negócio, relacionamentos e integridade** (exigência do projeto), não só o caminho feliz.
- Use fakes em memória, não mocks de implementação.
- Meta de cobertura: **[PENDENTE DE DEFINIÇÃO]**.
- CI mínima: `typecheck → lint → test → test:integration → test:e2e`. Plataforma **[PENDENTE DE DEFINIÇÃO]**.

## Exemplos de código

### `package.json` (ilustrativo)

```jsonc
{
  "name": "finance-control-back",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.15.0",
  "engines": { "node": ">=22.16.0" },
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=.env src/main.ts",
    "build": "tsup",
    "start": "node --env-file-if-exists=.env dist/main.js",
    "typecheck": "tsc --noEmit",
    "lint": "biome lint .",
    "test": "vitest run --dir src",
    "test:integration": "vitest run --dir tests/integration",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx --env-file-if-exists=.env src/db/seed/index.ts",
    "verify": "pnpm typecheck && pnpm lint && pnpm test"
    // lista completa: package.json do repositório
  }
}
```

### `tsconfig.json` (essencial)

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",   // tsx (dev) e tsup (build) resolvem o alias @/
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,                  // tsc só verifica tipos; quem gera dist/ é o tsup
    "paths": { "@/*": ["./src/*"] }
  }
}
```

Com `exactOptionalPropertyTypes`, campos que podem receber `undefined` explícito são declarados como `campo: T | undefined` (ex.: `AppError.details`, `AppConfig.google`).

### Teste unitário de serviço (repositório em memória)

```ts
// src/modules/categories/categories.service.test.ts
import { describe, it, expect } from "vitest"; // com Jest, remova este import
import { createCategoriesService } from "./categories.service";
import { createInMemoryCategoriesRepository } from "./categories.repository.memory";
import { NotFoundError } from "@/shared/errors";

describe("categories service", () => {
  const setup = () => createCategoriesService({ repository: createInMemoryCategoriesRepository() });

  it("cria e lista apenas as categorias do usuário", async () => {
    const service = setup();
    await service.create("user-a", { name: "Lazer", type: "expense", color: "#00AAFF" });
    expect(await service.list("user-a")).toHaveLength(1);
    expect(await service.list("user-b")).toHaveLength(0);
  });

  it("retorna NotFound ao ler categoria de outro usuário", async () => {
    const service = setup();
    const created = await service.create("user-a", { name: "Lazer", type: "expense", color: "#00AAFF" });
    await expect(service.get("user-b", created.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

### Teste unitário de função pura

```ts
import { projectDates } from "@/shared/dates";

it("ajusta o dia de vencimento em meses curtos", () => {
  const dates = projectDates({ startDate: "2026-01-31", endDate: null, dueDay: 31, months: 3 });
  expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
});
```

### Teste de integração (RNF02)

```ts
// tests/integration/category-delete.test.ts
it("mantém a transação ao excluir a categoria (ON DELETE SET NULL)", async () => {
  const { db } = createTestDb();
  const user = await createTestUser(db);                       // helper: insere usuário com e-mail único
  const categories = createCategoriesRepository(db);
  const transactions = createTransactionsRepository(db);

  const category = await categories.insert(user.id, { name: "Mercado", type: "expense", color: "#FF0000" });
  const tx = await transactions.insert(user.id, {
    type: "expense", nature: "variable", description: "Compra", amount: "89.90",
    date: "2026-11-05", categoryId: category.id, origin: "manual", status: "paid",
  });

  await categories.delete(user.id, category.id);

  const after = await transactions.findById(user.id, tx.id);
  expect(after).not.toBeNull();
  expect(after?.categoryId).toBeNull();
  expect(after?.amount).toBe("89.90");                         // valor histórico preservado

  await deleteTestUser(db, user.id);                           // limpeza em cascata
});
```

### Teste de fluxo com Playwright (API)

```ts
// tests/e2e/categories.api.spec.ts
import { test, expect } from "@playwright/test";

test("fluxo de categorias: 401, 201, 400, 404, 204", async ({ request }) => {
  expect((await request.get("/api/v1/categories")).status()).toBe(401);

  const email = `user-${crypto.randomUUID()}@example.com`;
  await request.post("/api/auth/sign-up/email", { data: { email, password: "Senha-segura-123", name: "Teste" } });
  // o cookie de sessão fica no contexto `request` (confirmar na versão instalada)

  const created = await request.post("/api/v1/categories", {
    data: { name: "Lazer", type: "expense", color: "#00AAFF" },
  });
  expect(created.status()).toBe(201);
  const category = await created.json();
  expect(created.headers()["location"]).toBe(`/api/v1/categories/${category.id}`);

  expect((await request.get("/api/v1/categories/abc")).status()).toBe(400);
  expect((await request.get("/api/v1/categories/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
  expect((await request.delete(`/api/v1/categories/${category.id}`)).status()).toBe(204);
});
```

`baseURL` vem de `playwright.config.ts` via variável de ambiente (ex.: `E2E_BASE_URL`).

## Boas práticas e anti-padrões

| Faça | Evite |
|---|---|
| Scripts para toda tarefa recorrente | Comandos longos copiados em README/chat |
| Testar integridade no banco real | Testar `ON DELETE SET NULL` com mocks |
| Um usuário novo por teste | Dados compartilhados entre testes |
| Fakes em memória para serviços | Mocks acoplados à implementação |
| Fixar versões + lockfile | `latest`, dependências sem versão |
| `db:check` na CI | Migrações editadas depois de aplicadas |
| Seed idempotente (dev) | Seed que roda em produção |

## Checklist de conformidade

- [ ] `package.json` tem todos os scripts da tabela (ou marcados como pendentes).
- [ ] Dependências novas foram autorizadas e fixadas; lockfile versionado.
- [ ] Toda regra de negócio nova tem teste unitário.
- [ ] Constraints (FK, unique, `SET NULL`, check) têm teste de integração.
- [ ] Há ao menos um fluxo Playwright por domínio (caminho feliz + 400/401/404).
- [ ] Testes não dependem de ordem nem de dados pré-existentes.
- [ ] `verify` passa antes de abrir PR.
