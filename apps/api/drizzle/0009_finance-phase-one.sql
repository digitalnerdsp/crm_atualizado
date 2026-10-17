CREATE TABLE "finance_category" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"direction" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_category_direction_check" CHECK ("finance_category"."direction" in ('payable', 'receivable'))
);
--> statement-breakpoint
CREATE TABLE "finance_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"description" text NOT NULL,
	"direction" text NOT NULL,
	"kind" text DEFAULT 'operating' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"competence_date" date NOT NULL,
	"due_date" date NOT NULL,
	"category_id" text,
	"party_id" text,
	"party_name" text NOT NULL,
	"labor_type" text,
	"company_id" text,
	"service_id" text,
	"seller_id" text,
	"payment_method" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"series_id" text NOT NULL,
	"request_signature" text NOT NULL,
	"installment" integer DEFAULT 1 NOT NULL,
	"installment_count" integer DEFAULT 1 NOT NULL,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_entry_amount_check" CHECK ("finance_entry"."amount_cents" > 0 and "finance_entry"."amount_cents" <= 1000000000000),
	CONSTRAINT "finance_entry_direction_check" CHECK ("finance_entry"."direction" in ('payable','receivable')),
	CONSTRAINT "finance_entry_kind_check" CHECK ("finance_entry"."kind" in ('operating','opening','transfer'))
);
--> statement-breakpoint
CREATE TABLE "finance_party" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"labor_type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_party_labor_check" CHECK ("finance_party"."labor_type" is null or "finance_party"."labor_type" in ('pj', 'freelance', 'clt'))
);
--> statement-breakpoint
CREATE TABLE "finance_settlement" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"request_id" text NOT NULL,
	"date" date NOT NULL,
	"principal_cents" bigint NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"interest_cents" bigint DEFAULT 0 NOT NULL,
	"fine_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"actor_user_id" text,
	"reversed_at" timestamp,
	"reverse_reason" text,
	"reversed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_settlement_amount_check" CHECK ("finance_settlement"."principal_cents" > 0 and "finance_settlement"."discount_cents" >= 0 and "finance_settlement"."discount_cents" <= "finance_settlement"."principal_cents" and "finance_settlement"."interest_cents" >= 0 and "finance_settlement"."fine_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "finance_category" ADD CONSTRAINT "finance_category_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_category" ADD CONSTRAINT "finance_category_parent_id_finance_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."finance_category"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_category_id_finance_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_category"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_party_id_finance_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."finance_party"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_service_id_crm_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."crm_service"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_entry" ADD CONSTRAINT "finance_entry_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_party" ADD CONSTRAINT "finance_party_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_settlement" ADD CONSTRAINT "finance_settlement_entry_id_finance_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."finance_entry"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_settlement" ADD CONSTRAINT "finance_settlement_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_settlement" ADD CONSTRAINT "finance_settlement_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "finance_category_workspace_idx" ON "finance_category" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "finance_entry_workspace_due_idx" ON "finance_entry" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "finance_entry_workspace_competence_idx" ON "finance_entry" USING btree ("workspace_id","competence_date");--> statement-breakpoint
CREATE INDEX "finance_entry_category_idx" ON "finance_entry" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "finance_entry_party_idx" ON "finance_entry" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "finance_entry_company_idx" ON "finance_entry" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "finance_entry_service_idx" ON "finance_entry" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "finance_entry_seller_idx" ON "finance_entry" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_entry_series_unique" ON "finance_entry" USING btree ("workspace_id","series_id","installment");--> statement-breakpoint
CREATE INDEX "finance_party_workspace_idx" ON "finance_party" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "finance_settlement_entry_idx" ON "finance_settlement" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "finance_settlement_date_idx" ON "finance_settlement" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_settlement_request_unique" ON "finance_settlement" USING btree ("entry_id","request_id");