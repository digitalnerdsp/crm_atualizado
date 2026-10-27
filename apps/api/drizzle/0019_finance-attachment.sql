CREATE TABLE "finance_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"settlement_id" text,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_attachment" ADD CONSTRAINT "finance_attachment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_attachment" ADD CONSTRAINT "finance_attachment_entry_id_finance_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."finance_entry"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_attachment" ADD CONSTRAINT "finance_attachment_settlement_id_finance_settlement_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."finance_settlement"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "finance_attachment" ADD CONSTRAINT "finance_attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "finance_attachment_entry_idx" ON "finance_attachment" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "finance_attachment_workspace_idx" ON "finance_attachment" USING btree ("workspace_id");