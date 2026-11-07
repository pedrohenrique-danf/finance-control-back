# 02 — HTTP, REST e Contrato da API

> Unidade 2 (HTTP, requisição/resposta, métodos, status codes, REST, recursos, JSON, `curl`).

## Objetivo

Definir como o backend modela e expõe recursos via HTTP/REST, com contrato idêntico ao consumido pelo frontend: URIs, métodos, status codes, formato JSON e erros.

## Escopo

**Cobre:** modelagem de recursos, rotas, status codes, formato de resposta/erro, helpers HTTP, testes manuais com `curl`.
**Não cobre:** autenticação (07), persistência (06). O framework HTTP é o **Hono** (ver 04), mas os handlers aqui usam os tipos web padrão `Request`/`Response` para ficarem independentes dele.

## Regras e padrões

### Modelo mental

`cliente → requisição HTTP → servidor → processamento → resposta HTTP → cliente`.
Antes de codar, defina: **recurso ↔ URI ↔ método HTTP ↔ resposta**.

### Recursos e rotas do MVP

| Método | URI | Operação | Sucesso |
|---|---|---|---|
| GET | `/api/v1/health` | verificação de saúde (pública) | 200 |
| GET | `/api/v1/categories` | listar categorias | 200 |
| GET | `/api/v1/categories/:id` | obter categoria | 200 |
| POST | `/api/v1/categories` | criar categoria | 201 + `Location` |
| PUT | `/api/v1/categories/:id` | substituir nome/cor/ícone | 200 |
| DELETE | `/api/v1/categories/:id` | excluir categoria | 204 |
| GET | `/api/v1/transactions?month=YYYY-MM&page=&pageSize=` | extrato do mês (RF06) | 200 |
| GET | `/api/v1/transactions/:id` | obter transação | 200 |
| POST | `/api/v1/transactions` | lançar transação (RF03) | 201 + `Location` |
| PUT | `/api/v1/transactions/:id` | substituir transação | 200 |
| DELETE | `/api/v1/transactions/:id` | excluir transação | 204 |
| GET | `/api/v1/recurrences` | listar recorrências | 200 |
| POST | `/api/v1/recurrences` | criar e projetar despesa fixa (RF04) | 201 + `Location` |
| DELETE | `/api/v1/recurrences/:id` | encerrar recorrência | 204 |
| GET | `/api/v1/dashboard/summary?month=YYYY-MM` | cards do dashboard (RF05) | 200 |
| POST | `/api/v1/imports` | importar CSV (RF07) | 201 |
| GET | `/api/v1/exports/transactions?month=YYYY-MM&format=csv` | exportar (RF07) | 200 |
| `*` | `/api/auth/*` | Better Auth (ver 07) | — |

Regras de URI: substantivos no plural, `kebab-case`, sem verbos. Coleção (`/categories`) e recurso (`/categories/:id`) são recursos **diferentes**. A notação `:id` é neutra; adapte à sintaxe do framework escolhido.

### Semântica dos métodos

- `GET`: não altera estado. `POST`: cria recurso subordinado ou processa operação. `PUT`: **substitui** a representação (envie o recurso completo). `DELETE`: remove. `PUT` e `DELETE` são idempotentes.
- Não use `PATCH` até ser definido **[PENDENTE DE DEFINIÇÃO]**.

### Status codes

| Código | Quando usar |
|---|---|
| 200 | leitura ou atualização bem-sucedida |
| 201 | recurso criado; envie `Location: /api/v1/<recurso>/<id>` e o recurso no corpo |
| 204 | exclusão bem-sucedida; **sem corpo** |
| 400 | requisição inválida: JSON malformado, id que não é UUID, campo ausente, tipo errado |
| 401 | sem sessão válida |
| 403 | autenticado, mas sem permissão |
| 404 | formato válido, mas recurso inexistente **ou de outro usuário** |
| 405 | método não permitido para a rota |
| 409 | conflito de unicidade |
| 500 | falha inesperada (nunca vaze detalhes) |

**400 ≠ 404:** `GET /categories/abc` → 400 (id inválido). `GET /categories/<uuid-inexistente>` → 404.
Recurso de outro usuário retorna **404**, nunca 403 (não revela existência).

### Formato JSON

- `Content-Type: application/json; charset=utf-8`; respostas privadas com `Cache-Control: no-store`.
- Coleção: `{ "data": [...] }` (com `meta` se paginada). Recurso único: objeto direto.
- Nunca exponha `userId` nem campos internos. Mapeie linhas do banco para DTOs.
- Valor monetário: string decimal (`"89.90"`). Data: `"YYYY-MM-DD"`.
- Erro (único formato em toda a API):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "details": [{ "path": "amount", "message": "Valor inválido." }],
    "requestId": "b1c2..."
  }
}
```

### Sem estado (REST) e sessão

Cada requisição deve conter o necessário para ser processada: a identidade vem do **cookie de sessão** do Better Auth, resolvido a cada requisição. Não guarde estado de conversa em memória do processo. (A sessão persistida no banco é a exceção aceita e documentada.)

### Camadas de uma rota

1. **Rota/handler:** lê `Request`, valida com Zod, chama o serviço, monta `Response`. Sem regra de negócio.
2. **Serviço:** regra de negócio e autorização por `userId`.
3. **Repositório:** consultas Drizzle.

## Exemplos de código

### Erros de domínio

```ts
// src/shared/errors.ts
export type ErrorCode =
  | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN"
  | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";

export interface FieldIssue { path: string; message: string }

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: FieldIssue[];

  constructor(code: ErrorCode, status: number, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(details: FieldIssue[], message = "Dados inválidos.") {
    super("VALIDATION_ERROR", 400, message, details);
  }
}
export class UnauthenticatedError extends AppError {
  constructor() { super("UNAUTHENTICATED", 401, "Autenticação necessária."); }
}
export class ForbiddenError extends AppError {
  constructor() { super("FORBIDDEN", 403, "Sem permissão."); }
}
export class NotFoundError extends AppError {
  constructor(resource: string) { super("NOT_FOUND", 404, `${resource} não encontrado(a).`); }
}
export class ConflictError extends AppError {
  constructor(message: string) { super("CONFLICT", 409, message); }
}
```

### Helpers de resposta e validação

```ts
// src/app/http/responses.ts
export function json<T>(data: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export function toErrorResponse(
  error: unknown,
  ctx: { requestId: string; logger: Logger },
): Response {
  if (error instanceof AppError) {
    return json(
      { error: { code: error.code, message: error.message, details: error.details, requestId: ctx.requestId } },
      { status: error.status },
    );
  }
  ctx.logger.error("unhandled_error", { requestId: ctx.requestId, error });
  return json(
    { error: { code: "INTERNAL_ERROR", message: "Erro interno.", requestId: ctx.requestId } },
    { status: 500 },
  );
}
```

```ts
// src/app/http/validation.ts
import type { z } from "zod";

export function parseWith<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError([{ path: "", message: "JSON inválido." }]);
  }
  return parseWith(schema, raw);
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  return parseWith(schema, Object.fromEntries(new URL(req.url).searchParams));
}
```

### Tipos de rota (agnósticos de framework)

```ts
// src/app/http/types.ts
export interface RequestContext {
  requestId: string;
  user: { id: string; email: string; name: string } | null;
  logger: Logger;
  now: Date;
}

export type RouteHandler = (
  req: Request,
  ctx: RequestContext,
  params: Record<string, string>,
) => Promise<Response>;

export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;               // ex.: "/api/v1/categories/:id"
  access: "public" | "private";
  handler: RouteHandler;
}

export function requireUser(ctx: RequestContext): { id: string; email: string; name: string } {
  if (!ctx.user) throw new UnauthenticatedError();
  return ctx.user;
}
```

### Rotas de um domínio

```ts
// src/modules/categories/categories.routes.ts
const idParams = z.object({ id: z.string().uuid() });

export function createCategoriesRoutes(service: CategoriesService): RouteDefinition[] {
  return [
    {
      method: "GET", path: "/api/v1/categories", access: "private",
      handler: async (_req, ctx) => json({ data: await service.list(requireUser(ctx).id) }),
    },
    {
      method: "GET", path: "/api/v1/categories/:id", access: "private",
      handler: async (_req, ctx, params) => {
        const { id } = parseWith(idParams, params);       // id inválido → 400
        return json(await service.get(requireUser(ctx).id, id)); // inexistente → 404
      },
    },
    {
      method: "POST", path: "/api/v1/categories", access: "private",
      handler: async (req, ctx) => {
        const input = await parseBody(req, createCategorySchema);
        const created = await service.create(requireUser(ctx).id, input);
        return json(created, { status: 201, headers: { Location: `/api/v1/categories/${created.id}` } });
      },
    },
    {
      method: "PUT", path: "/api/v1/categories/:id", access: "private",
      handler: async (req, ctx, params) => {
        const { id } = parseWith(idParams, params);
        const input = await parseBody(req, updateCategorySchema);
        return json(await service.update(requireUser(ctx).id, id, input));
      },
    },
    {
      method: "DELETE", path: "/api/v1/categories/:id", access: "private",
      handler: async (_req, ctx, params) => {
        const { id } = parseWith(idParams, params);
        await service.remove(requireUser(ctx).id, id);
        return noContent();
      },
    },
  ];
}
```

### Rota de saúde (pública)

```ts
export const healthRoute: RouteDefinition = {
  method: "GET", path: "/api/v1/health", access: "public",
  handler: async () => json({ status: "ok" }),
};
```

### Teste manual com `curl`

```bash
# criar (esperado: 201 + Location)
curl -i -X POST http://localhost:3001/api/v1/categories \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"name":"Alimentação","type":"expense","color":"#FF8800"}'

# id inválido → 400 ; uuid inexistente → 404 ; sem cookie → 401
curl -i -b cookies.txt http://localhost:3001/api/v1/categories/abc
curl -i -b cookies.txt http://localhost:3001/api/v1/categories/00000000-0000-4000-8000-000000000000
curl -i http://localhost:3001/api/v1/categories

# excluir (esperado: 204 sem corpo)
curl -i -X DELETE -b cookies.txt http://localhost:3001/api/v1/categories/<id>
```

A porta vem da variável `PORT` (padrão `3001`, ver 03).

## Boas práticas e anti-padrões

| Faça | Evite |
|---|---|
| Modelar recursos antes de endpoints | Endpoints como funções remotas (`/getUser`, `/doPayment`) |
| 201 + `Location` na criação | 200 genérico para tudo |
| 204 sem corpo na exclusão | Enviar JSON após 204 |
| 400 para entrada inválida, 404 para inexistente | Confundir 400 com 404 |
| 404 para recurso de outro usuário | 403 que revela existência |
| Erro em formato único | Mensagens de erro ad hoc por rota |
| DTO sem campos internos | Retornar a linha do banco crua |
| Interpretar dados do cliente como dado (JSON) | Montar HTML/SQL concatenando entrada (XSS/injeção) |
| Handlers finos | Regra de negócio no handler |

## Checklist de conformidade

- [ ] Cada rota tem método, URI, `access` e status codes definidos nesta tabela.
- [ ] Entrada validada com Zod; id inválido retorna 400, inexistente 404.
- [ ] 201 inclui `Location`; 204 não tem corpo.
- [ ] Erros seguem o envelope padrão com `requestId`.
- [ ] Nenhuma resposta expõe `userId`, stack trace ou segredo.
- [ ] Contrato (URIs, campos, enums) confere com o frontend.
- [ ] Testado com `curl` ou Playwright: caminho feliz e cada erro (400, 401, 404).
