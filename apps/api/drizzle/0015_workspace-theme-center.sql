CREATE TABLE "workspace_theme" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tokens" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_theme" ADD CONSTRAINT "workspace_theme_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_theme" ADD CONSTRAINT "workspace_theme_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "workspace_theme_workspace_idx" ON "workspace_theme" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_theme_name_unique" ON "workspace_theme" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_theme_active_unique" ON "workspace_theme" USING btree ("workspace_id") WHERE "workspace_theme"."is_active";