# FinanceControl Backend — Guia de Arquitetura e Padrões

## Objetivo

Este diretório é a **fonte única de padrões** do repositório `finance-control-back`. Serve a humanos e a agentes de IA. Leia este índice primeiro; depois leia apenas os arquivos relevantes para a tarefa.

O backend expõe a **API REST**, contém as **regras de negócio**, a **autenticação** (Better Auth) e a **gestão do schema do banco** (Drizzle + Neon). Não existe repositório separado para o banco.

## Escopo

**Cobre:** estrutura do projeto, API REST, configuração por ambiente, Application Factory, injeção de dependência, persistência, migrações, autenticação, segurança, validação, scripts e testes do backend.

**Não cobre:** interface, páginas e componentes (ver `finance-control-front/docs/`).

## Arquitetura

Monólito modular, um único processo, sem microsserviços.

```
 HTTP request
      │
      ▼
 ┌───────────────────────────── createApp(config) ─────────────────────────────┐
 │  dispatch(route, request, params)   ← adaptador Hono (hono-adapter.ts)      │
 │    1. cria RequestContext (requestId, user, logger, now)                     │
 │    2. exige sessão se route.access === "private"                             │
 │    3. executa handler  ──►  routes ──► service ──► repository ──► Drizzle    │
 │    4. converte AppError em resposta JSON padronizada                         │
 └──────────────────────────────────────────────────────────────────────────────┘
                                                         │
                                                  Neon (PostgreSQL)
```

Dependências fluem em **uma só direção**: `routes → service → repository → db/schema`. Nunca no sentido contrário.

## Stack

Versões fixadas no `package.json` (sem `^`/`latest`) e no `pnpm-lock.yaml`.

| Item                              | Definição                                                                   |
| --------------------------------- | --------------------------------------------------------------------------- |
| Runtime                           | Node.js ≥ 22.16 (`engines` + `.nvmrc`), ES Modules                          |
| Gerenciador de pacotes            | pnpm 12 (`packageManager`); builds permitidos em `pnpm-workspace.yaml`      |
| Linguagem                         | TypeScript 6.0 (`strict`)                                                   |
| Framework HTTP                    | Hono 4 + `@hono/node-server` (Request/Response nativos da Web)              |
| Banco                             | PostgreSQL 18 hospedado no Neon (apenas infraestrutura)                     |
| Driver do banco                   | `pg` (node-postgres), via `drizzle-orm/node-postgres` — suporta transações  |
| ORM / migrações                   | Drizzle ORM 0.45 + Drizzle Kit 0.31                                         |
| Autenticação                      | Better Auth 1.7 (e-mail/senha e Google)                                     |
| Validação                         | Zod 4                                                                       |
| Executor TS (dev, seed)           | tsx (`tsx watch`)                                                           |
| Build de produção                 | tsup (bundle ESM em `dist/`)                                                |
| Carregamento do `.env`            | flag nativa do Node (`--env-file-if-exists`), sem `dotenv`                  |
| Testes unitários e de integração  | Vitest 5 (+ `@vitest/coverage-v8`)                                          |
| Testes de fluxo (API)             | Playwright                                                                  |
| Lint e formatação                 | Biome 2                                                                     |

## Decisões registradas

| Decisão                                   | Escolha                                                                 | Arquivo |
| ----------------------------------------- | ----------------------------------------------------------------------- | ------- |
| Framework HTTP                            | Hono — adaptador em `src/app/http/hono-adapter.ts`                      | 02, 04  |
| Gerenciador de pacotes / Node             | pnpm 12 / Node ≥ 22.16                                                  | 03, 05  |
| Executor de TS e build                    | tsx (dev/seed) e tsup (build)                                           | 05      |
| Testes unitários                          | Vitest                                                                  | 05      |
| Lint e formatação                         | Biome                                                                   | 05      |
| Driver do Neon                            | `pg` (node-postgres): servidor Node de longa duração, com transações    | 06      |
| Carregamento do `.env`                    | `--env-file-if-exists` do Node                                          | 03      |
| Porta local                               | `PORT` (padrão `3001`)                                                  | 02, 03  |
| Branches do Neon                          | `production` (padrão) e `homologacao` — ver "Ambientes"                 | 03      |

## Decisões pendentes (consolidado)

Pergunte ao responsável antes de assumir qualquer item abaixo.

| #   | Decisão                                                                                                    | Arquivo relacionado |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------- |
| 1   | Reconciliar o ER com as tabelas do Better Auth (`usuarios`, `identidades_oauth`, `tokens_usuario`, sessão) | 06, 07              |
| 2   | Banco/branch Neon dedicado para testes automatizados                                                       | 05                  |
| 3   | Biblioteca de CSV para o RF07                                                                              | 06                  |
| 4   | Valores de `status` da transação e limites de "data retroativa"                                            | 06, 07              |
| 5   | Estratégia frontend↔backend: mesma origem (proxy/rewrites) ou origens distintas                            | 02, 07              |
| 6   | Biblioteca de log                                                                                          | 03                  |
| 7   | Hospedagem do backend                                                                                      | 03                  |
| 8   | Plataforma de CI e meta de cobertura                                                                       | 05                  |

## Ambientes (Neon)

Projeto Neon `finance-control` (região `aws-sa-east-1`).

| Branch Neon   | Uso                                              | Arquivo de ambiente local          |
| ------------- | ------------------------------------------------ | ---------------------------------- |
| `production`  | produção (branch padrão)                         | `.env.production` (não versionado) |
| `homologacao` | homologação e desenvolvimento local              | `.env` (não versionado)            |

- O `.env` local aponta para `homologacao`: o desenvolvimento nunca toca em `production`.
- Use a connection string **com pooler** em `DATABASE_URL` e a **direta** em `DATABASE_URL_DIRECT` (migrações).
- Use `sslmode=verify-full` nas connection strings.

## Setup rápido

```bash
pnpm install              # instala dependências (lockfile congelado em CI: --frozen-lockfile)
cp .env.example .env      # preencha com a connection string da branch homologacao
pnpm db:migrate           # aplica migrações (quando existirem)
pnpm dev                  # http://localhost:3001/api/v1/health
pnpm verify               # typecheck + lint + testes unitários
```

## Convenções compartilhadas com o frontend

Estas regras valem para backend e frontend. Não as altere sem atualizar os dois repositórios.

| Tema                | Convenção                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Prefixo de API      | `/api/v1/*` (negócio) e `/api/auth/*` (Better Auth)                                                                               |
| Identificadores     | UUID (string)                                                                                                                     |
| Valor monetário     | **string decimal** com ponto: `"1234.50"` (nunca `number` na API)                                                                 |
| Data                | `"YYYY-MM-DD"` — Mês: `"YYYY-MM"`                                                                                                 |
| Enums (API e banco) | `income`/`expense`; `fixed`/`variable`; `manual`/`recurrence`/`import`                                                            |
| Coleção             | `{ "data": [...], "meta"?: { "page", "pageSize", "total" } }`                                                                     |
| Recurso único       | objeto direto, sem envelope                                                                                                       |
| Erro                | `{ "error": { "code", "message", "details"?, "requestId" } }`                                                                     |
| Códigos de erro     | `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500) |
| Sessão              | cookie `httpOnly` gerenciado pelo Better Auth                                                                                     |
| Nomes no banco      | conforme o modelo físico do projeto (pt-BR, `snake_case`); nomes no código TypeScript em inglês                                   |

## Índice

| Arquivo                                                                                | Conteúdo                                                    |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [01-typescript-fundamentos.md](01-typescript-fundamentos.md)                           | Tipos, funções, composição, encapsulamento, módulos         |
| [02-http-rest-api.md](02-http-rest-api.md)                                             | HTTP, REST, recursos, status codes, contrato da API         |
| [03-estrutura-projeto-configuracao.md](03-estrutura-projeto-configuracao.md)           | Estrutura de pastas, configuração por ambiente              |
| [04-application-factory-di-contexto.md](04-application-factory-di-contexto.md)         | `createApp`, DI, ciclo de vida, contextos, monólito modular |
| [05-empacotamento-scripts-testes.md](05-empacotamento-scripts-testes.md)               | `package.json`, scripts, dependências, testes               |
| [06-persistencia-drizzle-neon-migracoes.md](06-persistencia-drizzle-neon-migracoes.md) | Schema, relações, integridade, migrações, seeds             |
| [07-autenticacao-seguranca-validacao.md](07-autenticacao-seguranca-validacao.md)       | Better Auth, autorização, Zod, CORS, cookies                |
| [99-rastreabilidade.md](99-rastreabilidade.md)                                         | Unidade → arquivo; requisitos → arquivo                     |

## Regras globais (valem para todo o código)

- Use TypeScript `strict`. Nunca use `any`; use `unknown` e valide com Zod.
- Leia `process.env` **somente** em `src/app/config/env.ts`.
- Não crie singletons globais (`export const db = ...`). Crie dependências em `createApp` e injete.
- Toda consulta ao banco filtra por `userId`.
- Altere o banco **somente** pelo schema Drizzle + migração versionada.
- Nunca exponha `DATABASE_URL`, segredos ou stack traces ao cliente.

## Checklist de conformidade (global)

- [ ] Li os arquivos relevantes antes de implementar.
- [ ] Nenhuma tecnologia nova foi introduzida sem autorização.
- [ ] Decisões `[PENDENTE DE DEFINIÇÃO]` foram perguntadas, não assumidas.
- [ ] Contrato (campos, enums, erros) é idêntico ao do frontend.
- [ ] Testes cobrem a regra de negócio alterada.
