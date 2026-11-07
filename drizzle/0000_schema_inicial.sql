CREATE TABLE "contas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"conta_id" text NOT NULL,
	"provedor_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expira_em" timestamp with time zone,
	"refresh_token_expira_em" timestamp with time zone,
	"escopo" text,
	"senha" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"endereco_ip" text,
	"user_agent" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_sessoes_token" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"email" varchar(254) NOT NULL,
	"email_verificado" boolean DEFAULT false NOT NULL,
	"imagem" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultimo_login_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_usuarios_email" UNIQUE("email"),
	CONSTRAINT "ck_usuarios_email" CHECK ("usuarios"."email" = lower("usuarios"."email"))
);
--> statement-breakpoint
CREATE TABLE "verificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identificador" text NOT NULL,
	"valor" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" varchar(60) NOT NULL,
	"tipo" varchar(10) NOT NULL,
	"cor" char(7) DEFAULT '#6B7280' NOT NULL,
	"icone" varchar(40),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_categorias_tipo" CHECK ("categorias"."tipo" in ('receita', 'despesa')),
	CONSTRAINT "ck_categorias_cor" CHECK ("categorias"."cor" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "importacoes_exportacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" varchar(12) NOT NULL,
	"formato" varchar(10) NOT NULL,
	"status" varchar(25) DEFAULT 'pendente' NOT NULL,
	"nome_arquivo" varchar(255),
	"periodo_inicio" date,
	"periodo_fim" date,
	"total_linhas" integer DEFAULT 0 NOT NULL,
	"linhas_sucesso" integer DEFAULT 0 NOT NULL,
	"linhas_erro" integer DEFAULT 0 NOT NULL,
	"mensagem_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone,
	CONSTRAINT "ck_importacoes_exportacoes_tipo" CHECK ("importacoes_exportacoes"."tipo" in ('importacao', 'exportacao')),
	CONSTRAINT "ck_importacoes_exportacoes_formato" CHECK ("importacoes_exportacoes"."formato" in ('csv', 'xlsx')),
	CONSTRAINT "ck_importacoes_exportacoes_status" CHECK ("importacoes_exportacoes"."status" in ('pendente', 'processando', 'concluida', 'concluida_com_erros', 'falhou')),
	CONSTRAINT "ck_importacoes_exportacoes_periodo" CHECK ("importacoes_exportacoes"."periodo_inicio" is null or "importacoes_exportacoes"."periodo_fim" is null or "importacoes_exportacoes"."periodo_fim" >= "importacoes_exportacoes"."periodo_inicio"),
	CONSTRAINT "ck_importacoes_exportacoes_linhas" CHECK ("importacoes_exportacoes"."total_linhas" >= 0 and "importacoes_exportacoes"."linhas_sucesso" >= 0 and "importacoes_exportacoes"."linhas_erro" >= 0)
);
--> statement-breakpoint
CREATE TABLE "importacao_erros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operacao_id" uuid NOT NULL,
	"numero_linha" integer NOT NULL,
	"campo" varchar(60),
	"mensagem" text NOT NULL,
	"conteudo_linha" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferencias_notificacao" (
	"usuario_id" uuid NOT NULL,
	"tipo" varchar(25) NOT NULL,
	"canal" varchar(10) NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"horario_preferido" time DEFAULT '20:00' NOT NULL,
	"antecedencia_dias" smallint DEFAULT 1 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_preferencias_notificacao" PRIMARY KEY("usuario_id","tipo","canal"),
	CONSTRAINT "ck_preferencias_notificacao_tipo" CHECK ("preferencias_notificacao"."tipo" in ('lembrete_registro', 'vencimento_despesa', 'importacao_concluida', 'exportacao_pronta', 'sistema')),
	CONSTRAINT "ck_preferencias_notificacao_canal" CHECK ("preferencias_notificacao"."canal" in ('app', 'email', 'push')),
	CONSTRAINT "ck_preferencias_notificacao_antecedencia" CHECK ("preferencias_notificacao"."antecedencia_dias" between 0 and 30)
);
--> statement-breakpoint
CREATE TABLE "notificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"transacao_id" uuid,
	"recorrencia_id" uuid,
	"tipo" varchar(25) NOT NULL,
	"canal" varchar(10) DEFAULT 'app' NOT NULL,
	"titulo" varchar(120) NOT NULL,
	"mensagem" text NOT NULL,
	"status" varchar(10) DEFAULT 'pendente' NOT NULL,
	"agendada_para" timestamp with time zone DEFAULT now() NOT NULL,
	"enviada_em" timestamp with time zone,
	"lida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_notificacoes_tipo" CHECK ("notificacoes"."tipo" in ('lembrete_registro', 'vencimento_despesa', 'importacao_concluida', 'exportacao_pronta', 'sistema')),
	CONSTRAINT "ck_notificacoes_canal" CHECK ("notificacoes"."canal" in ('app', 'email', 'push')),
	CONSTRAINT "ck_notificacoes_status" CHECK ("notificacoes"."status" in ('pendente', 'enviada', 'lida', 'falha'))
);
--> statement-breakpoint
CREATE TABLE "recorrencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"categoria_id" uuid,
	"fonte_valor_id" uuid,
	"tipo" varchar(10) DEFAULT 'despesa' NOT NULL,
	"descricao" varchar(160) NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"dia_vencimento" smallint NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_recorrencias_tipo" CHECK ("recorrencias"."tipo" in ('receita', 'despesa')),
	CONSTRAINT "ck_recorrencias_valor" CHECK ("recorrencias"."valor" > 0),
	CONSTRAINT "ck_recorrencias_dia" CHECK ("recorrencias"."dia_vencimento" between 1 and 31),
	CONSTRAINT "ck_recorrencias_datas" CHECK ("recorrencias"."data_fim" is null or "recorrencias"."data_fim" >= "recorrencias"."data_inicio")
);
--> statement-breakpoint
CREATE TABLE "transacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"categoria_id" uuid,
	"fonte_valor_id" uuid,
	"recorrencia_id" uuid,
	"operacao_dados_id" uuid,
	"tipo" varchar(10) NOT NULL,
	"natureza" varchar(10),
	"descricao" varchar(160) NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"data_transacao" date NOT NULL,
	"status" varchar(10) DEFAULT 'efetivada' NOT NULL,
	"origem" varchar(12) DEFAULT 'manual' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_transacoes_tipo" CHECK ("transacoes"."tipo" in ('receita', 'despesa')),
	CONSTRAINT "ck_transacoes_natureza" CHECK (("transacoes"."tipo" = 'receita' and "transacoes"."natureza" is null) or ("transacoes"."tipo" = 'despesa' and "transacoes"."natureza" in ('fixa', 'variavel'))),
	CONSTRAINT "ck_transacoes_valor" CHECK ("transacoes"."valor" > 0),
	CONSTRAINT "ck_transacoes_data" CHECK ("transacoes"."data_transacao" >= date '2000-01-01'),
	CONSTRAINT "ck_transacoes_status" CHECK ("transacoes"."status" in ('pendente', 'efetivada')),
	CONSTRAINT "ck_transacoes_origem" CHECK ("transacoes"."origem" in ('manual', 'recorrencia', 'importacao'))
);
--> statement-breakpoint
CREATE TABLE "fontes_valor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nome" varchar(80) NOT NULL,
	"tipo" varchar(20) DEFAULT 'conta_corrente' NOT NULL,
	"instituicao" varchar(80),
	"saldo_inicial" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_fontes_valor_tipo" CHECK ("fontes_valor"."tipo" in ('conta_corrente', 'poupanca', 'carteira', 'cartao_credito', 'investimento', 'outro'))
);
--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes_exportacoes" ADD CONSTRAINT "importacoes_exportacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacao_erros" ADD CONSTRAINT "importacao_erros_operacao_id_importacoes_exportacoes_id_fk" FOREIGN KEY ("operacao_id") REFERENCES "public"."importacoes_exportacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" ADD CONSTRAINT "preferencias_notificacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_transacao_id_transacoes_id_fk" FOREIGN KEY ("transacao_id") REFERENCES "public"."transacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_recorrencia_id_recorrencias_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."recorrencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_fonte_valor_id_fontes_valor_id_fk" FOREIGN KEY ("fonte_valor_id") REFERENCES "public"."fontes_valor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_fonte_valor_id_fontes_valor_id_fk" FOREIGN KEY ("fonte_valor_id") REFERENCES "public"."fontes_valor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_recorrencia_id_recorrencias_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."recorrencias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_operacao_dados_id_importacoes_exportacoes_id_fk" FOREIGN KEY ("operacao_dados_id") REFERENCES "public"."importacoes_exportacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fontes_valor" ADD CONSTRAINT "fontes_valor_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contas_provedor_conta" ON "contas" USING btree ("provedor_id","conta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contas_usuario_provedor" ON "contas" USING btree ("usuario_id","provedor_id");--> statement-breakpoint
CREATE INDEX "idx_sessoes_usuario" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "idx_verificacoes_identificador" ON "verificacoes" USING btree ("identificador");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_categorias_usuario_tipo_nome" ON "categorias" USING btree ("usuario_id","tipo","nome");--> statement-breakpoint
CREATE INDEX "idx_importacoes_exportacoes_usuario_criado" ON "importacoes_exportacoes" USING btree ("usuario_id","criado_em");--> statement-breakpoint
CREATE INDEX "idx_importacao_erros_operacao" ON "importacao_erros" USING btree ("operacao_id");--> statement-breakpoint
CREATE INDEX "idx_notificacoes_usuario_status" ON "notificacoes" USING btree ("usuario_id","status");--> statement-breakpoint
CREATE INDEX "idx_notificacoes_fila" ON "notificacoes" USING btree ("status","agendada_para");--> statement-breakpoint
CREATE INDEX "idx_notificacoes_transacao" ON "notificacoes" USING btree ("transacao_id");--> statement-breakpoint
CREATE INDEX "idx_notificacoes_recorrencia" ON "notificacoes" USING btree ("recorrencia_id");--> statement-breakpoint
CREATE INDEX "idx_recorrencias_usuario" ON "recorrencias" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transacoes_recorrencia_data" ON "transacoes" USING btree ("recorrencia_id","data_transacao");--> statement-breakpoint
CREATE INDEX "idx_transacoes_usuario_data" ON "transacoes" USING btree ("usuario_id","data_transacao");--> statement-breakpoint
CREATE INDEX "idx_transacoes_categoria" ON "transacoes" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "idx_transacoes_fonte_valor" ON "transacoes" USING btree ("fonte_valor_id");--> statement-breakpoint
CREATE INDEX "idx_transacoes_operacao_dados" ON "transacoes" USING btree ("operacao_dados_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_fontes_valor_usuario_nome" ON "fontes_valor" USING btree ("usuario_id","nome");