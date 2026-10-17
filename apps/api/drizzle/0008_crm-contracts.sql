CREATE TABLE "crm_contract_event" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"type" text NOT NULL,
	"from_monthly_value_cents" bigint NOT NULL,
	"to_monthly_value_cents" bigint NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"changed_by_user_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contract_service" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"service_id" text,
	"name" text NOT NULL,
	"billing_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contract" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"number" integer NOT NULL,
	"company_id" text NOT NULL,
	"deal_id" text,
	"title" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"monthly_value_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"billing_day" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"ended_at" timestamp,
	"cancel_reason_id" text,
	"cancel_note" text,
	"owner_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_contract_workspace_number_unique" UNIQUE("workspace_id","number")
);
--> statement-breakpoint
ALTER TABLE "crm_contract_event" ADD CONSTRAINT "crm_contract_event_contract_id_crm_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contract"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract_event" ADD CONSTRAINT "crm_contract_event_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract_service" ADD CONSTRAINT "crm_contract_service_contract_id_crm_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contract"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract_service" ADD CONSTRAINT "crm_contract_service_service_id_crm_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."crm_service"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract" ADD CONSTRAINT "crm_contract_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract" ADD CONSTRAINT "crm_contract_company_id_crm_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_company"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract" ADD CONSTRAINT "crm_contract_deal_id_crm_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract" ADD CONSTRAINT "crm_contract_cancel_reason_id_crm_lost_reason_id_fk" FOREIGN KEY ("cancel_reason_id") REFERENCES "public"."crm_lost_reason"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract" ADD CONSTRAINT "crm_contract_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "crm_contract_event_contractId_idx" ON "crm_contract_event" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "crm_contract_event_occurredAt_idx" ON "crm_contract_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "crm_contract_event_type_idx" ON "crm_contract_event" USING btree ("type");--> statement-breakpoint
CREATE INDEX "crm_contract_service_contractId_idx" ON "crm_contract_service" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "crm_contract_service_serviceId_idx" ON "crm_contract_service" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "crm_contract_workspaceId_idx" ON "crm_contract" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_contract_companyId_idx" ON "crm_contract" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_contract_dealId_idx" ON "crm_contract" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_contract_workspaceId_status_idx" ON "crm_contract" USING btree ("workspace_id","status");
