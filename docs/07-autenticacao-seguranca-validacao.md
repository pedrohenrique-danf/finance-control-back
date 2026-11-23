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
- **Recuperação de senha:** `POST /api/auth/request-password-reset` → o backend envia o e-mail (`Mailer`, SMTP
  configurado em 03) com o link do Better Auth (`/api/auth/reset-password/:token`), que valida o token e redireciona
  para a tela do front (`/reset-password?token=…`, ou `?error=INVALID_TOKEN`). Link válido por 60 minutos e de uso
  único; trocar a senha encerra todas as sessões (`revokeSessionsOnPasswordReset`). O envio não é aguardado: a
  resposta é igual (e no mesmo tempo) para e-mail com ou sem conta. Sem SMTP em dev/test, o link vai para o log
  (`email_not_sent_dev`). Em produção sem SMTP o backend sobe, mas o e-mail não sai: só o aviso
  `smtp_not_configured` na inicialização e `email_not_sent_no_smtp` a cada pedido, sem destinatário nem link.
- **Não implemente hash de senha**: o Better Auth já faz (RNF03). Nunca armazene senha em claro nem crie coluna de hash própria.
- IDs em UUID: configure o Better Auth para gerar UUID e use colunas `uuid` (ver 06).
- **Dados iniciais do usuário novo:** o hook `databaseHooks.user.create.after` (cadastro por e-mail ou primeiro login
  com Google) cria as categorias padrão do protótipo e a conta "Carteira" — o lançamento de transação exige ambas.
  Falha nesse passo vai para o log e não impede o cadastro.
- O schema do Better Auth vive no schema Drizzle (**uma** fonte de verdade); a reconciliação com o ER está **decidida** (ver 06): `usuarios`, `sessoes`, `contas`, `verificacoes`.
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

Datas de lançamento (criar, editar e importar): de `2000-01-01` (`MIN_DATE`, também no check `ck_transacoes_data`) até **1 ano depois de hoje** (`transactionDateSchema`, recalculado a cada validação). Filtros e o término das despesas fixas não têm limite futuro. Sempre rejeite datas de calendário inexistentes (ex.: `2026-02-30`).

Os schemas Zod do backend são a referência do contrato. O frontend mantém espelho sincronizado (ver frontend 02).

### CORS, cookies e cabeçalhos

- CORS: permita **somente** origens de `CORS_ORIGINS`. Nunca `*` com credenciais.
- Cookie de sessão: `httpOnly`, `secure` em produção, `SameSite=Lax` (padrão) — salvo decisão por origens distintas.
- Mantenha a proteção de origem (CSRF) do Better Auth ativa via `trustedOrigins`.
- *Rate limiting* do Better Auth explícito em `auth.factory.ts`, ligado só em produção: 100 requisições/min por IP no geral; login 10/min, cadastro 5/min, pedido de redefinição 3/min e redefinição 5/min. O armazenamento é em memória (vale enquanto houver uma única instância no Render).
- Upload da importação: o corpo é lido com limite (`parseFormData`, 5 MB + folga do multipart); acima disso a leitura para e a resposta é 400 no campo `file`.

### LGPD: termos, aceite, exclusão e portabilidade

- **Aceite:** o cadastro por e-mail exige `termsVersion` igual a `TERMS_VERSION` (`src/modules/auth/terms.ts`), senão
  400 `TERMS_NOT_ACCEPTED`. O hook `user.create.before` grava `termos_aceitos_em` (hora do servidor) e `termos_versao`.
  No login com Google, a tela avisa que continuar é aceitar; o primeiro login grava a versão vigente.
- **Nova versão dos termos:** mude `TERMS_VERSION` aqui e no frontend no mesmo PR. Pedir novo aceite de quem aceitou
  uma versão antiga ainda não está implementado.
- **Excluir conta:** `deleteUser` do Better Auth (`POST /api/auth/delete-user`). Conta com senha: a senha é obrigatória
  (hook `requirePasswordToDeleteAccount`, 400 `PASSWORD_REQUIRED`), para uma sessão roubada não bastar. Conta só do
  Google: basta a sessão criada há menos de 1 dia. Todas as tabelas do usuário têm `ON DELETE CASCADE`.
- **Portabilidade:** `GET /api/v1/exports/me` devolve um JSON com perfil, categorias, contas, transações, despesas
  fixas, notificações, preferências e histórico de importação/exportação, sem `userId` nem dados de autenticação.

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

// Enums do banco (src/shared/enums.ts): "receita" | "despesa", "fixa" | "variavel", "pendente" | "efetivada".
export const createTransactionSchema = z
  .object({
    type: z.enum(transactionTypes),
    nature: z.enum(transactionNatures).nullable().optional(),
    description: z.string().trim().min(1).max(160),
    amount: moneySchema,
    date: isoDateSchema,
    status: z.enum(transactionStatuses).default("efetivada"), // coluna status (default do banco)
    categoryId: z.string().uuid().nullable().optional(),
    valueSourceId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // espelha ck_transacoes_natureza
    if (v.type === "despesa" && !v.nature) {
      ctx.addIssue({ code: "custom", path: ["nature"], message: "Informe se a despesa é fixa ou variável." });
    }
    if (v.type === "receita" && v.nature) {
      ctx.addIssue({ code: "custom", path: ["nature"], message: "Receitas não têm natureza." });
    }
  });

/** PUT substitui o recurso inteiro: mesmo corpo da criação. `origin` e `recurrenceId` não são editáveis. */
export const updateTransactionSchema = createTransactionSchema;

const uuidList = z
  .string()
  .transform((v) => v.split(",").filter(Boolean))
  .pipe(z.array(z.string().uuid()).max(50));

/** Extrato (RF06). Sem `from`/`to`, filtra pelo mês; com período, o mês é ignorado. */
export const listTransactionsQuerySchema = z
  .object({
    month: monthSchema.optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    q: z.string().trim().max(100).optional(), // busca na descrição, sem diferenciar acentos/maiúsculas
    type: z.enum(transactionTypes).optional(),
    nature: z.enum(transactionNatures).optional(),
    status: z.enum(transactionStatuses).optional(),
    categoryIds: uuidList.optional(), // CSV: ?categoryIds=uuid1,uuid2
    valueSourceIds: uuidList.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  // só a conta (sem mês) serve ao detalhe da conta: "últimas transações" em qualquer data
  .refine((v) => v.month || v.from || v.to || v.valueSourceIds?.length, {
    path: ["month"],
    message: "Informe o mês, um período ou uma conta.",
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { path: ["to"], message: "Período inválido." });
```

Resposta de `GET /transactions` (ordem: data desc; no mesmo dia, o último lançado primeiro):

```json
{
  "data": [{ "id": "…", "type": "despesa", "nature": "variavel", "description": "Mercado", "amount": "89.90",
             "date": "2026-11-05", "status": "efetivada", "origin": "manual",
             "categoryId": "…", "valueSourceId": "…", "recurrenceId": null }],
  "meta": {
    "page": 1, "pageSize": 20, "total": 39, "totalPages": 2,
    "summary": { "income": "6020.00", "expense": "3836.57", "balance": "2183.43" },
    "dayTotals": { "2026-11-05": "-89.90" }
  }
}
```

`summary` e `dayTotals` consideram **todo o conjunto filtrado** (não só a página): o extrato mostra entradas, saídas,
saldo e o saldo de cada dia sem precisar baixar todas as páginas.

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

### Contas e cartões (fontes_valor): schemas

```ts
// src/modules/value-sources/value-sources.schemas.ts
export const valueSourceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80), // único por usuário (uq_fontes_valor_usuario_nome → 409)
    type: z.enum(valueSourceTypes),
    institution: z.string().trim().max(80).nullable().optional(),
    initialBalance: z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Use ponto decimal (ex.: -150.00)."), // pode ser negativo
    active: z.boolean().default(true),
  })
  .strict();
// POST e PUT usam o mesmo corpo (PUT substitui o recurso inteiro).
```

Resposta (`GET /value-sources` → `{ data: [...] }`; `GET /value-sources/:id` → objeto):

```json
{ "id": "…", "name": "Nubank", "type": "conta_corrente", "institution": "Nubank",
  "initialBalance": "2350.00", "active": true, "currentBalance": "15923.64" }
```

`currentBalance` = saldo inicial + receitas − despesas **efetivadas** da conta, calculado no backend.
Sem `DELETE` no MVP: a conta é desativada (`active: false`); excluir manteria as transações com
`fonte_valor_id = NULL` (RNF02) e fica para quando houver a necessidade.

### Despesas fixas (recorrências, RF04): schemas e regras

```ts
// src/modules/recurrences/recurrences.schemas.ts
const recurrenceFields = {
  description: z.string().trim().min(1).max(160),
  amount: moneySchema,
  dueDay: z.number().int().min(1).max(31), // dia 29–31 vira o último dia em meses curtos
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(), // null = sem término
  categoryId: z.string().uuid().nullable().optional(),
  valueSourceId: z.string().uuid().nullable().optional(),
};

export const createRecurrenceSchema = z
  .object({ type: z.enum(transactionTypes).default("despesa"), ...recurrenceFields })
  .strict()
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "Fim antes do início." });

/** PUT: tipo imutável (como em categorias); `active` pausa/reativa. */
export const updateRecurrenceSchema = z
  .object({ ...recurrenceFields, active: z.boolean() })
  .strict()
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "Fim antes do início." });
```

Regras (serviço):

- **Criar (POST)** grava a recorrência e **materializa** as ocorrências de `startDate` até o fim do mês corrente
  (`materialize`, doc 06): transações `pendente`, `origem = "recorrencia"`, natureza `fixa` (despesa) ou `null`
  (receita). O índice único (`recorrencia_id`, `data`) torna tudo idempotente.
- **Meses seguintes: materialização sob demanda** (adotada na implementação; **aguarda confirmação** do responsável,
  item 2 do README). Antes das leituras que mostram transações (`GET /transactions`, `/dashboard/summary`,
  `/recurrences/:id` e a exportação), `materializeDue` lança os meses que faltam até o mês corrente. A coluna
  `recorrencias.ultimo_mes_materializado` (migração `0003`) guarda até onde já foi lançado; a próxima rodada continua
  do mês seguinte, então **uma ocorrência excluída pelo usuário não volta**. Sem job agendado nem infraestrutura extra.
  "Hoje" e "mês corrente" usam o fuso `America/Sao_Paulo` (`shared/dates.ts`).
- **Editar (PUT)** vale para as ocorrências **ainda não materializadas**; lançamentos existentes não mudam
  (cada um é editado no extrato). Pausada (`active: false`) não materializa nem aparece em `upcoming`; ao reativar,
  os meses da pausa até o corrente são lançados.
- **Encerrar (DELETE)** remove a recorrência; as transações já lançadas ficam no extrato com
  `recorrencia_id = NULL` (RNF02).
- **Categoria** do tipo diferente da recorrência → 400 em `categoryId` (mesma regra das transações).

Resposta de `GET /recurrences/:id` (a lista devolve os mesmos campos, sem `schedule`):

```json
{
  "id": "…", "type": "despesa", "description": "Aluguel", "amount": "1200.00", "dueDay": 5,
  "startDate": "2026-05-05", "endDate": null, "active": true, "categoryId": "…", "valueSourceId": "…",
  "schedule": [
    { "month": "2026-11", "dueDate": "2026-11-05", "status": "efetivada", "transactionId": "…" },
    { "month": "2026-12", "dueDate": "2026-12-05", "status": "prevista", "transactionId": null }
  ]
}
```

`schedule`: 6 meses a partir do mês corrente que a recorrência cobre. `status` = situação da ocorrência
materializada (`efetivada`/`pendente`) ou `prevista` quando ainda não há transação.

#### "Repetir todo mês" ao lançar uma transação

`POST /transactions` aceita o campo opcional `repeatMonthly: { dueDay, endDate }`. O backend, numa transação de banco:
cria a recorrência com `startDate = date` e os dados da transação, grava a transação com `recorrenciaId` e
`origem = "recorrencia"` (mantendo o `status` informado) e materializa o restante como no POST de recorrências.
A transação lançada **é a ocorrência do próprio mês** (mesmo que `dueDay` seja outro dia): a materialização começa
no mês seguinte. Despesa vira natureza `fixa`. `endDate` anterior à data → 400 em `repeatMonthly.endDate`.

### Importar e exportar (RF07)

**Formato CSV** (importação e exportação usam o mesmo arquivo), padrão Excel pt-BR, UTF-8:

```text
data;descricao;valor;tipo;natureza;situacao;categoria;conta
05/11/2026;Salário estágio;4.200,00;receita;;efetivada;Salário;Nubank
02/11/2026;Mercado Pão de Açúcar;214,37;despesa;variavel;efetivada;Alimentação;Cartão Inter
```

Separador `;`; data `dd/mm/aaaa` (aceita `AAAA-MM-DD` na importação); valor positivo `1.234,56`; `tipo`
`receita|despesa`; `natureza` `fixa|variavel` (vazia = variável em despesa, sempre vazia em receita);
`situacao` `efetivada|pendente` (vazia = efetivada; aceita "pago"/"recebido"); `categoria` e `conta` por nome
(opcionais). Obrigatórias: `data`, `descricao`, `valor`, `tipo`. Até 2.000 linhas e 5 MB.

**PDF do Nubank** (fatura do cartão e extrato da conta), texto extraído com `pdfjs-dist` no backend
(`src/modules/data-exchange`). Fatura: compras viram despesas variáveis; estornos (valor negativo) viram receitas;
o pagamento da fatura vem com `suggestedSkip: true` (já aparece no extrato da conta). Extrato: o bloco
"Total de entradas"/"Total de saídas" de cada dia define receita/despesa; a descrição junta o tipo do lançamento
e a contraparte ("Transferência recebida pelo Pix — FULANO").

**Fluxo em duas etapas:**

1. `POST /imports/preview` (multipart, campo `file`) → `{ source, fileName, period, rows[], errors[] }`, sem gravar.
   `source`: `csv | nubank_fatura | nubank_extrato`; cada linha traz `date`, `description`, `amount`, `type`,
   `nature`, `status`, `categoryName`, `accountName`, `installment`, `suggestedSkip`, `note`.
2. `POST /imports` com as linhas revisadas (o usuário escolhe conta e categorias e desmarca o que não quer):

```ts
export const confirmImportSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    format: z.enum(dataFormats), // "csv" | "pdf"
    rows: z
      .array(
        z.object({
          date: isoDateSchema,
          description: z.string().trim().min(1).max(160),
          amount: moneySchema,
          type: z.enum(transactionTypes),
          nature: z.enum(transactionNatures).nullable(),
          status: z.enum(transactionStatuses),
          categoryId: z.string().uuid().nullable(),
          valueSourceId: z.string().uuid().nullable(),
        }),
      )
      .min(1)
      .max(2000),
    /** Erros da pré-visualização, gravados em importacao_erros para o histórico. */
    errors: z
      .array(z.object({ line: z.number().int(), field: z.string().nullable(), message: z.string(), content: z.string().nullable() }))
      .max(2000),
  })
  .strict();
```

O backend cria a operação (`tipo = importacao`, `status = concluida` ou `concluida_com_erros`, contagem de linhas),
as transações com `origem = "importacao"` e `operacao_dados_id`, grava os erros e gera a notificação
`importacao_concluida`. Resposta 201: a operação (mesmo formato do histórico), com `Location: /api/v1/data-operations`
(não há `GET` por id no MVP).

**Histórico** `GET /data-operations` → `{ data: [{ id, type, format, status, fileName, periodStart, periodEnd,
totalRows, successRows, errorRows, errorMessage, createdAt, completedAt }] }`, mais recente primeiro.

**Exportação** `GET /exports/transactions?month=YYYY-MM&format=csv` → `text/csv; charset=utf-8` com BOM (o Excel
reconhece acentos), `Content-Disposition: attachment; filename="financecontrol-YYYY-MM.csv"`, no formato acima;
registra a operação (`tipo = exportacao`) e gera a notificação `exportacao_pronta`.

### Notificações

**Só avisos de ações do usuário, dentro do app** (decisão do responsável): não há lembretes agendados, vencimentos,
e-mail ou push. Um tipo por ação: `transacao_registrada` (inclui "repetir todo mês"), `recorrencia_criada`,
`categoria_criada`, `conta_criada`, `importacao_concluida` e `exportacao_pronta`. Canal único `app`; criadas com
`status = enviada` e marcadas como `lida` pelo usuário.

**Preferências:** `GET /notification-preferences` → `{ data: [{ type, active }] }` com todos os tipos, na ordem acima.
`PUT /notification-preferences/:type` com `{ "active": boolean }` (idempotente; tipo desconhecido → 400) devolve
`{ type, active }`. Sem linha gravada, o tipo está ativo. Tipo desligado: a ação acontece normalmente e o aviso não é
gravado (a checagem fica no próprio `INSERT ... WHERE NOT EXISTS`, uma ida ao banco).

`GET /notifications?page=&pageSize=` → `{ data: [{ id, type, title, message, status, createdAt, readAt,
transactionId, recurrenceId }], meta: { page, pageSize, total, unread } }`, mais recente primeiro.
`PUT /notifications/:id` (devolve a notificação) e `PUT /notifications` (todas; devolve `{ "updated": n }`) com
`{ "status": "lida" }`. A gravação é de melhor esforço: falha ao notificar vai para o log e não desfaz a ação.

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
