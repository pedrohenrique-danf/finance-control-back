ALTER TABLE "preferencias_notificacao" DROP CONSTRAINT "ck_preferencias_notificacao_antecedencia";--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" DROP CONSTRAINT "ck_preferencias_notificacao_tipo";--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" DROP CONSTRAINT "ck_preferencias_notificacao_canal";--> statement-breakpoint
ALTER TABLE "notificacoes" DROP CONSTRAINT "ck_notificacoes_tipo";--> statement-breakpoint
ALTER TABLE "notificacoes" DROP CONSTRAINT "ck_notificacoes_canal";--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" ALTER COLUMN "canal" SET DEFAULT 'app';--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" DROP COLUMN "horario_preferido";--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" DROP COLUMN "antecedencia_dias";--> statement-breakpoint
-- Dados: o tipo genérico 'sistema' vira o tipo da ação que gerou o aviso (vínculo ou título).
UPDATE "notificacoes" SET "tipo" = CASE
  WHEN "transacao_id" IS NOT NULL OR "titulo" IN ('Receita registrada', 'Despesa registrada') THEN 'transacao_registrada'
  WHEN "recorrencia_id" IS NOT NULL OR "titulo" IN ('Receita fixa criada', 'Despesa fixa criada') THEN 'recorrencia_criada'
  WHEN "titulo" = 'Categoria criada' THEN 'categoria_criada'
  WHEN "titulo" = 'Conta criada' THEN 'conta_criada'
  ELSE "tipo"
END
WHERE "tipo" NOT IN ('importacao_concluida', 'exportacao_pronta');--> statement-breakpoint
-- Lembretes, vencimentos e outros canais saíram do escopo (só avisos de ações, no app).
DELETE FROM "notificacoes"
WHERE "canal" <> 'app'
  OR "tipo" NOT IN ('transacao_registrada', 'recorrencia_criada', 'categoria_criada', 'conta_criada', 'importacao_concluida', 'exportacao_pronta');--> statement-breakpoint
DELETE FROM "preferencias_notificacao"
WHERE "canal" <> 'app'
  OR "tipo" NOT IN ('transacao_registrada', 'recorrencia_criada', 'categoria_criada', 'conta_criada', 'importacao_concluida', 'exportacao_pronta');--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" ADD CONSTRAINT "ck_preferencias_notificacao_tipo" CHECK ("preferencias_notificacao"."tipo" in ('transacao_registrada', 'recorrencia_criada', 'categoria_criada', 'conta_criada', 'importacao_concluida', 'exportacao_pronta'));--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" ADD CONSTRAINT "ck_preferencias_notificacao_canal" CHECK ("preferencias_notificacao"."canal" in ('app'));--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "ck_notificacoes_tipo" CHECK ("notificacoes"."tipo" in ('transacao_registrada', 'recorrencia_criada', 'categoria_criada', 'conta_criada', 'importacao_concluida', 'exportacao_pronta'));--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "ck_notificacoes_canal" CHECK ("notificacoes"."canal" in ('app'));--> statement-breakpoint
COMMENT ON TABLE "preferencias_notificacao" IS 'Avisos de ações que o usuário quer receber; sem linha para o tipo = ativo';--> statement-breakpoint
COMMENT ON TABLE "notificacoes" IS 'Avisos gerados pelas ações do usuário, exibidos no app';--> statement-breakpoint
COMMENT ON COLUMN "notificacoes"."tipo" IS '''transacao_registrada'' | ''recorrencia_criada'' | ''categoria_criada'' | ''conta_criada'' | ''importacao_concluida'' | ''exportacao_pronta''';--> statement-breakpoint
COMMENT ON COLUMN "notificacoes"."canal" IS '''app'' (único canal)';--> statement-breakpoint
COMMENT ON COLUMN "preferencias_notificacao"."tipo" IS 'Mesmo domínio de notificacoes.tipo';
