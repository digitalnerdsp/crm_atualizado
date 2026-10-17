CREATE TABLE "finance_contract_billing" (
	"contract_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"starts_on" date NOT NULL,
	"horizon_months" integer DEFAULT 3 NOT NULL,
	"prorate_final" boolean DEFAULT false NOT NULL,
	"category_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"last_generated_at" timestamp,
	"last_warning" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_contract_horizon_check" CHECK ("finance_contract_billing"."horizon_months" between 1 and 24)
);
--> statement-breakpoint
CREATE TABLE "finance_contract_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"effective_date" date NOT NULL,
	"prorate_final" boolean DEFAULT false NOT NULL,
	"sequence" integer NOT NULL,
	"status" text NOT NULL,
	"ends_on" date,
	"billing_day" integer,
	"items" jsonb NOT NULL,
	"seller_id" text,
	"seller_name" text,
	"actor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "contract_id" text;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "contract_line_key" text;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "cycle_start" date;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "cycle_end" date;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "billing_revision_id" text;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "service_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD COLUMN "seller_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "finance_contract_billing" ADD CONSTRAINT "finance_contract_billing_contract_id_crm_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contract"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_contract_billing" ADD CONSTRAINT "finance_contract_billing_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_contract_billing" ADD CONSTRAINT "finance_contract_billing_category_id_finance_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_category"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_contract_revision" ADD CONSTRAINT "finance_contract_revision_contract_id_crm_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contract"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_contract_revision" ADD CONSTRAINT "finance_contract_revision_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_contract_revision" ADD CONSTRAINT "finance_contract_revision_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "finance_contract_billing_workspace_idx" ON "finance_contract_billing" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_contract_revision_sequence_unique" ON "finance_contract_revision" USING btree ("contract_id","sequence");--> statement-breakpoint
CREATE INDEX "finance_contract_revision_date_idx" ON "finance_contract_revision" USING btree ("contract_id","effective_date");--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_contract_id_crm_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contract"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_billing_revision_id_finance_contract_revision_id_fk" FOREIGN KEY ("billing_revision_id") REFERENCES "public"."finance_contract_revision"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_entry_contract_cycle_unique" ON "finance_entry" USING btree ("contract_id","contract_line_key","cycle_start");