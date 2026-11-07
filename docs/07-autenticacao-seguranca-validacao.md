# 07 — Autenticação, Segurança e Validação

> Transversal às Unidades 2, 4 e 6: validação na fronteira, contextos de requisição, integridade e proteção de rotas (RF01, RNF03, RNF04).

## Objetivo

Definir a integração do **Better Auth** no backend, a proteção de rotas (padrão: negar), autorização por proprietário, validação com Zod (RNF04), CORS, cookies e proteção de dados.

## Escopo

**Cobre:** configuração do Better Auth com Drizzle/Neon, sessão por cookie, rotas privadas, autorização, validação de entrada e de regra de negócio, CORS, segredos.
**Não cobre:** UI de login (ver frontend). Versão instalada: **Better Auth 1.7.18** (a opção `advanced.database.generateId: "uuid"` foi confirmada nos tipos dessa versão). Ao atualizar a versão, reconfirme os nomes das opções.

## Regras e padrões

### Autenticação (RF01)

- Better Auth roda **no backend**. Endpoints em `/api/auth/*` são servidos por `auth.handler(request)`.
- Métodos: e-mail/senha e Google (Google habilitado só se as credenciais existirem).
- **Não implemente hash de senha**: o Better Auth já faz (RNF03). Nunca armazene senha em claro nem crie coluna de hash própria.
- IDs em UUID: configure o Better Auth para gerar UUID e use colunas `uuid` (ver 06).
- O schema do Better Auth vive no schema Drizzle (**uma** fonte de verdade); a reconciliação com o ER é **[PENDENTE DE DEFINIÇÃO]** (ver 06).
- Estratégia frontend↔backend: **[PENDENTE DE DEFINIÇÃO]**. Recomendação: **mesma origem** (o frontend repassa `/api/*` ao backend por proxy/rewrites). Isso evita cookies de terceiros e simplifica CORS. Com origens distintas, é preciso cookie `SameSite=None; Secure`, `trustedOrigins` e CORS com credenciais.

### Rotas protegidas (RNF03)

- **Negar por padrão:** toda rota declara `access: "public" | "private"`. Somente `health` e `/api/auth/*` são públicas.
- `dispatch` (arquivo 04) resolve a sessão e devolve 401 em rota privada sem sessão.
- Frontend também bloqueia via middleware/proxy, mas **o backend é a barreira real**.

### Autorização

- Todo recurso pertence a um `userId`. Serviços e repositórios **sempre** recebem `userId` da sessão (nunca do corpo ou query).
- Recurso de outro usuário → 404.
- Ao referenciar outro recurso no corpo (`categoryId`, `valueSourceId`), valide que pertence ao mesmo usuário.

### Validação (RNF04)

Duas camadas, ambas obrigatórias:

1. **Borda (Zod):** formato, tipo, tamanho, enum, data real, valor decimal. Use `.strict()` para rejeitar campos desconhecidos (evita *mass assignment*).
2. **Regra de negócio (serviço):** tipo da categoria compatível com o tipo da transação, propriedade dos recursos, natureza obrigatória em despesas, consistência de datas.

Mais uma barreira: **constraints do PostgreSQL** (FK, unique, check) como última linha de defesa.

Datas retroativas: definir limites mínimo/máximo aceitos **[PENDENTE DE DEFINIÇÃO]**; sempre rejeite datas de calendário inexistentes (ex.: `2026-02-30`).

Os schemas Zod do backend são a referência do contrato. O frontend mantém espelho sincronizado (ver frontend 02).

### CORS, cookies e cabeçalhos

- CORS: permita **somente** origens de `CORS_ORIGINS`. Nunca `*` com credenciais.
- Cookie de sessão: `httpOnly`, `secure` em produção, `SameSite=Lax` (padrão) — salvo decisão por origens distintas.
- Mantenha a proteção de origem (CSRF) do Better Auth ativa via `trustedOrigins`.
- Confirme o *rate limiting* do Better Auth em produção.

### Dados e segredos

- Respostas nunca incluem `userId`, hash, tokens, stack trace ou SQL.
- Logs sem senha, token, cookie, connection string ou dados financeiros completos.
- Segredos só em variáveis de ambiente (ver 03).
- Drizzle parametriza consultas. Em `sql\`...\``, interpole valores **apenas como parâmetros** (`${valor}`); nunca concatene string vinda do cliente.

## Exemplos de código

### Better Auth como fábrica

```ts
// src/modules/auth/auth.factory.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export function createAuth(deps: { db: Database; config: AppConfig }) {
  const { db, config } = deps;
  return betterAuth({
    appName: "FinanceControl",
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    trustedOrigins: config.corsOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders: config.google
      ? { google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret } }
      : {},
    advanced: {
      database: { generateId: "uuid" },                  // confirmar nome da opção na versão instalada
      useSecureCookies: config.env === "production",
    },
  });
}
export type Auth = ReturnType<typeof createAuth>;
```

### Schemas Zod de transação (RNF04)

```ts
// src/modules/transactions/transactions.schemas.ts
const MIN_DATE = "2000-01-01"; // limites reais: [PENDENTE DE DEFINIÇÃO]

export const moneySchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Use ponto decimal com até 2 casas (ex.: 89.90).")
  .refine((v) => Number(v) > 0, "O valor deve ser maior que zero.");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD.")
  .refine(isRealCalendarDate, "Data inexistente.")
  .refine((v) => v >= MIN_DATE, `Data anterior a ${MIN_DATE}.`);

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato YYYY-MM.");

export const createTransactionSchema = z
  .object({
    type: z.enum(transactionTypes),
    nature: z.enum(transactionNatures).nullable().optional(),
    description: z.string().trim().min(1).max(160),
    amount: moneySchema,
    date: isoDateSchema,
    categoryId: z.string().uuid().nullable().optional(),
    valueSourceId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === "expense" && !v.nature) {
      ctx.addIssue({ code: "custom", path: ["nature"], message: "Informe se a despesa é fixa ou variável." });
    }
    if (v.type === "income" && v.nature) {
      ctx.addIssue({ code: "custom", path: ["nature"], message: "Receitas não têm natureza." });
    }
  });

export const listTransactionsQuerySchema = z.object({
  month: monthSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
```

### Categorias: schemas

```ts
export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    type: z.enum(transactionTypes),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use cor hexadecimal (#RRGGBB)."),
    icon: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

export const updateCategorySchema = createCategorySchema.omit({ type: true }); // tipo é imutável

export type CreateCategoryInput = z.output<typeof createCategorySchema>;
export type UpdateCategoryInput = z.output<typeof updateCategorySchema>;
```

### Regra de negócio no serviço (dependência por interface)

```ts
// categories.service.ts expõe também find(): Category | null (sem lançar)
const category = input.categoryId ? await deps.categories.find(userId, input.categoryId) : null;
if (input.categoryId && !category) {
  throw new ValidationError([{ path: "categoryId", message: "Categoria não encontrada." }]);
}
if (category && category.type !== input.type) {
  throw new ValidationError([{ path: "categoryId", message: "Tipo da categoria incompatível." }]);
}
```

### Teste: todas as rotas privadas rejeitam anônimos

```ts
it.each(app.routes.filter((r) => r.access === "private"))(
  "$method $path retorna 401 sem sessão",
  async (route) => {
    const res = await app.dispatch(route, new Request(`http://localhost${route.path}`, { method: route.method }), {});
    expect(res.status).toBe(401);
  },
);
```

(Use um `auth` falso que retorna sessão nula: `createApp(testConfig, { db, auth: fakeAuth(null) })`.)

### Teste: isolamento entre usuários

```ts
it("usuário B não enxerga categoria do usuário A", async () => {
  const created = await service.create("user-a", validCategory);
  await expect(service.get("user-b", created.id)).rejects.toBeInstanceOf(NotFoundError);
});
```

## Boas práticas e anti-padrões

| Faça | Evite |
|---|---|
| Negar por padrão (`access`) | Proteger rota "quando lembrar" |
| `userId` vindo da sessão | `userId` vindo do corpo/query |
| `.strict()` nos schemas de entrada | Aceitar campos desconhecidos |
| Validar Zod **e** regra de negócio **e** constraint | Confiar só na validação do frontend |
| 404 para recurso alheio | 403 que confirma existência |
| Better Auth para senha/sessão | Hash manual, JWT caseiro, token em `localStorage` |
| CORS por lista explícita | `Access-Control-Allow-Origin: *` com credenciais |
| Logs sem PII | Logar corpo de requisição inteiro |

## Checklist de conformidade

- [ ] Better Auth criado por `createAuth({ db, config })` e montado em `/api/auth/*`.
- [ ] Todas as rotas têm `access`; teste garante 401 sem sessão nas privadas.
- [ ] Toda entrada validada com Zod `.strict()`; erros no envelope padrão (400).
- [ ] Regras de negócio validadas no serviço (categoria compatível, propriedade dos recursos).
- [ ] Nenhuma tabela/coluna de senha própria; schema de auth só no Drizzle.
- [ ] CORS com origens explícitas; cookies `httpOnly` e `secure` em produção.
- [ ] Testes de isolamento entre usuários existem.
- [ ] Nenhum segredo, hash ou `userId` em respostas ou logs.
