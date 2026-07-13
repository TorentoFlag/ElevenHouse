CREATE TABLE "product_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"locale" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"sort_order" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_templates_code_locale_unique" UNIQUE("code","locale"),
	CONSTRAINT "product_templates_status_check" CHECK ("product_templates"."status" in ('active', 'archived')),
	CONSTRAINT "product_templates_locale_check" CHECK ("product_templates"."locale" in ('ru', 'en')),
	CONSTRAINT "product_templates_type_check" CHECK ("product_templates"."type" in ('single', 'pack', 'async', 'sub', 'mini', 'course', 'custom')),
	CONSTRAINT "product_templates_sort_order_check" CHECK ("product_templates"."sort_order" >= 0),
	CONSTRAINT "product_templates_code_length_check" CHECK (length(trim("product_templates"."code")) between 3 and 80),
	CONSTRAINT "product_templates_title_length_check" CHECK (length(trim("product_templates"."title")) between 1 and 200)
);
--> statement-breakpoint
CREATE INDEX "product_templates_active_locale_order_idx" ON "product_templates" USING btree ("locale","sort_order","code") WHERE "product_templates"."status" = 'active';