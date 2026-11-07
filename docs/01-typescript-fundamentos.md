# 01 — Fundamentos de TypeScript no Backend

> Unidade 1 (fundamentos da linguagem, funções, estruturas de dados, decorators, POO) traduzida para TypeScript.

## Objetivo

Definir como escrever TypeScript de forma tipada, legível e segura no backend do FinanceControl, usando os equivalentes dos conceitos de Python estudados: type hints, funções, `*args/**kwargs`, docstrings, decorators, classes, encapsulamento, herança vs. composição, módulos e `if __name__ == "__main__"`.

## Escopo

**Cobre:** tipagem, funções, estruturas de dados, imutabilidade, encapsulamento, composição, polimorfismo, módulos e imports, convenções de nomes.
**Não cobre:** HTTP (02), estrutura de pastas (03), DI e factory (04).

## Regras e padrões

### Mapa Python → TypeScript

| Conceito (Unidade 1) | Padrão no projeto |
|---|---|
| Tipagem dinâmica + type hints | `strict: true`; tipos explícitos nas fronteiras (parâmetros e retorno de funções exportadas) |
| `=` vs `==` | Use `const`/`let` para atribuir e **sempre `===`** para comparar. Nunca `==` |
| Valores `None` | `null` para "ausente conhecido"; `undefined` para "não informado". Nunca misture no mesmo campo |
| Parâmetros default | `function f(x: number, y = 0)` |
| `*args` | `...args: T[]` (rest) |
| `**kwargs` / argumentos nomeados | **objeto de opções tipado**: `f({ month, page })` |
| Retorno de múltiplos valores | objeto (`{ items, total }`); tupla só para pares óbvios |
| Docstring (PEP 257) | TSDoc (`/** ... */`) em funções exportadas não óbvias |
| Decorators | funções de ordem superior (`withX(fn)`) e middlewares. **Não use** decorators experimentais |
| `if __name__ == "__main__"` | somente `src/main.ts` inicia o servidor; nenhum outro módulo executa efeitos ao ser importado |
| dict / set / tuple | `Record<K, V>` ou `Map`; `Set`; tuplas `readonly [A, B]` |
| `@dataclass(frozen=True)` | tipos `Readonly<T>` / `readonly` e `z.infer` de schemas Zod |
| `@property` com validação | função/objeto que valida via Zod na criação; não use setters mutáveis |
| Name mangling `__x` | campos privados `#x` ou variáveis em closure |
| Herança vs. composição | **composição por padrão**; herança só para a hierarquia de erros (`AppError`) |
| Polimorfismo / duck typing | `interface` (tipagem estrutural) com implementações intercambiáveis |
| Módulos/pacotes, PEP 8 (imports no topo) | ES Modules; imports sempre no topo; sem `require` |

### Tipagem

- `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- Dados externos (body, query, env, resposta de provedor) entram como `unknown` e são validados com Zod.
- Derive tipos dos schemas: `type CreateCategoryInput = z.output<typeof createCategorySchema>`.
- Derive tipos de banco do Drizzle: `typeof categories.$inferSelect`.
- Uma única definição de enum, reutilizada por Zod e Drizzle (ver exemplo).

### Funções

- Uma função faz uma coisa. Prefira funções puras para regras de cálculo (datas, valores).
- Com mais de 2 parâmetros, use objeto de opções.
- Anote o tipo de retorno de funções exportadas.
- Lance erros de domínio (`AppError`), nunca strings.

### Encapsulamento e composição

- Serviços e repositórios são **funções fábrica** que recebem dependências e devolvem um objeto (closure = estado privado).
- Use classe somente quando houver identidade/estado com ciclo de vida próprio. Se usar, declare campos com `readonly`/`#` e injete dependências no construtor.
- Defina **interfaces** para repositórios; assim serviços são testáveis com implementações em memória.

### Imports e módulos

- Imports no topo, ordenados: built-ins/pacotes → `@/` internos → relativos.
- Cada módulo de domínio expõe sua API pública em `index.ts`. Não importe arquivos internos de outro módulo.
- Proibido o "import no fim do arquivo" para contornar ciclo; corrija a dependência (ver arquivo 04).

### Nomes

| Item | Convenção | Exemplo |
|---|---|---|
| Arquivos | `kebab-case` + sufixo de papel | `categories.service.ts` |
| Tipos/interfaces | `PascalCase` | `CategoriesRepository` |
| Funções/variáveis | `camelCase` | `createCategoriesService` |
| Fábricas | prefixo `create` | `createApp` |
| Constantes de enum | `as const` + `camelCase` | `transactionTypes` |
| Tabelas/colunas no banco | pt-BR `snake_case` conforme o modelo físico | `transacoes.data_transacao` |

## Exemplos de código

### Enum com fonte única (Zod + Drizzle)

```ts
// src/shared/enums.ts
export const transactionTypes = ["income", "expense"] as const;
export const transactionNatures = ["fixed", "variable"] as const;
export const transactionOrigins = ["manual", "recurrence", "import"] as const;

export type TransactionType = (typeof transactionTypes)[number];
```

```ts
// uso em Zod
const typeSchema = z.enum(transactionTypes);
```

### Objeto de opções tipado (equivalente a `**kwargs`)

```ts
/** Lista transações do mês informado, paginadas. */
export async function listTransactions(options: {
  userId: string;
  month: string; // "YYYY-MM"
  page?: number;
  pageSize?: number;
}): Promise<{ items: Transaction[]; total: number }> {
  const { userId, month, page = 1, pageSize = 20 } = options;
  // ...
}
```

### Função de ordem superior (equivalente a decorator)

```ts
// src/app/http/with-timing.ts
export function withTiming(handler: RouteHandler): RouteHandler {
  return async (req, ctx, params) => {
    const start = performance.now();
    try {
      return await handler(req, ctx, params);
    } finally {
      ctx.logger.debug("handler_timing", { ms: Math.round(performance.now() - start) });
    }
  };
}
```

### Interface + implementações (polimorfismo / duck typing)

```ts
export interface CategoriesRepository {
  findById(userId: string, id: string): Promise<Category | null>;
}

// produção: createCategoriesRepository(db) — implementação com Drizzle (ver 06)

// teste: implementação em memória
export function createInMemoryCategoriesRepository(seed: Category[] = []): CategoriesRepository {
  const rows = new Map(seed.map((c) => [c.id, c]));
  return {
    async findById(userId, id) {
      const row = rows.get(id);
      return row && row.userId === userId ? row : null;
    },
  };
}
```

### Contrato rígido (lição do dicionário sem `preco`)

Em Python um dict sem `preco` falha só em runtime (`KeyError`). Em TypeScript, valide na fronteira para que objetos inválidos nunca circulem:

```ts
const input = parseWith(createTransactionSchema, rawBody); // lança ValidationError (400)
await service.create(userId, input);                        // service só recebe dado válido
```

### Ponto de entrada sem efeitos colaterais

```ts
// src/main.ts — ÚNICO arquivo que inicia o processo
import { serve } from "@hono/node-server";
import { loadConfig } from "@/app/config";
import { createApp } from "@/app/create-app";
import { createHonoServer } from "@/app/http/hono-adapter";

const app = createApp(loadConfig());
serve({ fetch: createHonoServer(app).fetch, port: app.config.port }); // registra as rotas no Hono e sobe o servidor
```

## Boas práticas e anti-padrões

| Faça | Evite |
|---|---|
| `unknown` + Zod nas fronteiras | `any`, `as` para "forçar" tipo |
| Funções puras para cálculo | Lógica de negócio dentro de handlers |
| Composição e interfaces | Herança profunda; herança múltipla |
| `===` | `==` |
| Erros tipados (`AppError`) | `throw "mensagem"`, `catch {}` vazio |
| Imports no topo | Import circular "resolvido" movendo import |
| `readonly`/imutabilidade | Mutar objetos recebidos como parâmetro |
| Valores monetários como string decimal | `number` (float) para dinheiro |
| Efeitos só em `main.ts` | Código que conecta ao banco ao ser importado |

## Checklist de conformidade

- [ ] `tsc --noEmit` passa sem erros e sem `any`.
- [ ] Funções exportadas têm tipo de retorno.
- [ ] Dados externos passam por Zod antes de uso.
- [ ] Nenhum módulo (exceto `main.ts`) executa efeitos ao ser importado.
- [ ] Repositórios têm `interface` e serviços dependem da interface.
- [ ] Nenhum cálculo monetário com `number`.
- [ ] Imports no topo; nenhum ciclo entre módulos.
