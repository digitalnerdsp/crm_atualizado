CREATE TABLE "finance_labor_rate" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"effective_on" date NOT NULL,
	"hourly_cents" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_labor_rate_positive" CHECK ("finance_labor_rate"."hourly_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "finance_site_entry" (
	"entry_id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_site" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text NOT NULL,
	"contract_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"include_scenario" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_site_task" (
	"task_id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"estimate_minutes" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_site_task_estimate_check" CHECK ("finance_site_task"."estimate_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "finance_site_worker" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mode" text NOT NULL,
	"fixed_cents" bigint DEFAULT 0 NOT NULL,
	"charged_on" date NOT NULL,
	"source_entry_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_case" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_date" date NOT NULL,
	"company_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"owner_user_id" text,
	"next_on" date,
	"next_action" text DEFAULT '' NOT NULL,
	"promise_on" date,
	"promise_cents" bigint,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text NOT NULL,
	"contract_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"proposed_cents" bigint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"decision" text DEFAULT '' NOT NULL,
	"approved_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_event" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"actor_user_id" text,
	"note" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"case_id" text NOT NULL,
	"request_id" text NOT NULL,
	"signature" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"error" text,
	"actor_user_id" text,
	"confirmed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_labor_rate" ADD CONSTRAINT "finance_labor_rate_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_labor_rate" ADD CONSTRAINT "finance_labor_rate_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site_entry" ADD CONSTRAINT "finance_site_entry_entry_id_finance_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."finance_entry"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site_entry" ADD CONSTRAINT "finance_site_entry_site_id_finance_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."finance_site"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site" ADD CONSTRAINT "finance_site_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site" ADD CONSTRAINT "finance_site_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site" ADD CONSTRAINT "finance_site_contract_id_crm_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contract"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site_task" ADD CONSTRAINT "finance_site_task_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site_task" ADD CONSTRAINT "finance_site_task_site_id_finance_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."finance_site"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site_worker" ADD CONSTRAINT "finance_site_worker_site_id_finance_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."finance_site"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site_worker" ADD CONSTRAINT "finance_site_worker_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_site_worker" ADD CONSTRAINT "finance_site_worker_source_entry_id_finance_entry_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."finance_entry"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_case" ADD CONSTRAINT "portfolio_case_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_case" ADD CONSTRAINT "portfolio_case_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_case" ADD CONSTRAINT "portfolio_case_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_draft" ADD CONSTRAINT "portfolio_draft_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_draft" ADD CONSTRAINT "portfolio_draft_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_draft" ADD CONSTRAINT "portfolio_draft_contract_id_crm_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contract"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_draft" ADD CONSTRAINT "portfolio_draft_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_event" ADD CONSTRAINT "portfolio_event_case_id_portfolio_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."portfolio_case"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_event" ADD CONSTRAINT "portfolio_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_notice" ADD CONSTRAINT "portfolio_notice_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_notice" ADD CONSTRAINT "portfolio_notice_case_id_portfolio_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."portfolio_case"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_notice" ADD CONSTRAINT "portfolio_notice_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portfolio_notice" ADD CONSTRAINT "portfolio_notice_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_labor_rate_date_unique" ON "finance_labor_rate" USING btree ("workspace_id","user_id","effective_on");--> statement-breakpoint
CREATE INDEX "finance_site_entry_site_idx" ON "finance_site_entry" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "finance_site_workspace_idx" ON "finance_site" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "finance_site_company_idx" ON "finance_site" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "finance_site_task_site_idx" ON "finance_site_task" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_site_worker_unique" ON "finance_site_worker" USING btree ("site_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_site_worker_source_unique" ON "finance_site_worker" USING btree ("source_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_case_source_unique" ON "portfolio_case" USING btree ("workspace_id","source_kind","source_id","source_date");--> statement-breakpoint
CREATE INDEX "portfolio_case_workspace_idx" ON "portfolio_case" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "portfolio_draft_workspace_idx" ON "portfolio_draft" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "portfolio_event_case_idx" ON "portfolio_event" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_notice_request_unique" ON "portfolio_notice" USING btree ("workspace_id","request_id");--> statement-breakpoint
CREATE INDEX "portfolio_notice_case_idx" ON "portfolio_notice" USING btree ("case_id");--> statement-breakpoint
-- Preserve the previous cancellation/reversal rights while introducing explicit
-- permissions. New finance_legal roles are seeded afterwards without them.
DO $$
DECLARE r record; p jsonb; actions jsonb;
BEGIN
 FOR r IN SELECT id, permission FROM workspace_role WHERE role <> 'finance_legal' LOOP
  BEGIN p := r.permission::jsonb; EXCEPTION WHEN invalid_text_representation THEN CONTINUE; END;
  IF jsonb_typeof(p->'finance') = 'array' THEN
   actions := p->'finance';
   IF actions ? 'settle' AND NOT actions ? 'reverse' THEN actions := actions || '["reverse"]'::jsonb; END IF;
   IF actions ? 'update' AND NOT actions ? 'cancel' THEN actions := actions || '["cancel"]'::jsonb; END IF;
   UPDATE workspace_role SET permission = jsonb_set(p,'{finance}',actions)::text WHERE id=r.id;
  END IF;
 END LOOP;
END $$;
