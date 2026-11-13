CREATE TABLE "crm_contract_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"title" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_contract_attachment" ADD CONSTRAINT "crm_contract_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract_attachment" ADD CONSTRAINT "crm_contract_attachment_contract_id_crm_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."crm_contract"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_contract_attachment" ADD CONSTRAINT "crm_contract_attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "crm_contract_attachment_contractId_idx" ON "crm_contract_attachment" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "crm_contract_attachment_workspaceId_idx" ON "crm_contract_attachment" USING btree ("workspace_id");