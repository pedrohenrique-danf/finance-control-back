# 03 — Estrutura do Projeto e Configuração por Ambiente

> Unidade 3 (primeira aplicação: ambiente isolado, estrutura em pacotes, blueprints, factory, configuração por ambiente, execução, modo debug, `.env`).

## Objetivo

Definir a estrutura de pastas do backend, a organização modular por domínio (equivalente aos *blueprints*), o isolamento de dependências e a configuração separada para desenvolvimento, testes e produção.

## Escopo

**Cobre:** árvore de diretórios, módulos de domínio, isolamento de dependências, variáveis de ambiente, `.env.example`, modo de execução (dev × produção), logs/debug.
**Não cobre:** a factory em detalhe (04), scripts (05), schema (06). Framework HTTP: **Hono**. Gerenciador de pacotes: **pnpm 12**. Node: **≥ 22.16**.

## Regras e padrões

### Isolamento de dependências (equivalente ao `venv`)

- Dependências ficam em `node_modules/` local ao projeto; nunca instale pacotes do projeto globalmente.
- Versione o **lockfile** (`pnpm-lock.yaml`); em CI instale com `pnpm install --frozen-lockfile`.
- A versão do Node está em `engines` (`>=22.16.0`) e em `.nvmrc` (`22`); o pnpm está fixado em `packageManager`.
- Scripts de instalação de dependências são bloqueados por padrão no pnpm; libere apenas os necessários com `pnpm approve-builds <pacote>` (registrados em `pnpm-workspace.yaml` → `allowBuilds`).
- Separe `dependencies` (runtime) de `devDependencies` (ver 05).

### Árvore de diretórios

```
finance-control-back/
├── docs/                         # esta documentação
├── drizzle/                      # migrações SQL geradas (versionadas no Git)
├── src/
│   ├── main.ts                   # ÚNICO ponto de entrada (sobe o servidor)
│   ├── app/
│   │   ├── create-app.ts         # Application Factory (composition root)
│   │   ├── config/
│   │   │   ├── env.ts            # ÚNICO lugar que lê process.env
│   │   │   └── index.ts
│   │   └── http/
│   │       ├── types.ts          # RouteDefinition, RequestContext
│   │       ├── responses.ts      # json(), noContent(), toErrorResponse()
│   │       └── validation.ts     # parseWith/parseBody/parseQuery
│   ├── db/
│   │   ├── client.ts             # createDb(url) — sem singleton
│   │   ├── schema/               # tabelas Drizzle (fonte única do schema)
│   │   │   ├── index.ts
│   │   │   ├── auth.ts
│   │   │   ├── categories.ts
│   │   │   ├── transactions.ts
│   │   │   └── ...
│   │   └── seed/index.ts
│   ├── modules/                  # um diretório por domínio funcional
│   │   ├── auth/
│   │   ├── categories/
│   │   ├── transactions/
│   │   ├── recurrences/
│   │   ├── dashboard/
│   │   └── data-exchange/        # importação/exportação (RF07)
│   └── shared/                   # errors, enums, money, dates, logger
├── tests/
│   ├── unit/                     # (ou *.test.ts ao lado do código — escolher uma convenção)
│   ├── integration/
│   └── e2e/                      # Playwright (fluxos de API)
├── drizzle.config.ts
├── tsconfig.json
├── package.json
├── .env.example
└── .gitignore
```

### Módulo de domínio (equivalente ao *blueprint*)

Cada diretório em `src/modules/<dominio>/` contém:

```
categories/
├── index.ts                     # API pública do módulo (única porta de entrada)
├── categories.module.ts         # createCategoriesModule(deps) — monta repo+service+routes
├── categories.routes.ts         # handlers HTTP (finos)
├── categories.service.ts        # regras de negócio
├── categories.repository.ts     # consultas Drizzle (+ interface)
├── categories.schemas.ts        # Zod (entrada/saída)
├── categories.types.ts          # tipos derivados
└── categories.service.test.ts   # testes unitários
```

Regras: um módulo **não importa arquivos internos** de outro; usa o que o `index.ts` exporta (ex.: a interface do serviço).

### Configuração por ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NODE_ENV` | não (default `development`) | `development` \| `test` \| `production` |
| `PORT` | não (default `3001`) | porta HTTP do servidor |
| `DATABASE_URL` | sim | connection string do Neon **com pooler** (host `...-pooler...`), usada pela aplicação |
| `DATABASE_URL_DIRECT` | recomendada | connection string **direta** (sem pooler), usada pelo Drizzle Kit nas migrações |
| `BETTER_AUTH_SECRET` | sim, ≥ 32 caracteres, **sem default** | segredo do Better Auth |
| `BETTER_AUTH_URL` | sim | URL pública do backend |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | opcional (par) | login com Google |
| `CORS_ORIGINS` | obrigatória em produção | origens permitidas, separadas por vírgula |
| `LOG_LEVEL` | não (default `info`) | `debug` \| `info` \| `warn` \| `error` |

Regras:

- **Nunca** use segredo com valor padrão (diferente do exemplo `dev-secret` do material de Flask).
- Arquivos `.env*` reais **não** vão ao Git. Versione somente `.env.example` (sem segredos).
- `DATABASE_URL` jamais é enviada ao frontend nem logada.
- Em produção, as variáveis vêm do provedor de hospedagem **[PENDENTE DE DEFINIÇÃO: hospedagem do backend]**; arquivos `.env` são para dev/test.
- O `.env` é carregado pela flag nativa do Node `--env-file-if-exists=.env` (scripts `dev`, `start`, `db:seed`); o `drizzle.config.ts` usa `process.loadEnvFile()`. Não use `dotenv`.
- Use `sslmode=verify-full` nas connection strings (o `pg` tratará `require` com semântica mais fraca a partir da v9).
- Ambientes e branches do Neon (projeto `finance-control`):

| Ambiente | Branch Neon | Arquivo local |
|---|---|---|
| `development` (local) | `homologacao` | `.env` |
| homologação | `homologacao` | variáveis do provedor de hospedagem |
| `production` | `production` (branch padrão) | `.env.production` local; em produção, variáveis do provedor |
| `test` (automatizado) | dedicada **[PENDENTE DE DEFINIÇÃO]** | — |

### Modo debug × produção

- `development`: `LOG_LEVEL=debug`, mensagens de erro detalhadas **somente nos logs**.
- `production`: `LOG_LEVEL=info`, cookies `secure`, `CORS_ORIGINS` explícito, nenhuma stack trace na resposta.
- O servidor de desenvolvimento nunca é usado em produção.

## Exemplos de código

### `src/app/config/env.ts`

```ts
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.url(),                // Zod 4: z.url() substitui z.string().url()
    DATABASE_URL_DIRECT: z.url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET deve ter ao menos 32 caracteres"),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    CORS_ORIGINS: z.string().default(""),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_ID"], message: "Informe CLIENT_ID e CLIENT_SECRET juntos." });
    }
    if (env.NODE_ENV === "production" && env.CORS_ORIGINS.trim() === "") {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "CORS_ORIGINS é obrigatório em produção." });
    }
  });

export interface AppConfig {
  env: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  databaseUrlDirect: string | undefined;   // `| undefined` explícito: exactOptionalPropertyTypes
  betterAuthSecret: string;
  betterAuthUrl: string;
  google: { clientId: string; clientSecret: string } | undefined;
  corsOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
}

/** Lê e valida variáveis de ambiente. Falha cedo, com mensagem clara. */
export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  // variáveis vazias (ex.: GOOGLE_CLIENT_ID= no .env) contam como não informadas
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Configuração inválida:\n${lines.join("\n")}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    databaseUrlDirect: e.DATABASE_URL_DIRECT,
    betterAuthSecret: e.BETTER_AUTH_SECRET,
    betterAuthUrl: e.BETTER_AUTH_URL,
    google: e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
      ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET }
      : undefined,
    corsOrigins: e.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    logLevel: e.LOG_LEVEL,
  };
}
```

### `.env.example`

```dotenv
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler/DB?sslmode=verify-full&channel_binding=require
DATABASE_URL_DIRECT=postgresql://USER:PASSWORD@HOST/DB?sslmode=verify-full&channel_binding=require
BETTER_AUTH_SECRET=troque-por-um-segredo-aleatorio-com-32-ou-mais-caracteres
BETTER_AUTH_URL=http://localhost:3001
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CORS_ORIGINS=http://localhost:3000
LOG_LEVEL=debug
```

### `.gitignore` (trecho obrigatório)

```gitignore
node_modules/
.env
.env.*
!.env.example
```

### Logger mínimo injetável

A biblioteca de log é **[PENDENTE DE DEFINIÇÃO]**. Até lá, use esta interface (substituível sem alterar o restante do código):

```ts
// src/shared/logger.ts
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

const order = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export function createConsoleLogger(level: keyof typeof order): Logger {
  const emit = (l: keyof typeof order, msg: string, data?: Record<string, unknown>) => {
    if (order[l] < order[level]) return;
    console[l](JSON.stringify({ level: l, msg, ...data }));
  };
  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
  };
}
```

### Teste da configuração

```ts
it("falha quando o segredo é curto", () => {
  expect(() =>
    loadConfig({ DATABASE_URL: "postgresql://u:p@h/db", BETTER_AUTH_SECRET: "curto", BETTER_AUTH_URL: "http://localhost:3001" }),
  ).toThrow(/BETTER_AUTH_SECRET/);
});
```

## Boas práticas e anti-padrões

| Faça | Evite |
|---|---|
| Ler `process.env` só em `env.ts` e injetar `AppConfig` | `process.env.X` espalhado pelo código |
| Falhar cedo com configuração inválida | Valores default para segredos |
| Um diretório por domínio com `index.ts` público | Pastas por tipo técnico global (`controllers/`, `services/` únicos) |
| `.env.example` versionado | `.env` com segredos no Git |
| Config diferente por `NODE_ENV` via variáveis | `if (env === "production")` espalhado pela lógica |
| Servidor de produção real | Usar servidor de desenvolvimento em produção |

## Checklist de conformidade

- [ ] Estrutura de pastas segue a árvore acima; módulos por domínio.
- [ ] `process.env` só é lido em `src/app/config/env.ts` (exceção: `drizzle.config.ts`).
- [ ] `.env.example` atualizado a cada nova variável; `.env*` ignorados no Git.
- [ ] `BETTER_AUTH_SECRET` sem default e com ≥ 32 caracteres.
- [ ] `DATABASE_URL` não aparece em logs nem em respostas.
- [ ] Ambientes `development`, `test`, `production` configuráveis sem alterar código.
- [ ] Lockfile versionado; Node fixado.
