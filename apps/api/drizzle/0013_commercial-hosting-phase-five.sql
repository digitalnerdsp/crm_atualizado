CREATE TABLE "crm_company_service_flag" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"service_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_hosting_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text NOT NULL,
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
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_hosting_notice_channel_check" CHECK ("crm_hosting_notice"."channel" in ('email','whatsapp')),
	CONSTRAINT "crm_hosting_notice_status_check" CHECK ("crm_hosting_notice"."status" in ('sending','accepted','failed','uncertain','prepared','confirmed'))
);
--> statement-breakpoint
CREATE TABLE "crm_hosting_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_hosting" (
	"company_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'unknown' NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"domain" text DEFAULT '' NOT NULL,
	"renews_on" date,
	"lead_days" integer DEFAULT 30 NOT NULL,
	"contact_id" text,
	"email_allowed" boolean DEFAULT false NOT NULL,
	"whatsapp_allowed" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_hosting_mode_check" CHECK ("crm_hosting"."mode" in ('unknown','own','third_party','none')),
	CONSTRAINT "crm_hosting_lead_days_check" CHECK ("crm_hosting"."lead_days" between 0 and 365)
);
--> statement-breakpoint
ALTER TABLE "crm_company_service_flag" ADD CONSTRAINT "crm_company_service_flag_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_company_service_flag" ADD CONSTRAINT "crm_company_service_flag_service_id_crm_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."crm_service"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_notice" ADD CONSTRAINT "crm_hosting_notice_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_notice" ADD CONSTRAINT "crm_hosting_notice_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_notice" ADD CONSTRAINT "crm_hosting_notice_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_notice" ADD CONSTRAINT "crm_hosting_notice_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_revision" ADD CONSTRAINT "crm_hosting_revision_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting_revision" ADD CONSTRAINT "crm_hosting_revision_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting" ADD CONSTRAINT "crm_hosting_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_hosting" ADD CONSTRAINT "crm_hosting_contact_id_crm_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contact"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_company_service_flag_unique" ON "crm_company_service_flag" USING btree ("company_id","service_id");--> statement-breakpoint
CREATE INDEX "crm_company_service_flag_service_idx" ON "crm_company_service_flag" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_hosting_notice_request_unique" ON "crm_hosting_notice" USING btree ("workspace_id","request_id");--> statement-breakpoint
CREATE INDEX "crm_hosting_notice_company_idx" ON "crm_hosting_notice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_hosting_notice_date_idx" ON "crm_hosting_notice" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_hosting_revision_unique" ON "crm_hosting_revision" USING btree ("company_id","sequence");--> statement-breakpoint
CREATE INDEX "crm_hosting_revision_date_idx" ON "crm_hosting_revision" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crm_hosting_mode_idx" ON "crm_hosting" USING btree ("mode");