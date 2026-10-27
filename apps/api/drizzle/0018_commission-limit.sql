ALTER TABLE "finance_commission_rule" ADD COLUMN "recurring_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_commission_rule" ADD COLUMN "recurring_months" integer;--> statement-breakpoint
-- Regras antigas: a recorrência começa com o mesmo percentual e sem limite de
-- meses, para ninguém passar a receber diferente sem ser avisado.
UPDATE "finance_commission_rule" SET "recurring_rate_bps" = "rate_bps";
