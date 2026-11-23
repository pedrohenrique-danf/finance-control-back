ALTER TABLE "usuarios" ADD COLUMN "termos_aceitos_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "termos_versao" varchar(20);--> statement-breakpoint
COMMENT ON COLUMN "usuarios"."termos_aceitos_em" IS 'Quando o usuário aceitou os termos de uso e a política de privacidade (nulo: conta criada antes do registro do aceite)';--> statement-breakpoint
COMMENT ON COLUMN "usuarios"."termos_versao" IS 'Versão dos termos aceita (data da publicação, ex.: 2026-11-23)';
