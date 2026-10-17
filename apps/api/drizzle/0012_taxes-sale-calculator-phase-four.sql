CREATE TABLE "finance_tax_profile_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"items" jsonb NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_tax_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_tax_simulation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"request_id" text NOT NULL,
	"request_signature" text NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"service_id" text,
	"seller_id" text,
	"actor_user_id" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_tax_profile_revision" ADD CONSTRAINT "finance_tax_profile_revision_profile_id_finance_tax_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."finance_tax_profile"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_tax_profile_revision" ADD CONSTRAINT "finance_tax_profile_revision_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_tax_profile" ADD CONSTRAINT "finance_tax_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_tax_simulation" ADD CONSTRAINT "finance_tax_simulation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_tax_simulation" ADD CONSTRAINT "finance_tax_simulation_profile_id_finance_tax_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."finance_tax_profile"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_tax_simulation" ADD CONSTRAINT "finance_tax_simulation_revision_id_finance_tax_profile_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."finance_tax_profile_revision"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_tax_simulation" ADD CONSTRAINT "finance_tax_simulation_service_id_crm_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."crm_service"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_tax_simulation" ADD CONSTRAINT "finance_tax_simulation_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_tax_simulation" ADD CONSTRAINT "finance_tax_simulation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_tax_profile_revision_unique" ON "finance_tax_profile_revision" USING btree ("profile_id","sequence");--> statement-breakpoint
CREATE INDEX "finance_tax_profile_workspace_idx" ON "finance_tax_profile" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_tax_simulation_request_unique" ON "finance_tax_simulation" USING btree ("workspace_id","request_id");--> statement-breakpoint
CREATE INDEX "finance_tax_simulation_date_idx" ON "finance_tax_simulation" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE INDEX "finance_tax_simulation_profile_idx" ON "finance_tax_simulation" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "finance_tax_simulation_revision_idx" ON "finance_tax_simulation" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "finance_tax_simulation_service_idx" ON "finance_tax_simulation" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "finance_tax_simulation_seller_idx" ON "finance_tax_simulation" USING btree ("seller_id");