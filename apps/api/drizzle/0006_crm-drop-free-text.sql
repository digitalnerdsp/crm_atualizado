/* As colunas de texto livre caem só agora: a 0005 já converteu cada valor
 * distinto numa linha de crm_segment / crm_source e preencheu as chaves. */
ALTER TABLE "crm_company" DROP COLUMN "industry";--> statement-breakpoint
ALTER TABLE "crm_deal" DROP COLUMN "source";
