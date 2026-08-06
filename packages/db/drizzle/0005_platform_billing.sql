CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_invoice_id" text NOT NULL,
	"status" text NOT NULL,
	"plan_id" text NOT NULL,
	"billing_cycle" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"receipt_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_provider_check" CHECK ("billing_invoices"."provider" in ('arc_pay')),
	CONSTRAINT "billing_invoices_status_check" CHECK ("billing_invoices"."status" in ('paid', 'open', 'void', 'uncollectible')),
	CONSTRAINT "billing_invoices_billing_cycle_check" CHECK ("billing_invoices"."billing_cycle" in ('month', 'year')),
	CONSTRAINT "billing_invoices_amount_minor_check" CHECK ("billing_invoices"."amount_minor" >= 0),
	CONSTRAINT "billing_invoices_currency_check" CHECK ("billing_invoices"."currency" in ('RUB'))
);
--> statement-breakpoint
CREATE TABLE "billing_payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_method_id" text NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	"expires_at" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payment_methods_provider_check" CHECK ("billing_payment_methods"."provider" in ('arc_pay')),
	CONSTRAINT "billing_payment_methods_brand_length_check" CHECK (length(trim("billing_payment_methods"."brand")) between 1 and 40),
	CONSTRAINT "billing_payment_methods_last4_check" CHECK ("billing_payment_methods"."last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "billing_payment_methods_expires_at_check" CHECK ("billing_payment_methods"."expires_at" ~ '^[0-9]{2}/[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "platform_plan_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"value" text NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "platform_plan_features_value_check" CHECK ("platform_plan_features"."value" in ('engine', 'pdf', 'natal', 'synastry', 'forecast', 'solar', 'matrix', 'numerology', 'hd', 'horar', 'vedic', 'astrocal', 'child', 'page', 'products', 'calendar', 'crm', 'funnels', 'group', 'ai', 'aicontent', 'triggers', 'content', 'autopost', 'journal', 'video', 'recordings', 'inbox', 'analytics', 'refs', 'team', 'whitelabel', 'api', 'priority')),
	CONSTRAINT "platform_plan_features_order_check" CHECK ("platform_plan_features"."order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text NOT NULL,
	"monthly_price_minor" integer NOT NULL,
	"yearly_price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"platform_fee_bps" integer NOT NULL,
	"seats_limit" integer,
	"bookings_limit" integer,
	"ai_requests_limit" integer,
	"automation_limit" integer,
	"is_popular" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_plans_code_unique" UNIQUE("code"),
	CONSTRAINT "platform_plans_code_length_check" CHECK (length(trim("platform_plans"."code")) between 1 and 80),
	CONSTRAINT "platform_plans_name_length_check" CHECK (length(trim("platform_plans"."name")) between 1 and 120),
	CONSTRAINT "platform_plans_tagline_length_check" CHECK (length(trim("platform_plans"."tagline")) between 1 and 240),
	CONSTRAINT "platform_plans_monthly_price_minor_check" CHECK ("platform_plans"."monthly_price_minor" >= 0),
	CONSTRAINT "platform_plans_yearly_price_minor_check" CHECK ("platform_plans"."yearly_price_minor" >= 0),
	CONSTRAINT "platform_plans_currency_check" CHECK ("platform_plans"."currency" in ('RUB')),
	CONSTRAINT "platform_plans_platform_fee_bps_check" CHECK ("platform_plans"."platform_fee_bps" >= 0 and "platform_plans"."platform_fee_bps" <= 10000),
	CONSTRAINT "platform_plans_seats_limit_check" CHECK ("platform_plans"."seats_limit" is null or "platform_plans"."seats_limit" > 0),
	CONSTRAINT "platform_plans_bookings_limit_check" CHECK ("platform_plans"."bookings_limit" is null or "platform_plans"."bookings_limit" > 0),
	CONSTRAINT "platform_plans_ai_requests_limit_check" CHECK ("platform_plans"."ai_requests_limit" is null or "platform_plans"."ai_requests_limit" > 0),
	CONSTRAINT "platform_plans_automation_limit_check" CHECK ("platform_plans"."automation_limit" is null or "platform_plans"."automation_limit" > 0),
	CONSTRAINT "platform_plans_display_order_check" CHECK ("platform_plans"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"provider" text DEFAULT 'arc_pay' NOT NULL,
	"provider_subscription_id" text,
	"status" text NOT NULL,
	"billing_cycle" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"current_period_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_subscriptions_provider_check" CHECK ("platform_subscriptions"."provider" in ('arc_pay')),
	CONSTRAINT "platform_subscriptions_status_check" CHECK ("platform_subscriptions"."status" in ('active', 'past_due', 'canceled', 'incomplete')),
	CONSTRAINT "platform_subscriptions_billing_cycle_check" CHECK ("platform_subscriptions"."billing_cycle" in ('month', 'year'))
);
--> statement-breakpoint
CREATE TABLE "platform_tariff_invoices" (
	"id" varchar(160) PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"tariff_series_id" varchar(160) NOT NULL,
	"tariff_version" integer NOT NULL,
	"tariff_version_digest" varchar(71) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"state" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"billing_period_start_at" timestamp with time zone NOT NULL,
	"billing_period_end_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"captured_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	CONSTRAINT "platform_tariff_invoices_subscription_period_unique" UNIQUE("subscription_id","billing_period_start_at"),
	CONSTRAINT "platform_tariff_invoices_shape_check" CHECK ("platform_tariff_invoices"."state" in ('open', 'payment_pending', 'requires_customer_action', 'captured', 'declined', 'failed', 'provider_unknown', 'void', 'uncollectible')
        and "platform_tariff_invoices"."amount_minor" >= 0 and "platform_tariff_invoices"."currency" = 'RUB' and "platform_tariff_invoices"."version" >= 1
        and "platform_tariff_invoices"."tariff_version_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "platform_tariff_invoices"."billing_period_end_at" > "platform_tariff_invoices"."billing_period_start_at"
        and (("platform_tariff_invoices"."state" in ('open', 'payment_pending', 'requires_customer_action', 'declined', 'failed', 'provider_unknown', 'uncollectible') and "platform_tariff_invoices"."captured_at" is null and "platform_tariff_invoices"."voided_at" is null)
          or ("platform_tariff_invoices"."state" = 'captured' and "platform_tariff_invoices"."captured_at" is not null and "platform_tariff_invoices"."voided_at" is null)
          or ("platform_tariff_invoices"."state" = 'void' and "platform_tariff_invoices"."voided_at" is not null)))
);
--> statement-breakpoint
CREATE TABLE "platform_tariff_series" (
	"id" varchar(160) PRIMARY KEY NOT NULL,
	"code" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "platform_tariff_series_identifier_check" CHECK (length(trim("platform_tariff_series"."id")) between 1 and 160 and "platform_tariff_series"."id" = trim("platform_tariff_series"."id")
        and "platform_tariff_series"."id" !~ '[[:cntrl:]]' and length(trim("platform_tariff_series"."code")) between 1 and 80
        and "platform_tariff_series"."code" = trim("platform_tariff_series"."code") and "platform_tariff_series"."code" !~ '[[:cntrl:]]')
);
--> statement-breakpoint
CREATE TABLE "platform_tariff_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"tariff_series_id" varchar(160) NOT NULL,
	"tariff_version" integer NOT NULL,
	"tariff_version_digest" varchar(71) NOT NULL,
	"commission_bps_snapshot" integer NOT NULL,
	"billing_cycle" text NOT NULL,
	"state" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_tariff_subscriptions_exact_tariff_snapshot_unique" UNIQUE("id","owner_user_id","tariff_series_id","tariff_version","tariff_version_digest"),
	CONSTRAINT "platform_tariff_subscriptions_shape_check" CHECK ("platform_tariff_subscriptions"."state" in ('incomplete_setup', 'awaiting_initial_payment', 'active', 'past_due', 'cancelled', 'expired')
        and "platform_tariff_subscriptions"."billing_cycle" in ('month', 'year')
        and "platform_tariff_subscriptions"."commission_bps_snapshot" between 0 and 10000 and "platform_tariff_subscriptions"."version" >= 1
        and "platform_tariff_subscriptions"."tariff_version_digest" ~ '^sha256:[a-f0-9]{64}$'
        and (("platform_tariff_subscriptions"."state" in ('incomplete_setup', 'awaiting_initial_payment') and "platform_tariff_subscriptions"."starts_at" is null and "platform_tariff_subscriptions"."ends_at" is null and "platform_tariff_subscriptions"."cancelled_at" is null)
          or ("platform_tariff_subscriptions"."state" in ('active', 'past_due', 'expired') and "platform_tariff_subscriptions"."starts_at" is not null and "platform_tariff_subscriptions"."ends_at" is not null and "platform_tariff_subscriptions"."ends_at" > "platform_tariff_subscriptions"."starts_at")
          or ("platform_tariff_subscriptions"."state" = 'cancelled' and "platform_tariff_subscriptions"."cancelled_at" is not null
            and (("platform_tariff_subscriptions"."starts_at" is null and "platform_tariff_subscriptions"."ends_at" is null) or ("platform_tariff_subscriptions"."starts_at" is not null and "platform_tariff_subscriptions"."ends_at" is not null and "platform_tariff_subscriptions"."ends_at" > "platform_tariff_subscriptions"."starts_at")))))
);
--> statement-breakpoint
CREATE TABLE "platform_tariff_version_capabilities" (
	"tariff_series_id" varchar(160) NOT NULL,
	"tariff_version" integer NOT NULL,
	"capability" text NOT NULL,
	CONSTRAINT "platform_tariff_version_capabilities_pk" PRIMARY KEY("tariff_series_id","tariff_version","capability"),
	CONSTRAINT "platform_tariff_version_capabilities_value_check" CHECK ("platform_tariff_version_capabilities"."capability" in ('engine', 'pdf', 'natal', 'synastry', 'forecast', 'solar', 'matrix', 'numerology', 'hd', 'horar', 'vedic', 'astrocal', 'child', 'page', 'products', 'calendar', 'crm', 'funnels', 'group', 'ai', 'aicontent', 'triggers', 'content', 'autopost', 'journal', 'video', 'recordings', 'inbox', 'analytics', 'refs', 'team', 'whitelabel', 'api', 'priority'))
);
--> statement-breakpoint
CREATE TABLE "platform_tariff_versions" (
	"tariff_series_id" varchar(160) NOT NULL,
	"version" integer NOT NULL,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"lifecycle" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"tagline" varchar(240) NOT NULL,
	"monthly_price_minor" integer NOT NULL,
	"yearly_price_minor" integer NOT NULL,
	"monthly_recurring_frequency_days" integer,
	"yearly_recurring_frequency_days" integer,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"client_sale_commission_bps" integer NOT NULL,
	"seats_limit" integer,
	"bookings_limit" integer,
	"ai_requests_limit" integer,
	"automation_limit" integer,
	"is_popular" boolean DEFAULT false NOT NULL,
	"display_order" integer NOT NULL,
	"canonical_preimage" text DEFAULT '' NOT NULL,
	"canonical_digest" varchar(71) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	CONSTRAINT "platform_tariff_versions_pk" PRIMARY KEY("tariff_series_id","version"),
	CONSTRAINT "platform_tariff_versions_exact_digest_unique" UNIQUE("tariff_series_id","version","canonical_digest"),
	CONSTRAINT "platform_tariff_versions_lifecycle_check" CHECK ("platform_tariff_versions"."lifecycle" in ('draft', 'published', 'retired')
        and "platform_tariff_versions"."currency" = 'RUB'
        and "platform_tariff_versions"."version" >= 1 and "platform_tariff_versions"."draft_revision" >= 1
        and "platform_tariff_versions"."monthly_price_minor" >= 0 and "platform_tariff_versions"."yearly_price_minor" >= 0
        and (("platform_tariff_versions"."monthly_price_minor" = 0 and "platform_tariff_versions"."monthly_recurring_frequency_days" is null)
          or ("platform_tariff_versions"."monthly_price_minor" > 0 and "platform_tariff_versions"."monthly_recurring_frequency_days" between 1 and 366))
        and (("platform_tariff_versions"."yearly_price_minor" = 0 and "platform_tariff_versions"."yearly_recurring_frequency_days" is null)
          or ("platform_tariff_versions"."yearly_price_minor" > 0 and "platform_tariff_versions"."yearly_recurring_frequency_days" between 1 and 366))
        and "platform_tariff_versions"."client_sale_commission_bps" between 0 and 10000
        and "platform_tariff_versions"."display_order" >= 0
        and ("platform_tariff_versions"."seats_limit" is null or "platform_tariff_versions"."seats_limit" > 0)
        and ("platform_tariff_versions"."bookings_limit" is null or "platform_tariff_versions"."bookings_limit" > 0)
        and ("platform_tariff_versions"."ai_requests_limit" is null or "platform_tariff_versions"."ai_requests_limit" > 0)
        and ("platform_tariff_versions"."automation_limit" is null or "platform_tariff_versions"."automation_limit" > 0)
        and "platform_tariff_versions"."canonical_digest" ~ '^sha256:[a-f0-9]{64}$'
        and length("platform_tariff_versions"."canonical_preimage") between 1 and 32000
        and (("platform_tariff_versions"."lifecycle" = 'draft' and "platform_tariff_versions"."published_at" is null and "platform_tariff_versions"."retired_at" is null)
          or ("platform_tariff_versions"."lifecycle" = 'published' and "platform_tariff_versions"."published_at" is not null and "platform_tariff_versions"."retired_at" is null)
          or ("platform_tariff_versions"."lifecycle" = 'retired' and "platform_tariff_versions"."published_at" is not null and "platform_tariff_versions"."retired_at" is not null)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_provider_invoice_unique" ON "billing_invoices" USING btree ("provider","provider_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payment_methods_provider_method_unique" ON "billing_payment_methods" USING btree ("provider","provider_payment_method_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payment_methods_default_owner_unique" ON "billing_payment_methods" USING btree ("owner_user_id") WHERE "billing_payment_methods"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_plan_features_plan_value_unique" ON "platform_plan_features" USING btree ("plan_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_current_owner_unique" ON "platform_subscriptions" USING btree ("owner_user_id") WHERE "platform_subscriptions"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_tariff_invoices_subscription_open_unique" ON "platform_tariff_invoices" USING btree ("subscription_id") WHERE "platform_tariff_invoices"."state" in ('open', 'payment_pending', 'requires_customer_action', 'provider_unknown');--> statement-breakpoint
CREATE UNIQUE INDEX "platform_tariff_series_code_unique" ON "platform_tariff_series" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_tariff_subscriptions_one_current_owner_unique" ON "platform_tariff_subscriptions" USING btree ("owner_user_id") WHERE "platform_tariff_subscriptions"."state" in ('incomplete_setup', 'awaiting_initial_payment', 'active', 'past_due');--> statement-breakpoint
CREATE UNIQUE INDEX "platform_tariff_versions_digest_unique" ON "platform_tariff_versions" USING btree ("canonical_digest");--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_plan_id_platform_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_methods" ADD CONSTRAINT "billing_payment_methods_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_plan_features" ADD CONSTRAINT "platform_plan_features_plan_id_platform_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_plan_id_platform_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tariff_invoices" ADD CONSTRAINT "platform_tariff_invoices_subscription_snapshot_fk" FOREIGN KEY ("subscription_id","owner_user_id","tariff_series_id","tariff_version","tariff_version_digest") REFERENCES "public"."platform_tariff_subscriptions"("id","owner_user_id","tariff_series_id","tariff_version","tariff_version_digest") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tariff_invoices" ADD CONSTRAINT "platform_tariff_invoices_owner_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tariff_invoices" ADD CONSTRAINT "platform_tariff_invoices_version_fk" FOREIGN KEY ("tariff_series_id","tariff_version","tariff_version_digest") REFERENCES "public"."platform_tariff_versions"("tariff_series_id","version","canonical_digest") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tariff_subscriptions" ADD CONSTRAINT "platform_tariff_subscriptions_owner_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tariff_subscriptions" ADD CONSTRAINT "platform_tariff_subscriptions_version_fk" FOREIGN KEY ("tariff_series_id","tariff_version","tariff_version_digest") REFERENCES "public"."platform_tariff_versions"("tariff_series_id","version","canonical_digest") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tariff_version_capabilities" ADD CONSTRAINT "platform_tariff_version_capabilities_version_fk" FOREIGN KEY ("tariff_series_id","tariff_version") REFERENCES "public"."platform_tariff_versions"("tariff_series_id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tariff_versions" ADD CONSTRAINT "platform_tariff_versions_series_fk" FOREIGN KEY ("tariff_series_id") REFERENCES "public"."platform_tariff_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_invoices_owner_issued_idx" ON "billing_invoices" USING btree ("owner_user_id","issued_at");--> statement-breakpoint
CREATE INDEX "billing_payment_methods_owner_created_idx" ON "billing_payment_methods" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_plan_features_plan_id_idx" ON "platform_plan_features" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "platform_subscriptions_owner_created_idx" ON "platform_subscriptions" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_tariff_invoices_owner_created_idx" ON "platform_tariff_invoices" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_tariff_subscriptions_owner_state_idx" ON "platform_tariff_subscriptions" USING btree ("owner_user_id","state","ends_at");--> statement-breakpoint
CREATE INDEX "platform_tariff_versions_public_lookup_idx" ON "platform_tariff_versions" USING btree ("lifecycle","display_order","tariff_series_id","version");