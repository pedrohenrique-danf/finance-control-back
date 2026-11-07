-- Comentários do modelo físico (o Drizzle não gera COMMENT ON). Somente documentação; não altera estrutura.
COMMENT ON TABLE "usuarios" IS 'Usuários da plataforma (e-mail/senha ou Google SignIn)';--> statement-breakpoint
COMMENT ON COLUMN "usuarios"."email" IS 'Sempre salvo em minúsculas';--> statement-breakpoint
COMMENT ON TABLE "sessoes" IS 'Sessões ativas do Better Auth (cookie de sessão)';--> statement-breakpoint
COMMENT ON TABLE "contas" IS 'Credenciais por provedor (Better Auth): e-mail/senha (provedor_id = credential, hash em senha) e Google. Substitui identidades_oauth';--> statement-breakpoint
COMMENT ON COLUMN "contas"."conta_id" IS 'Identificador (sub) retornado pelo provedor';--> statement-breakpoint
COMMENT ON COLUMN "contas"."senha" IS 'Hash da senha gerado pelo Better Auth; NULL para login apenas via OAuth';--> statement-breakpoint
COMMENT ON TABLE "verificacoes" IS 'Tokens de uso único do Better Auth (verificação de e-mail e redefinição de senha). Substitui tokens_usuario';--> statement-breakpoint
COMMENT ON TABLE "categorias" IS 'Categorias personalizadas de receitas e despesas';--> statement-breakpoint
COMMENT ON COLUMN "categorias"."tipo" IS '''receita'' | ''despesa''';--> statement-breakpoint
COMMENT ON TABLE "fontes_valor" IS 'Origem/destino do dinheiro: bancos, carteira, cartões';--> statement-breakpoint
COMMENT ON COLUMN "fontes_valor"."tipo" IS '''conta_corrente'' | ''poupanca'' | ''carteira'' | ''cartao_credito'' | ''investimento'' | ''outro''';--> statement-breakpoint
COMMENT ON TABLE "recorrencias" IS 'Modelo da despesa fixa; as parcelas futuras são materializadas em transacoes';--> statement-breakpoint
COMMENT ON COLUMN "recorrencias"."tipo" IS '''receita'' | ''despesa''';--> statement-breakpoint
COMMENT ON COLUMN "recorrencias"."dia_vencimento" IS 'Dia do mês (1 a 31)';--> statement-breakpoint
COMMENT ON COLUMN "recorrencias"."data_fim" IS 'NULL = sem término';--> statement-breakpoint
COMMENT ON TABLE "importacoes_exportacoes" IS 'Histórico de cada operação de importação ou exportação de dados';--> statement-breakpoint
COMMENT ON COLUMN "importacoes_exportacoes"."tipo" IS '''importacao'' | ''exportacao''';--> statement-breakpoint
COMMENT ON COLUMN "importacoes_exportacoes"."formato" IS '''csv'' | ''xlsx''';--> statement-breakpoint
COMMENT ON COLUMN "importacoes_exportacoes"."status" IS '''pendente'' | ''processando'' | ''concluida'' | ''concluida_com_erros'' | ''falhou''';--> statement-breakpoint
COMMENT ON COLUMN "importacoes_exportacoes"."periodo_inicio" IS 'Filtro opcional da exportação';--> statement-breakpoint
COMMENT ON COLUMN "importacoes_exportacoes"."mensagem_erro" IS 'Falha geral da operação';--> statement-breakpoint
COMMENT ON TABLE "importacao_erros" IS 'Erros linha a linha encontrados durante uma importação';--> statement-breakpoint
COMMENT ON TABLE "transacoes" IS 'Receitas e despesas. Excluir categoria, fonte ou recorrência NÃO apaga a transação (RNF02)';--> statement-breakpoint
COMMENT ON COLUMN "transacoes"."tipo" IS '''receita'' | ''despesa''';--> statement-breakpoint
COMMENT ON COLUMN "transacoes"."natureza" IS 'Somente despesas: ''fixa'' | ''variavel''';--> statement-breakpoint
COMMENT ON COLUMN "transacoes"."valor" IS 'Sempre positivo; o sinal vem de tipo';--> statement-breakpoint
COMMENT ON COLUMN "transacoes"."status" IS '''pendente'' | ''efetivada''';--> statement-breakpoint
COMMENT ON COLUMN "transacoes"."origem" IS '''manual'' | ''recorrencia'' | ''importacao''';--> statement-breakpoint
COMMENT ON TABLE "notificacoes" IS 'Fila e histórico de avisos (lembretes de registro, vencimentos, etc.)';--> statement-breakpoint
COMMENT ON COLUMN "notificacoes"."tipo" IS '''lembrete_registro'' | ''vencimento_despesa'' | ''importacao_concluida'' | ''exportacao_pronta'' | ''sistema''';--> statement-breakpoint
COMMENT ON COLUMN "notificacoes"."canal" IS '''app'' | ''email'' | ''push''';--> statement-breakpoint
COMMENT ON COLUMN "notificacoes"."status" IS '''pendente'' | ''enviada'' | ''lida'' | ''falha''';--> statement-breakpoint
COMMENT ON TABLE "preferencias_notificacao" IS 'Quais avisos o usuário deseja receber, por qual canal e em que horário';--> statement-breakpoint
COMMENT ON COLUMN "preferencias_notificacao"."antecedencia_dias" IS 'Dias de antecedência para avisos de vencimento';
