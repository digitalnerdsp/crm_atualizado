CREATE TABLE "crm_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"body" text,
	"deal_id" text,
	"contact_id" text,
	"company_id" text,
	"owner_user_id" text,
	"due_at" timestamp,
	"completed_at" timestamp,
	"duration_minutes" integer,
	"outcome" text,
	"calendar_event_id" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_company" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"tax_id" text,
	"domain" text,
	"website" text,
	"phone" text,
	"industry" text,
	"employee_count" integer,
	"owner_user_id" text,
	"address_line" text,
	"address_number" text,
	"address_complement" text,
	"district" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'BR',
	"description" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"mobile" text,
	"job_title" text,
	"department" text,
	"linkedin_url" text,
	"owner_user_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"email_opt_out" boolean DEFAULT false NOT NULL,
	"consent_source" text,
	"consent_at" timestamp,
	"notes" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deal_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"role" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_deal_contact_deal_contact_unique" UNIQUE("deal_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "crm_deal_project" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"project_id" text NOT NULL,
	"relation_type" text DEFAULT 'delivery' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_deal_project_deal_project_unique" UNIQUE("deal_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "crm_deal" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"number" integer NOT NULL,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"title" text NOT NULL,
	"company_id" text,
	"primary_contact_id" text,
	"owner_user_id" text,
	"created_by_user_id" text,
	"value_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"probability" integer,
	"expected_close_date" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"won_at" timestamp,
	"lost_at" timestamp,
	"lost_reason_id" text,
	"lost_reason_note" text,
	"source" text,
	"position" integer DEFAULT 0 NOT NULL,
	"stage_entered_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp,
	"next_activity_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_deal_workspace_number_unique" UNIQUE("workspace_id","number")
);
--> statement-breakpoint
CREATE TABLE "crm_entity_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_id" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_entity_tag_tag_entity_unique" UNIQUE("tag_id","entity","entity_id")
);
--> statement-breakpoint
CREATE TABLE "crm_field_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"entity" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"show_on_card" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_field_definition_workspace_entity_key_unique" UNIQUE("workspace_id","entity","key")
);
--> statement-breakpoint
CREATE TABLE "crm_field_value" (
	"id" text PRIMARY KEY NOT NULL,
	"definition_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_field_value_definition_entity_unique" UNIQUE("definition_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "crm_lost_reason" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_lost_reason_workspace_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_pipeline_workspace_slug_unique" UNIQUE("workspace_id","slug")
);
--> statement-breakpoint
CREATE TABLE "crm_stage_history" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"from_stage_id" text,
	"to_stage_id" text,
	"changed_by_user_id" text,
	"entered_at" timestamp NOT NULL,
	"exited_at" timestamp,
	"duration_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "crm_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"outcome" text DEFAULT 'open' NOT NULL,
	"color" text,
	"rotting_days" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_stage_pipeline_slug_unique" UNIQUE("pipeline_id","slug")
);
--> statement-breakpoint
CREATE TABLE "crm_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_tag_workspace_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "crm_company_id" text;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_deal_id_crm_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_contact_id_crm_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contact"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_calendar_event_id_calendar_event_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_event"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_company" ADD CONSTRAINT "crm_company_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_company" ADD CONSTRAINT "crm_company_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal_contact" ADD CONSTRAINT "crm_deal_contact_deal_id_crm_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal_contact" ADD CONSTRAINT "crm_deal_contact_contact_id_crm_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contact"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal_project" ADD CONSTRAINT "crm_deal_project_deal_id_crm_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal_project" ADD CONSTRAINT "crm_deal_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_pipeline_id_crm_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipeline"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_stage_id_crm_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_stage"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_primary_contact_id_crm_contact_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."crm_contact"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_lost_reason_id_crm_lost_reason_id_fk" FOREIGN KEY ("lost_reason_id") REFERENCES "public"."crm_lost_reason"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_entity_tag" ADD CONSTRAINT "crm_entity_tag_tag_id_crm_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."crm_tag"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_field_definition" ADD CONSTRAINT "crm_field_definition_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_field_value" ADD CONSTRAINT "crm_field_value_definition_id_crm_field_definition_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."crm_field_definition"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_lost_reason" ADD CONSTRAINT "crm_lost_reason_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_pipeline" ADD CONSTRAINT "crm_pipeline_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD CONSTRAINT "crm_stage_history_deal_id_crm_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD CONSTRAINT "crm_stage_history_from_stage_id_crm_stage_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."crm_stage"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD CONSTRAINT "crm_stage_history_to_stage_id_crm_stage_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."crm_stage"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_stage_history" ADD CONSTRAINT "crm_stage_history_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_stage" ADD CONSTRAINT "crm_stage_pipeline_id_crm_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipeline"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_tag" ADD CONSTRAINT "crm_tag_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "crm_activity_workspaceId_idx" ON "crm_activity" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_activity_dealId_idx" ON "crm_activity" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_activity_contactId_idx" ON "crm_activity" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "crm_activity_companyId_idx" ON "crm_activity" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_activity_ownerUserId_idx" ON "crm_activity" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "crm_activity_owner_due_pending_idx" ON "crm_activity" USING btree ("owner_user_id","due_at") WHERE "crm_activity"."completed_at" is null;--> statement-breakpoint
CREATE INDEX "crm_company_workspaceId_idx" ON "crm_company" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_company_ownerUserId_idx" ON "crm_company" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "crm_company_workspaceId_domain_idx" ON "crm_company" USING btree ("workspace_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_company_workspace_taxId_unique" ON "crm_company" USING btree ("workspace_id","tax_id") WHERE "crm_company"."tax_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_contact_workspaceId_idx" ON "crm_contact" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_contact_companyId_idx" ON "crm_contact" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_contact_ownerUserId_idx" ON "crm_contact" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "crm_contact_workspaceId_email_idx" ON "crm_contact" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "crm_deal_contact_dealId_idx" ON "crm_deal_contact" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_deal_contact_contactId_idx" ON "crm_deal_contact" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "crm_deal_project_dealId_idx" ON "crm_deal_project" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_deal_project_projectId_idx" ON "crm_deal_project" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "crm_deal_workspaceId_idx" ON "crm_deal" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_deal_pipelineId_idx" ON "crm_deal" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "crm_deal_stageId_idx" ON "crm_deal" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "crm_deal_ownerUserId_idx" ON "crm_deal" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "crm_deal_companyId_idx" ON "crm_deal" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_deal_stageId_position_idx" ON "crm_deal" USING btree ("stage_id","position");--> statement-breakpoint
CREATE INDEX "crm_deal_expectedCloseDate_idx" ON "crm_deal" USING btree ("expected_close_date");--> statement-breakpoint
CREATE INDEX "crm_deal_status_idx" ON "crm_deal" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_entity_tag_entity_entityId_idx" ON "crm_entity_tag" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "crm_field_definition_workspaceId_entity_idx" ON "crm_field_definition" USING btree ("workspace_id","entity");--> statement-breakpoint
CREATE INDEX "crm_field_value_entityId_idx" ON "crm_field_value" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "crm_lost_reason_workspaceId_idx" ON "crm_lost_reason" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_pipeline_workspaceId_idx" ON "crm_pipeline" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_stage_history_dealId_idx" ON "crm_stage_history" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_stage_history_toStageId_idx" ON "crm_stage_history" USING btree ("to_stage_id");--> statement-breakpoint
CREATE INDEX "crm_stage_history_enteredAt_idx" ON "crm_stage_history" USING btree ("entered_at");--> statement-breakpoint
CREATE INDEX "crm_stage_pipelineId_idx" ON "crm_stage" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "crm_tag_workspaceId_idx" ON "crm_tag" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_crm_company_id_crm_company_id_fk" FOREIGN KEY ("crm_company_id") REFERENCES "public"."crm_company"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "project_crmCompanyId_idx" ON "project" USING btree ("crm_company_id");