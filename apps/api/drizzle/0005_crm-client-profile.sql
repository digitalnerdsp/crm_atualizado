CREATE TABLE "crm_segment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_segment_workspace_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "crm_source" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"channel" text DEFAULT 'other' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_source_workspace_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "person_type" text DEFAULT 'pj' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "state_registration" text;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "municipal_registration" text;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "segment_id" text;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "company_size" text;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "status" text DEFAULT 'prospect' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "client_since" timestamp;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "churned_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "churn_reason" text;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "billing_day" integer;--> statement-breakpoint
ALTER TABLE "crm_company" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "crm_segment" ADD CONSTRAINT "crm_segment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_source" ADD CONSTRAINT "crm_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "crm_segment_workspaceId_idx" ON "crm_segment" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_source_workspaceId_idx" ON "crm_source" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "crm_company" ADD CONSTRAINT "crm_company_segment_id_crm_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."crm_segment"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_company" ADD CONSTRAINT "crm_company_source_id_crm_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."crm_source"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crm_deal" ADD CONSTRAINT "crm_deal_source_id_crm_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."crm_source"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "crm_company_segmentId_idx" ON "crm_company" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "crm_company_sourceId_idx" ON "crm_company" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "crm_company_workspaceId_status_idx" ON "crm_company" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "crm_deal_sourceId_idx" ON "crm_deal" USING btree ("source_id");--> statement-breakpoint
/* ------------------------------------------------------------------
 * Migração de dados: o texto livre que já existe vira linha de lista.
 * Nenhum valor é descartado — cada `industry` e cada `source` distinto
 * ganha uma entrada com o mesmo nome. As colunas antigas só caem na
 * migration seguinte, depois que estes passos rodaram.
 * ------------------------------------------------------------------ */

/* 1. Segmentos a partir de crm_company.industry.
 *    O agrupamento ignora caixa e espaço: "Marketing", "marketing" e
 *    " Marketing " são o mesmo setor digitado por três pessoas, e mantê-los
 *    separados recriaria no cadastro novo o problema que ele existe para
 *    resolver. A grafia que fica é a primeira em ordem alfabética. */
INSERT INTO "crm_segment" ("id", "workspace_id", "name", "position")
SELECT
	'c' || substr(md5(random()::text || clock_timestamp()::text || distinct_industry."workspace_id" || distinct_industry."name"), 1, 23),
	distinct_industry."workspace_id",
	distinct_industry."name",
	distinct_industry."rn" - 1
FROM (
	SELECT
		"workspace_id",
		min(btrim("industry")) AS "name",
		row_number() OVER (PARTITION BY "workspace_id" ORDER BY min(btrim("industry"))) AS "rn"
	FROM "crm_company"
	WHERE "industry" IS NOT NULL AND btrim("industry") <> ''
	GROUP BY "workspace_id", lower(btrim("industry"))
) AS distinct_industry
ON CONFLICT ("workspace_id", "name") DO NOTHING;--> statement-breakpoint

UPDATE "crm_company" AS c
SET "segment_id" = s."id"
FROM "crm_segment" AS s
WHERE s."workspace_id" = c."workspace_id"
	AND lower(s."name") = lower(btrim(c."industry"))
	AND c."industry" IS NOT NULL
	AND btrim(c."industry") <> '';--> statement-breakpoint

/* 2. Origens: as sete padrão em todo workspace, mais o que já foi digitado
 *    em crm_deal.source. As digitadas entram como 'other' porque ninguém
 *    pode adivinhar o canal delas — a equipe reclassifica na tela. */
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
ON CONFLICT ("workspace_id", "name") DO NOTHING;--> statement-breakpoint

/* O que já foi digitado só vira origem nova se não for uma das padrão escrita
 * de outro jeito: "meta ads" é a "Meta Ads" semeada acima, e criar as duas
 * partiria o relatório de aquisição em duas linhas para o mesmo canal. */
INSERT INTO "crm_source" ("id", "workspace_id", "name", "channel", "position")
SELECT
	'c' || substr(md5(random()::text || clock_timestamp()::text || distinct_source."workspace_id" || distinct_source."name"), 1, 23),
	distinct_source."workspace_id",
	distinct_source."name",
	'other',
	100 + distinct_source."rn"
FROM (
	SELECT
		"workspace_id",
		min(btrim("source")) AS "name",
		row_number() OVER (PARTITION BY "workspace_id" ORDER BY min(btrim("source"))) AS "rn"
	FROM "crm_deal"
	WHERE "source" IS NOT NULL AND btrim("source") <> ''
	GROUP BY "workspace_id", lower(btrim("source"))
) AS distinct_source
WHERE NOT EXISTS (
	SELECT 1 FROM "crm_source" AS existing
	WHERE existing."workspace_id" = distinct_source."workspace_id"
		AND lower(existing."name") = lower(distinct_source."name")
)
ON CONFLICT ("workspace_id", "name") DO NOTHING;--> statement-breakpoint

UPDATE "crm_deal" AS d
SET "source_id" = s."id"
FROM "crm_source" AS s
WHERE s."workspace_id" = d."workspace_id"
	AND lower(s."name") = lower(btrim(d."source"))
	AND d."source" IS NOT NULL
	AND btrim(d."source") <> '';--> statement-breakpoint

/* A origem do cliente é a do negócio mais antigo dele: é a informação que a
 * equipe teria de redigitar cliente a cliente, e ela já está na base. */
UPDATE "crm_company" AS c
SET "source_id" = first_deal."source_id"
FROM (
	SELECT DISTINCT ON ("company_id") "company_id", "source_id"
	FROM "crm_deal"
	WHERE "company_id" IS NOT NULL AND "source_id" IS NOT NULL
	ORDER BY "company_id", "created_at" ASC
) AS first_deal
WHERE first_deal."company_id" = c."id" AND c."source_id" IS NULL;--> statement-breakpoint

/* 3. Estado do cliente: quem já teve negócio ganho é cliente ativo desde o
 *    primeiro ganho; o resto continua prospect, que é o default da coluna. */
UPDATE "crm_company" AS c
SET "status" = 'active',
	"client_since" = first_win."won_at"
FROM (
	SELECT "company_id", min(coalesce("won_at", "updated_at")) AS "won_at"
	FROM "crm_deal"
	WHERE "status" = 'won' AND "company_id" IS NOT NULL
	GROUP BY "company_id"
) AS first_win
WHERE first_win."company_id" = c."id";--> statement-breakpoint

/* CPF tem 11 dígitos, CNPJ tem 14: o tipo de pessoa já está no documento. */
UPDATE "crm_company"
SET "person_type" = 'pf'
WHERE "tax_id" IS NOT NULL
	AND length(regexp_replace("tax_id", '\D', '', 'g')) = 11;
