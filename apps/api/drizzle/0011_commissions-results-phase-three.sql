CREATE TABLE "finance_commission_payout" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_entry_id" text NOT NULL,
	"payable_entry_id" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_commission_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"service_id" text NOT NULL,
	"effective_date" date NOT NULL,
	"rate_bps" integer NOT NULL,
	"basis" text NOT NULL,
	"sequence" integer NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_commission_rate_check" CHECK ("finance_commission_rule"."rate_bps" between 0 and 10000),
	CONSTRAINT "finance_commission_basis_check" CHECK ("finance_commission_rule"."basis" in ('billed','received'))
);
--> statement-breakpoint
CREATE TABLE "finance_result_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"presumption_bps" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_presumption_rate_check" CHECK ("finance_result_settings"."presumption_bps" is null or "finance_result_settings"."presumption_bps" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "result_class" text DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "commission_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "commission_basis" text DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "commission_rule_id" text;--> statement-breakpoint
ALTER TABLE "finance_commission_payout" ADD CONSTRAINT "finance_commission_payout_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_commission_payout" ADD CONSTRAINT "finance_commission_payout_source_entry_id_finance_entry_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."finance_entry"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_commission_payout" ADD CONSTRAINT "finance_commission_payout_payable_entry_id_finance_entry_id_fk" FOREIGN KEY ("payable_entry_id") REFERENCES "public"."finance_entry"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_commission_rule" ADD CONSTRAINT "finance_commission_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_commission_rule" ADD CONSTRAINT "finance_commission_rule_service_id_crm_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."crm_service"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_commission_rule" ADD CONSTRAINT "finance_commission_rule_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_result_settings" ADD CONSTRAINT "finance_result_settings_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_commission_payout_entry_unique" ON "finance_commission_payout" USING btree ("payable_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_commission_payout_request_unique" ON "finance_commission_payout" USING btree ("workspace_id","request_id");--> statement-breakpoint
CREATE INDEX "finance_commission_payout_source_idx" ON "finance_commission_payout" USING btree ("source_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_commission_rule_version_unique" ON "finance_commission_rule" USING btree ("service_id","sequence");--> statement-breakpoint
CREATE INDEX "finance_commission_rule_workspace_idx" ON "finance_commission_rule" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_commission_rule_id_finance_commission_rule_id_fk" FOREIGN KEY ("commission_rule_id") REFERENCES "public"."finance_commission_rule"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_result_class_check" CHECK ("finance_entry"."result_class" in ('unclassified','direct','operating','tax','financial','commission'));--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_commission_rate_check" CHECK ("finance_entry"."commission_rate_bps" between 0 and 10000);--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_commission_basis_check" CHECK ("finance_entry"."commission_basis" in ('billed','received'));