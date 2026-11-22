ALTER TABLE "recorrencias" ADD COLUMN "ultimo_mes_materializado" date;--> statement-breakpoint
COMMENT ON COLUMN "recorrencias"."ultimo_mes_materializado" IS '1º dia do último mês já lançado em transacoes (materialização sob demanda; NULL = nada lançado)';
