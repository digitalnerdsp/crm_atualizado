ALTER TABLE "crm_deal_project" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "crm_deal_project" CASCADE;--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_crm_company_id_crm_company_id_fk";
--> statement-breakpoint
DROP INDEX "project_crmCompanyId_idx";--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "crm_company_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "crm_deal_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_crm_company_id_crm_company_id_fk" FOREIGN KEY ("crm_company_id") REFERENCES "public"."crm_company"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_crm_deal_id_crm_deal_id_fk" FOREIGN KEY ("crm_deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_crmCompanyId_idx" ON "task" USING btree ("crm_company_id");--> statement-breakpoint
CREATE INDEX "task_crmDealId_idx" ON "task" USING btree ("crm_deal_id");--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "crm_company_id";