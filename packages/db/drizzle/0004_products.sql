CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"cover_media_id" uuid,
	"intro_video_url" text,
	"execution_mode" text NOT NULL,
	"payment_model" text NOT NULL,
	"duration_minutes" integer,
	"duration_label" text,
	"sla_label" text,
	"package_session_count" integer,
	"package_discount_percent" integer,
	"subscription_period" text,
	"trial_days" integer,
	"participant_mode" text NOT NULL,
	"group_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "products_status_check" CHECK ("products"."status" in ('draft', 'active', 'archived')),
	CONSTRAINT "products_type_check" CHECK ("products"."type" in ('single', 'pack', 'async', 'sub', 'mini', 'course', 'custom')),
	CONSTRAINT "products_currency_check" CHECK ("products"."currency" in ('RUB')),
	CONSTRAINT "products_execution_mode_check" CHECK ("products"."execution_mode" in ('live', 'async', 'instant')),
	CONSTRAINT "products_payment_model_check" CHECK ("products"."payment_model" in ('once', 'pack', 'sub', 'free')),
	CONSTRAINT "products_participant_mode_check" CHECK ("products"."participant_mode" in ('solo', 'group', 'gift')),
	CONSTRAINT "products_price_minor_check" CHECK ("products"."price_minor" >= 0),
	CONSTRAINT "products_duration_minutes_check" CHECK ("products"."duration_minutes" is null or "products"."duration_minutes" > 0),
	CONSTRAINT "products_package_session_count_check" CHECK ("products"."package_session_count" is null or "products"."package_session_count" > 0),
	CONSTRAINT "products_package_discount_percent_check" CHECK ("products"."package_discount_percent" is null or ("products"."package_discount_percent" >= 0 and "products"."package_discount_percent" <= 100)),
	CONSTRAINT "products_subscription_period_check" CHECK ("products"."subscription_period" is null or "products"."subscription_period" in ('week', 'month', 'year')),
	CONSTRAINT "products_trial_days_check" CHECK ("products"."trial_days" is null or "products"."trial_days" >= 0),
	CONSTRAINT "products_group_size_check" CHECK ("products"."group_size" is null or "products"."group_size" > 0),
	CONSTRAINT "products_free_price_check" CHECK ("products"."payment_model" <> 'free' or "products"."price_minor" = 0),
	CONSTRAINT "products_package_settings_check" CHECK ("products"."payment_model" <> 'pack' or "products"."package_session_count" is not null),
	CONSTRAINT "products_subscription_settings_check" CHECK ("products"."payment_model" <> 'sub' or "products"."subscription_period" is not null),
	CONSTRAINT "products_group_settings_check" CHECK ("products"."participant_mode" <> 'group' or "products"."group_size" is not null)
);
--> statement-breakpoint
CREATE TABLE "product_delivery_formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"value" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "product_delivery_formats_value_check" CHECK ("product_delivery_formats"."value" in ('video', 'audio', 'chat', 'text', 'file', 'channel'))
);
--> statement-breakpoint
CREATE TABLE "product_required_client_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"value" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "product_required_client_data_value_check" CHECK ("product_required_client_data"."value" in ('chart1', 'cities', 'chart2', 'question', 'event'))
);
--> statement-breakpoint
CREATE TABLE "product_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"value" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "product_methods_value_check" CHECK ("product_methods"."value" in ('natal', 'forecast', 'synastry', 'child', 'numerology', 'matrix', 'humandesign'))
);
--> statement-breakpoint
CREATE TABLE "product_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"value" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "product_access_grants_value_check" CHECK ("product_access_grants"."value" in ('content', 'channel', 'records', 'course', 'community', 'journal'))
);
--> statement-breakpoint
CREATE TABLE "product_included_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"text" text NOT NULL,
	"icon" text NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"label" text NOT NULL,
	"price_minor" integer NOT NULL,
	"kind" text NOT NULL,
	"is_enabled" boolean NOT NULL,
	"creates_artifact" boolean NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "product_modifiers_kind_check" CHECK ("product_modifiers"."kind" in ('fixed', 'percent', 'free')),
	CONSTRAINT "product_modifiers_price_minor_check" CHECK ("product_modifiers"."price_minor" >= 0),
	CONSTRAINT "product_modifiers_free_price_check" CHECK ("product_modifiers"."kind" <> 'free' or "product_modifiers"."price_minor" = 0)
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX "product_delivery_formats_product_value_unique" ON "product_delivery_formats" USING btree ("product_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "product_required_client_data_product_value_unique" ON "product_required_client_data" USING btree ("product_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "product_methods_product_value_unique" ON "product_methods" USING btree ("product_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "product_access_grants_product_value_unique" ON "product_access_grants" USING btree ("product_id","value");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_delivery_formats" ADD CONSTRAINT "product_delivery_formats_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_required_client_data" ADD CONSTRAINT "product_required_client_data_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_methods" ADD CONSTRAINT "product_methods_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_access_grants" ADD CONSTRAINT "product_access_grants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_included_items" ADD CONSTRAINT "product_included_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifiers" ADD CONSTRAINT "product_modifiers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_owner_created_id_idx" ON "products" USING btree ("owner_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "products_owner_status_created_id_idx" ON "products" USING btree ("owner_user_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "product_delivery_formats_product_id_idx" ON "product_delivery_formats" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_required_client_data_product_id_idx" ON "product_required_client_data" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_methods_product_id_idx" ON "product_methods" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_access_grants_product_id_idx" ON "product_access_grants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_included_items_product_id_idx" ON "product_included_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_modifiers_product_id_idx" ON "product_modifiers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_templates_active_locale_order_idx" ON "product_templates" USING btree ("locale","sort_order","code") WHERE "product_templates"."status" = 'active';