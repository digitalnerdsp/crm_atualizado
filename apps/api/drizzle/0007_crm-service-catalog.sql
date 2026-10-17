CREATE TABLE "crm_deal_service" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
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
CREATE TABLE "crm_service_category" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_service_category_workspace_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "crm_service" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"category_id" text,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"default_price_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"billing_type" text DEFAULT 'one_time' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_deal" ADD COLUMN "value_is_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_deal_service" ADD CONSTRAINT "crm_deal_service_deal_id_crm_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deal"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal_service" ADD CONSTRAINT "crm_deal_service_service_id_crm_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."crm_service"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_service_category" ADD CONSTRAINT "crm_service_category_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_service" ADD CONSTRAINT "crm_service_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_service" ADD CONSTRAINT "crm_service_category_id_crm_service_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."crm_service_category"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "crm_deal_service_dealId_idx" ON "crm_deal_service" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_deal_service_serviceId_idx" ON "crm_deal_service" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "crm_service_category_workspaceId_idx" ON "crm_service_category" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_service_workspaceId_idx" ON "crm_service" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_service_categoryId_idx" ON "crm_service" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_service_workspace_code_unique" ON "crm_service" USING btree ("workspace_id","code") WHERE "crm_service"."code" is not null;
--> statement-breakpoint
/* Até esta versão, só o cadastro normal semeava as origens padrão; a
 * configuração inicial e o painel de admin criavam workspace sem nenhuma.
 * Quem ficou com zero origens recebe as sete agora. Workspace que já tem
 * qualquer origem — mesmo desativada — é deixado como está. */
INSERT INTO "crm_source" ("id", "workspace_id", "name", "channel", "position")
SELECT
	'c' || substr(md5(random()::text || clock_timestamp()::text || w."id" || seed."name"), 1, 23),
	w."id",
	seed."name",
	seed."channel",
	seed."position"
FROM "workspace" AS w
CROSS JOIN (VALUES
	('Indicação', 'referral', 0),
	('Cliente atual', 'referral', 1),
	('Meta Ads', 'paid', 2),
	('Google Ads', 'paid', 3),
	('Busca orgânica', 'organic', 4),
	('Prospecção ativa', 'outbound', 5),
	('Evento', 'event', 6)
) AS seed("name", "channel", "position")
WHERE NOT EXISTS (
	SELECT 1 FROM "crm_source" AS existing WHERE existing."workspace_id" = w."id"
)
ON CONFLICT ("workspace_id", "name") DO NOTHING;
--> statement-breakpoint
/* Nenhum caminho semeava funil: todo workspace novo abria o board em "Nenhum
 * funil configurado", sem tela para criar um. Quem não tem funil nenhum —
 * nem arquivado — recebe o padrão, com as mesmas etapas de
 * DEFAULT_PIPELINE_STAGES. */
WITH new_pipeline AS (
	INSERT INTO "crm_pipeline" ("id", "workspace_id", "name", "slug", "is_default", "position")
	SELECT
		'c' || substr(md5(random()::text || clock_timestamp()::text || w."id"), 1, 23),
		w."id",
		'Funil de vendas',
		'funil-de-vendas',
		true,
		0
	FROM "workspace" AS w
	WHERE NOT EXISTS (
		SELECT 1 FROM "crm_pipeline" AS existing WHERE existing."workspace_id" = w."id"
	)
	RETURNING "id"
)
INSERT INTO "crm_stage" ("id", "pipeline_id", "name", "slug", "position", "probability", "outcome", "color", "rotting_days")
SELECT
	'c' || substr(md5(random()::text || clock_timestamp()::text || p."id" || stage."slug"), 1, 23),
	p."id",
	stage."name",
	stage."slug",
	stage."position",
	stage."probability",
	stage."outcome",
	stage."color",
	stage."rotting_days"
FROM new_pipeline AS p
CROSS JOIN (VALUES
	('Qualificação', 'qualification', 0, 10, 'open', '#64748B', 14),
	('Descoberta', 'discovery', 1, 25, 'open', '#3B82F6', 14),
	('Proposta', 'proposal', 2, 50, 'open', '#8B5CF6', 10),
	('Negociação', 'negotiation', 3, 75, 'open', '#EAB308', 7),
	('Ganho', 'won', 4, 100, 'won', '#22C55E', NULL),
	('Perdido', 'lost', 5, 0, 'lost', '#EF4444', NULL)
) AS stage("name", "slug", "position", "probability", "outcome", "color", "rotting_days");--> statement-breakpoint

/* Perder um negócio exige uma razão, e nenhuma era semeada: sem elas, nenhum
 * negócio podia ser marcado como perdido. */
INSERT INTO "crm_lost_reason" ("id", "workspace_id", "name", "position")
SELECT
	'c' || substr(md5(random()::text || clock_timestamp()::text || w."id" || reason."name"), 1, 23),
	w."id",
	reason."name",
	reason."position"
FROM "workspace" AS w
CROSS JOIN (VALUES
	('Preço', 0),
	('Escolheu um concorrente', 1),
	('Sem orçamento', 2),
	('Adiou a decisão', 3),
	('Parou de responder', 4),
	('Fora do perfil', 5),
	('Outro', 6)
) AS reason("name", "position")
WHERE NOT EXISTS (
	SELECT 1 FROM "crm_lost_reason" AS existing WHERE existing."workspace_id" = w."id"
)
ON CONFLICT ("workspace_id", "name") DO NOTHING;
