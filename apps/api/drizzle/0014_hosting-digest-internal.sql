CREATE TABLE "crm_hosting_digest_item" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"company_id" text NOT NULL,
	"renews_on" date NOT NULL,
	"mark_days" integer NOT NULL,
	"listed" boolean DEFAULT true NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_hosting_digest_item_mark_check" CHECK ("crm_hosting_digest_item"."mark_days" between 1 and 365)
);
--> statement-breakpoint
CREATE TABLE "crm_hosting_digest_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_hosting_digest_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"deliveries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_hosting_digest_run_status_check" CHECK ("crm_hosting_digest_run"."status" in ('pending','sent','failed'))
);
--> statement-breakpoint
CREATE TABLE "crm_hosting_digest_setting" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"marks" jsonb DEFAULT '[30,15]'::jsonb NOT NULL,
	"include_owner" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_hosting_digest_item" ADD CONSTRAINT "crm_hosting_digest_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_digest_item" ADD CONSTRAINT "crm_hosting_digest_item_run_id_crm_hosting_digest_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."crm_hosting_digest_run"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_digest_item" ADD CONSTRAINT "crm_hosting_digest_item_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_digest_recipient" ADD CONSTRAINT "crm_hosting_digest_recipient_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_digest_recipient" ADD CONSTRAINT "crm_hosting_digest_recipient_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_digest_run" ADD CONSTRAINT "crm_hosting_digest_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_digest_setting" ADD CONSTRAINT "crm_hosting_digest_setting_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_hosting_digest_item_unique" ON "crm_hosting_digest_item" USING btree ("company_id","renews_on","mark_days");--> statement-breakpoint
CREATE INDEX "crm_hosting_digest_item_run_idx" ON "crm_hosting_digest_item" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "crm_hosting_digest_item_workspace_idx" ON "crm_hosting_digest_item" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_hosting_digest_recipient_unique" ON "crm_hosting_digest_recipient" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "crm_hosting_digest_run_workspace_idx" ON "crm_hosting_digest_run" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_hosting_digest_run_due_idx" ON "crm_hosting_digest_run" USING btree ("status","next_attempt_at");