# 99 — Rastreabilidade (Backend)

## Objetivo

Mostrar onde cada uma das seis unidades da disciplina e cada requisito do MVP foi contemplado na documentação do backend.

## Escopo

Cobre o mapeamento **unidade → arquivo** e **requisito → arquivo**. Não cria regras novas.

## Regras e padrões

### Unidade → arquivo

| Unidade | Tema | Arquivo(s) | Conceitos contemplados |
|---|---|---|---|
| 1 | Introdução ao Python (variáveis, funções, estruturas, decorators, POO) | [01-typescript-fundamentos.md](01-typescript-fundamentos.md) | tipagem estrita, `=`×`===`, parâmetros default/rest/objeto de opções, TSDoc, funções de ordem superior (decorators), `main.ts` (`__main__`), Map/Set/Record, imutabilidade, encapsulamento (`#`, closures), composição × herança, polimorfismo por interface, módulos e imports |
| 2 | HTTP, REST e primeiros passos | [02-http-rest-api.md](02-http-rest-api.md) | requisição/resposta, métodos, status codes (200/201/204/400/401/404/409/500), recursos e URIs, representação JSON, `Location`, sem estado, erros padronizados, `curl` |
| 3 | Primeira aplicação (ambiente, estrutura, config) | [03-estrutura-projeto-configuracao.md](03-estrutura-projeto-configuracao.md) | isolamento de dependências (`venv`), módulos por domínio (blueprints), `config` por ambiente, `.env`, debug × produção, `SECRET_KEY` |
| 4 | Application Factory e contextos | [04-application-factory-di-contexto.md](04-application-factory-di-contexto.md) | `createApp`, lazy initialization, IoC/DI, importação circular, Application Context × Request Context, monólito modular |
| 5 | Empacotamento e testes | [05-empacotamento-scripts-testes.md](05-empacotamento-scripts-testes.md) | `package.json` (`pyproject.toml`), dependências runtime × dev, scripts (`invoke`), unit/integração/fluxo, fixtures, cobertura |
| 6 | Estruturas básicas (persistência) | [06-persistencia-drizzle-neon-migracoes.md](06-persistencia-drizzle-neon-migracoes.md) | modelo físico, ORM, FKs e unicidade, `ON DELETE SET NULL`, migrações (`create_all` × Alembic), seed (`flask shell`), integridade |
| Transversal | Segurança e validação | [07-autenticacao-seguranca-validacao.md](07-autenticacao-seguranca-validacao.md) | Better Auth, rotas protegidas, autorização, Zod, CORS, cookies |

### Conceito da disciplina → onde está

| Conceito exigido | Arquivo |
|---|---|
| Isolamento de dependências | 03, 05 |
| Modularização e separação de responsabilidades | 02, 03, 04 |
| Application Factory | 04 |
| Inversão de controle e injeção de dependência | 04 |
| Configuração por ambiente | 03 |
| Ciclo de vida e contexto de requisição | 04 |
| Baixo acoplamento | 01, 04 |
| Monólito modular | 04 |
| Empacotamento e automação | 05 |
| Testes automatizados | 05 |
| Segurança e validação | 07 |

### Requisito do MVP → arquivo

| Requisito | Arquivo(s) |
|---|---|
| RF01 Autenticação | 07, 04 |
| RF02 Categorias | 02, 06, 07 |
| RF03 Transações | 02, 06, 07 |
| RF04 Projeção de despesas fixas | 06 |
| RF05 Dashboard | 02, 06 |
| RF06 Listagem mensal | 02, 06 |
| RF07 Importação/exportação | 02, 06 (biblioteca de CSV **[PENDENTE DE DEFINIÇÃO]**) |
| RNF02 Integridade relacional | 06, 05 |
| RNF03 Segurança, UUID | 06, 07 |
| RNF04 Validação | 07, 02 |
| RNF01 Responsividade | (frontend) |

## Exemplos de código

Não se aplica (arquivo de referência cruzada).

## Boas práticas e anti-padrões

- Atualize esta tabela sempre que um arquivo de `docs/` for criado, renomeado ou removido.
- Não registre aqui regras novas; coloque-as no arquivo temático e referencie-o.

## Checklist de conformidade

- [ ] Todas as seis unidades têm ao menos um arquivo associado.
- [ ] Todos os RFs/RNFs do MVP têm arquivo associado.
- [ ] Itens `[PENDENTE DE DEFINIÇÃO]` do índice (`README.md`) estão refletidos nos arquivos citados.
