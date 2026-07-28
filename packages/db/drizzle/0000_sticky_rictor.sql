CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"deletion_scheduled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'suspended', 'deleted')),
	CONSTRAINT "users_deletion_schedule_check" CHECK ("users"."deletion_scheduled_at" is null or "users"."deletion_requested_at" is not null),
	CONSTRAINT "users_deleted_at_check" CHECK ("users"."deleted_at" is null or "users"."deletion_requested_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_display_name_length_check" CHECK (length(trim("user_profiles"."display_name")) between 2 and 200)
);
--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"email" text,
	"phone_number" text,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_provider_check" CHECK ("auth_identities"."provider" in ('email', 'phone', 'telegram', 'google', 'apple')),
	CONSTRAINT "auth_identities_email_provider_email_check" CHECK ("auth_identities"."provider" <> 'email' or "auth_identities"."email" is not null),
	CONSTRAINT "auth_identities_phone_provider_phone_check" CHECK ("auth_identities"."provider" <> 'phone' or "auth_identities"."phone_number" is not null)
);
--> statement-breakpoint
CREATE TABLE "user_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"assigned_by_user_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_assignments_role_check" CHECK ("user_role_assignments"."role" in ('client', 'astrologer', 'moderator', 'admin', 'super_admin'))
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_sessions_status_check" CHECK ("user_sessions"."status" in ('active', 'revoked')),
	CONSTRAINT "user_sessions_expiry_check" CHECK ("user_sessions"."expires_at" > "user_sessions"."created_at"),
	CONSTRAINT "user_sessions_revoked_at_check" CHECK ("user_sessions"."status" <> 'revoked' or "user_sessions"."revoked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"identifier" text NOT NULL,
	"identifier_normalized" text NOT NULL,
	"code_hash" text NOT NULL,
	"requested_roles" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_available_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_challenges_channel_check" CHECK ("auth_challenges"."channel" in ('email', 'phone')),
	CONSTRAINT "auth_challenges_status_check" CHECK ("auth_challenges"."status" in ('pending', 'consumed', 'cancelled')),
	CONSTRAINT "auth_challenges_expiry_check" CHECK ("auth_challenges"."expires_at" > "auth_challenges"."created_at"),
	CONSTRAINT "auth_challenges_max_attempts_check" CHECK ("auth_challenges"."max_attempts" > 0),
	CONSTRAINT "auth_challenges_attempts_check" CHECK ("auth_challenges"."attempts" >= 0),
	CONSTRAINT "auth_challenges_consumed_at_check" CHECK ("auth_challenges"."status" <> 'consumed' or "auth_challenges"."consumed_at" is not null),
	CONSTRAINT "auth_challenges_cancelled_at_check" CHECK ("auth_challenges"."status" <> 'cancelled' or "auth_challenges"."cancelled_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "auth_challenge_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"provider" text,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "auth_challenge_deliveries_status_check" CHECK ("auth_challenge_deliveries"."status" in ('queued', 'sent', 'failed')),
	CONSTRAINT "auth_challenge_deliveries_sent_at_check" CHECK ("auth_challenge_deliveries"."status" <> 'sent' or "auth_challenge_deliveries"."sent_at" is not null),
	CONSTRAINT "auth_challenge_deliveries_queued_fields_check" CHECK ("auth_challenge_deliveries"."status" <> 'queued' or ("auth_challenge_deliveries"."provider" is null and "auth_challenge_deliveries"."provider_message_id" is null and "auth_challenge_deliveries"."error_code" is null and "auth_challenge_deliveries"."error_message" is null and "auth_challenge_deliveries"."sent_at" is null)),
	CONSTRAINT "auth_challenge_deliveries_sent_fields_check" CHECK ("auth_challenge_deliveries"."status" <> 'sent' or ("auth_challenge_deliveries"."provider" is not null and "auth_challenge_deliveries"."error_code" is null and "auth_challenge_deliveries"."error_message" is null)),
	CONSTRAINT "auth_challenge_deliveries_failed_fields_check" CHECK ("auth_challenge_deliveries"."status" <> 'failed' or ("auth_challenge_deliveries"."provider" is not null and "auth_challenge_deliveries"."error_code" is not null and "auth_challenge_deliveries"."error_message" is not null and "auth_challenge_deliveries"."sent_at" is null))
);
--> statement-breakpoint
CREATE TABLE "auth_challenge_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"provider_status_code" integer,
	"provider_message_id" text,
	"error_code" text,
	"error_message" text,
	"attempted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_challenge_delivery_attempts_attempt_number_check" CHECK ("auth_challenge_delivery_attempts"."attempt_number" > 0),
	CONSTRAINT "auth_challenge_delivery_attempts_status_check" CHECK ("auth_challenge_delivery_attempts"."status" in ('sent', 'failed')),
	CONSTRAINT "auth_challenge_delivery_attempts_provider_status_code_check" CHECK ("auth_challenge_delivery_attempts"."provider_status_code" is null or "auth_challenge_delivery_attempts"."provider_status_code" between 100 and 599),
	CONSTRAINT "auth_challenge_delivery_attempts_sent_fields_check" CHECK ("auth_challenge_delivery_attempts"."status" <> 'sent' or ("auth_challenge_delivery_attempts"."error_code" is null and "auth_challenge_delivery_attempts"."error_message" is null)),
	CONSTRAINT "auth_challenge_delivery_attempts_failed_fields_check" CHECK ("auth_challenge_delivery_attempts"."status" <> 'failed' or ("auth_challenge_delivery_attempts"."error_code" is not null and "auth_challenge_delivery_attempts"."error_message" is not null and "auth_challenge_delivery_attempts"."provider_message_id" is null))
);
--> statement-breakpoint
CREATE TABLE "auth_security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "auth_security_events_event_type_check" CHECK ("auth_security_events"."event_type" in (
        'registration_succeeded',
        'login_succeeded',
        'login_failed',
        'logout_succeeded',
        'session_revoked'
      ))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_status_check" CHECK ("outbox_events"."status" in ('pending', 'publishing', 'published')),
	CONSTRAINT "outbox_events_attempts_check" CHECK ("outbox_events"."attempts" >= 0),
	CONSTRAINT "outbox_events_pending_not_published_check" CHECK ("outbox_events"."status" <> 'pending' or "outbox_events"."published_at" is null),
	CONSTRAINT "outbox_events_publishing_locked_check" CHECK ("outbox_events"."status" <> 'publishing' or "outbox_events"."locked_at" is not null),
	CONSTRAINT "outbox_events_published_at_check" CHECK ("outbox_events"."status" <> 'published' or "outbox_events"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "dictionary_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_platform_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"code" text NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_platform_entries_category_code_locale_unique" UNIQUE("category_id","code","locale"),
	CONSTRAINT "dictionary_platform_entries_identity_category_code_locale_unique" UNIQUE("id","category_id","code","locale"),
	CONSTRAINT "dictionary_platform_entries_locale_check" CHECK ("dictionary_platform_entries"."locale" in ('ru', 'en')),
	CONSTRAINT "dictionary_platform_entries_status_check" CHECK ("dictionary_platform_entries"."status" in ('published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "dictionary_astrologer_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"platform_entry_id" uuid,
	"category_id" uuid NOT NULL,
	"code" text NOT NULL,
	"locale" text NOT NULL,
	"entry_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_astrologer_entries_locale_check" CHECK ("dictionary_astrologer_entries"."locale" in ('ru', 'en')),
	CONSTRAINT "dictionary_astrologer_entries_entry_type_check" CHECK ("dictionary_astrologer_entries"."entry_type" in ('override', 'custom')),
	CONSTRAINT "dictionary_astrologer_entries_override_platform_check" CHECK ("dictionary_astrologer_entries"."entry_type" <> 'override' or "dictionary_astrologer_entries"."platform_entry_id" is not null),
	CONSTRAINT "dictionary_astrologer_entries_custom_platform_check" CHECK ("dictionary_astrologer_entries"."entry_type" <> 'custom' or "dictionary_astrologer_entries"."platform_entry_id" is null)
);
--> statement-breakpoint
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
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"visibility" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"width" integer,
	"height" integer,
	"alt_text" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_bucket_storage_key_unique" UNIQUE("storage_bucket","storage_key"),
	CONSTRAINT "media_assets_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "media_assets_purpose_check" CHECK ("media_assets"."purpose" in ('product_cover', 'profile_avatar', 'profile_cover', 'verification_identity_document', 'verification_qualification_document', 'calculation_report_pdf', 'messaging_attachment')),
	CONSTRAINT "media_assets_status_check" CHECK ("media_assets"."status" in ('uploading', 'processing', 'ready', 'failed', 'deleted')),
	CONSTRAINT "media_assets_visibility_check" CHECK ("media_assets"."visibility" in ('public', 'private')),
	CONSTRAINT "media_assets_mime_type_check" CHECK ("media_assets"."mime_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'video/mp4')),
	CONSTRAINT "media_assets_size_bytes_check" CHECK ("media_assets"."size_bytes" >= 0),
	CONSTRAINT "media_assets_ready_size_bytes_check" CHECK ("media_assets"."status" <> 'ready' or "media_assets"."size_bytes" > 0),
	CONSTRAINT "media_assets_width_check" CHECK ("media_assets"."width" is null or "media_assets"."width" > 0),
	CONSTRAINT "media_assets_height_check" CHECK ("media_assets"."height" is null or "media_assets"."height" > 0),
	CONSTRAINT "media_assets_checksum_sha256_check" CHECK ("media_assets"."checksum_sha256" is null or "media_assets"."checksum_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "media_assets_alt_text_length_check" CHECK ("media_assets"."alt_text" is null or length(trim("media_assets"."alt_text")) <= 300)
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"variant" text NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_variants_asset_variant_unique" UNIQUE("asset_id","variant"),
	CONSTRAINT "media_variants_storage_bucket_storage_key_unique" UNIQUE("storage_bucket","storage_key"),
	CONSTRAINT "media_variants_variant_check" CHECK ("media_variants"."variant" in ('original', 'preview', 'card', 'cover')),
	CONSTRAINT "media_variants_mime_type_check" CHECK ("media_variants"."mime_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
	CONSTRAINT "media_variants_width_check" CHECK ("media_variants"."width" > 0),
	CONSTRAINT "media_variants_height_check" CHECK ("media_variants"."height" > 0),
	CONSTRAINT "media_variants_size_bytes_check" CHECK ("media_variants"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "astrologer_profiles" (
	"owner_user_id" uuid PRIMARY KEY NOT NULL,
	"public_handle" text NOT NULL,
	"public_name" text NOT NULL,
	"headline" text,
	"bio" text,
	"timezone" text NOT NULL,
	"locale" text NOT NULL,
	"avatar_media_id" uuid,
	"cover_media_id" uuid,
	"consultation_languages" jsonb NOT NULL,
	"visibility_status" text DEFAULT 'draft' NOT NULL,
	"professional_experience_years" integer,
	"professional_school" text,
	"specializations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"telegram_handle" text,
	"instagram_handle" text,
	"whatsapp_contact" text,
	"website_url" text,
	"own_birth_date" text,
	"own_birth_time" text,
	"own_birth_place" text,
	"show_own_birth_data_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "astrologer_profiles_public_handle_unique" UNIQUE("public_handle"),
	CONSTRAINT "astrologer_profiles_public_handle_format_check" CHECK ("astrologer_profiles"."public_handle" ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$'),
	CONSTRAINT "astrologer_profiles_public_name_length_check" CHECK (length(trim("astrologer_profiles"."public_name")) between 2 and 200),
	CONSTRAINT "astrologer_profiles_headline_length_check" CHECK ("astrologer_profiles"."headline" is null or length(trim("astrologer_profiles"."headline")) <= 240),
	CONSTRAINT "astrologer_profiles_bio_length_check" CHECK ("astrologer_profiles"."bio" is null or length(trim("astrologer_profiles"."bio")) <= 4000),
	CONSTRAINT "astrologer_profiles_timezone_length_check" CHECK (length(trim("astrologer_profiles"."timezone")) > 0),
	CONSTRAINT "astrologer_profiles_locale_length_check" CHECK (length(trim("astrologer_profiles"."locale")) > 0),
	CONSTRAINT "astrologer_profiles_visibility_status_check" CHECK ("astrologer_profiles"."visibility_status" in ('published', 'paused', 'draft')),
	CONSTRAINT "astrologer_profiles_experience_years_check" CHECK ("astrologer_profiles"."professional_experience_years" is null or ("astrologer_profiles"."professional_experience_years" >= 0 and "astrologer_profiles"."professional_experience_years" <= 100)),
	CONSTRAINT "astrologer_profiles_school_length_check" CHECK ("astrologer_profiles"."professional_school" is null or length(trim("astrologer_profiles"."professional_school")) <= 500),
	CONSTRAINT "astrologer_profiles_own_birth_date_check" CHECK ("astrologer_profiles"."own_birth_date" is null or "astrologer_profiles"."own_birth_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "astrologer_profiles_own_birth_time_check" CHECK ("astrologer_profiles"."own_birth_time" is null or "astrologer_profiles"."own_birth_time" ~ '^[0-9]{2}:[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "verification_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewer_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_applications_status_check" CHECK ("verification_applications"."status" in ('pending', 'approved', 'rejected', 'revoked')),
	CONSTRAINT "verification_applications_rejection_reason_check" CHECK ("verification_applications"."status" <> 'rejected' or length(trim("verification_applications"."rejection_reason")) > 0),
	CONSTRAINT "verification_applications_reviewed_at_check" CHECK ("verification_applications"."status" = 'pending' or "verification_applications"."reviewed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "verification_application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"media_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_application_documents_kind_check" CHECK ("verification_application_documents"."kind" in ('identity', 'qualification'))
);
--> statement-breakpoint
CREATE TABLE "calculation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"module" text NOT NULL,
	"mode" text NOT NULL,
	"method_code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'calculated' NOT NULL,
	"request_fingerprint" text NOT NULL,
	"input_data" jsonb NOT NULL,
	"result_data" jsonb NOT NULL,
	"result_summary" jsonb NOT NULL,
	"result_checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_records_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "calculation_records_module_check" CHECK ("calculation_records"."module" in ('numerology', 'chart', 'matrix', 'human_design')),
	CONSTRAINT "calculation_records_mode_check" CHECK ("calculation_records"."mode" in ('individual', 'compatibility')),
	CONSTRAINT "calculation_records_status_check" CHECK ("calculation_records"."status" in ('calculated', 'linked', 'published', 'archived')),
	CONSTRAINT "calculation_records_request_fingerprint_check" CHECK ("calculation_records"."request_fingerprint" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "calculation_records_input_data_object_check" CHECK (jsonb_typeof("calculation_records"."input_data") = 'object'),
	CONSTRAINT "calculation_records_result_data_object_check" CHECK (jsonb_typeof("calculation_records"."result_data") = 'object'),
	CONSTRAINT "calculation_records_result_summary_object_check" CHECK (jsonb_typeof("calculation_records"."result_summary") = 'object'),
	CONSTRAINT "calculation_records_result_checksum_check" CHECK ("calculation_records"."result_checksum" ~ '^sha256:[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "calculation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"source" text NOT NULL,
	"client_id" uuid,
	"display_name" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_participants_role_check" CHECK ("calculation_participants"."role" in ('subject', 'partner')),
	CONSTRAINT "calculation_participants_source_check" CHECK ("calculation_participants"."source" in ('crm_client', 'manual')),
	CONSTRAINT "calculation_participants_source_client_check" CHECK (("calculation_participants"."source" = 'crm_client' and "calculation_participants"."client_id" is not null) or ("calculation_participants"."source" = 'manual' and "calculation_participants"."client_id" is null)),
	CONSTRAINT "calculation_participants_order_check" CHECK ("calculation_participants"."order" >= 0 and "calculation_participants"."order" < 2)
);
--> statement-breakpoint
CREATE TABLE "calculation_client_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"visibility" text DEFAULT 'private_to_astrologer' NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_client_links_visibility_check" CHECK ("calculation_client_links"."visibility" in ('private_to_astrologer', 'visible_to_client')),
	CONSTRAINT "calculation_client_links_published_at_check" CHECK ("calculation_client_links"."visibility" <> 'visible_to_client' or "calculation_client_links"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "calculation_interpretations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"text" text NOT NULL,
	"model_id" text,
	"prompt_version" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_interpretations_source_check" CHECK ("calculation_interpretations"."source" in ('ai', 'manual')),
	CONSTRAINT "calculation_interpretations_status_check" CHECK ("calculation_interpretations"."status" in ('draft', 'approved')),
	CONSTRAINT "calculation_interpretations_approved_at_check" CHECK ("calculation_interpretations"."status" <> 'approved' or "calculation_interpretations"."approved_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "calculation_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculation_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"artifact_type" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_artifacts_id_calculation_unique" UNIQUE("id","calculation_id"),
	CONSTRAINT "calculation_artifacts_type_check" CHECK ("calculation_artifacts"."artifact_type" in ('pdf')),
	CONSTRAINT "calculation_artifacts_status_check" CHECK ("calculation_artifacts"."status" in ('generating', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "calculation_pdf_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"calculation_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"module" text NOT NULL,
	"method_code" text NOT NULL,
	"result_checksum" text NOT NULL,
	"locale" text NOT NULL,
	"source_locator" jsonb NOT NULL,
	"document_fingerprint" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"artifact_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"failure_code" text,
	"failure_reason" text,
	"page_count" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "calculation_pdf_jobs_module_check" CHECK ("calculation_pdf_jobs"."module" in ('numerology', 'chart', 'matrix', 'human_design')),
	CONSTRAINT "calculation_pdf_jobs_method_code_check" CHECK (length(trim("calculation_pdf_jobs"."method_code")) between 1 and 100),
	CONSTRAINT "calculation_pdf_jobs_result_checksum_check" CHECK ("calculation_pdf_jobs"."result_checksum" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "calculation_pdf_jobs_locale_check" CHECK ("calculation_pdf_jobs"."locale" in ('ru', 'en')),
	CONSTRAINT "calculation_pdf_jobs_source_locator_object_check" CHECK (jsonb_typeof("calculation_pdf_jobs"."source_locator") = 'object'),
	CONSTRAINT "calculation_pdf_jobs_document_fingerprint_check" CHECK ("calculation_pdf_jobs"."document_fingerprint" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "calculation_pdf_jobs_status_check" CHECK ("calculation_pdf_jobs"."status" in ('queued', 'processing', 'ready', 'failed')),
	CONSTRAINT "calculation_pdf_jobs_failure_code_check" CHECK ("calculation_pdf_jobs"."failure_code" is null or length(trim("calculation_pdf_jobs"."failure_code")) between 1 and 100),
	CONSTRAINT "calculation_pdf_jobs_failure_reason_check" CHECK ("calculation_pdf_jobs"."failure_reason" is null or length(trim("calculation_pdf_jobs"."failure_reason")) between 1 and 500),
	CONSTRAINT "calculation_pdf_jobs_page_count_check" CHECK ("calculation_pdf_jobs"."page_count" is null or "calculation_pdf_jobs"."page_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "chart_calculation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"result_calculation_id" uuid,
	"method" text DEFAULT 'natal' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input_fingerprint" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"settings_snapshot" jsonb NOT NULL,
	"provider" text DEFAULT 'kerykeion' NOT NULL,
	"schema_version" text DEFAULT 'chart-result.v1' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_calculation_jobs_method_check" CHECK ("chart_calculation_jobs"."method" in ('natal', 'astrocartography', 'transit', 'synastry', 'composite', 'solar_return', 'progression', 'horary')),
	CONSTRAINT "chart_calculation_jobs_status_check" CHECK ("chart_calculation_jobs"."status" in ('queued', 'processing', 'succeeded', 'failed')),
	CONSTRAINT "chart_calculation_jobs_provider_check" CHECK ("chart_calculation_jobs"."provider" in ('kerykeion')),
	CONSTRAINT "chart_calculation_jobs_schema_version_check" CHECK ("chart_calculation_jobs"."schema_version" in ('chart-result.v1')),
	CONSTRAINT "chart_calculation_jobs_input_fingerprint_check" CHECK ("chart_calculation_jobs"."input_fingerprint" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "chart_calculation_jobs_input_snapshot_object_check" CHECK (jsonb_typeof("chart_calculation_jobs"."input_snapshot") = 'object'),
	CONSTRAINT "chart_calculation_jobs_settings_snapshot_object_check" CHECK (jsonb_typeof("chart_calculation_jobs"."settings_snapshot") = 'object'),
	CONSTRAINT "chart_calculation_jobs_attempts_check" CHECK ("chart_calculation_jobs"."attempts" >= 0),
	CONSTRAINT "chart_calculation_jobs_max_attempts_check" CHECK ("chart_calculation_jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "astro_calendar_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" text DEFAULT 'calculating' NOT NULL,
	"input_fingerprint" text NOT NULL,
	"range_start" date NOT NULL,
	"range_end" date NOT NULL,
	"time_zone" text NOT NULL,
	"request_snapshot" jsonb NOT NULL,
	"settings_snapshot" jsonb NOT NULL,
	"readiness_summary" jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" jsonb,
	"generated_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "astro_calendar_generations_status_check" CHECK ("astro_calendar_generations"."status" in ('calculating', 'ready', 'failed', 'stale')),
	CONSTRAINT "astro_calendar_generations_fingerprint_check" CHECK ("astro_calendar_generations"."input_fingerprint" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "astro_calendar_generations_range_check" CHECK ("astro_calendar_generations"."range_end" >= "astro_calendar_generations"."range_start"),
	CONSTRAINT "astro_calendar_generations_timezone_check" CHECK (length(trim("astro_calendar_generations"."time_zone")) > 0),
	CONSTRAINT "astro_calendar_generations_request_snapshot_object_check" CHECK (jsonb_typeof("astro_calendar_generations"."request_snapshot") = 'object'),
	CONSTRAINT "astro_calendar_generations_settings_snapshot_object_check" CHECK (jsonb_typeof("astro_calendar_generations"."settings_snapshot") = 'object'),
	CONSTRAINT "astro_calendar_generations_readiness_summary_object_check" CHECK (jsonb_typeof("astro_calendar_generations"."readiness_summary") = 'object'),
	CONSTRAINT "astro_calendar_generations_summary_object_check" CHECK (jsonb_typeof("astro_calendar_generations"."summary") = 'object'),
	CONSTRAINT "astro_calendar_generations_warnings_array_check" CHECK (jsonb_typeof("astro_calendar_generations"."warnings") = 'array')
);
--> statement-breakpoint
CREATE TABLE "astro_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"time_precision" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"dictionary_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "astro_calendar_events_source_check" CHECK ("astro_calendar_events"."source" in ('global', 'client')),
	CONSTRAINT "astro_calendar_events_type_check" CHECK ("astro_calendar_events"."type" in ('global.moon_phase', 'global.eclipse', 'global.ingress', 'client.birthday', 'client.solar_window', 'client.transit_aspect')),
	CONSTRAINT "astro_calendar_events_time_precision_check" CHECK ("astro_calendar_events"."time_precision" in ('exact', 'hour', 'day')),
	CONSTRAINT "astro_calendar_events_payload_object_check" CHECK (jsonb_typeof("astro_calendar_events"."payload") = 'object'),
	CONSTRAINT "astro_calendar_events_dictionary_codes_array_check" CHECK (jsonb_typeof("astro_calendar_events"."dictionary_codes") = 'array'),
	CONSTRAINT "astro_calendar_events_range_check" CHECK ("astro_calendar_events"."ends_at" is null or "astro_calendar_events"."ends_at" >= "astro_calendar_events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approval_mode" text DEFAULT 'manual_approve' NOT NULL,
	"draft_graph" jsonb NOT NULL,
	"published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "flows_name_length_check" CHECK (length(trim("flows"."name")) between 1 and 180),
	CONSTRAINT "flows_status_check" CHECK ("flows"."status" in ('draft', 'published', 'active', 'paused', 'archived')),
	CONSTRAINT "flows_approval_mode_check" CHECK ("flows"."approval_mode" in ('draft_only', 'manual_approve', 'auto_internal', 'auto_send')),
	CONSTRAINT "flows_draft_graph_object_check" CHECK (jsonb_typeof("flows"."draft_graph") = 'object')
);
--> statement-breakpoint
CREATE TABLE "flow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"approval_mode" text NOT NULL,
	"graph" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "flow_versions_positive_version_check" CHECK ("flow_versions"."version" > 0),
	CONSTRAINT "flow_versions_approval_mode_check" CHECK ("flow_versions"."approval_mode" in ('draft_only', 'manual_approve', 'auto_internal', 'auto_send')),
	CONSTRAINT "flow_versions_graph_object_check" CHECK (jsonb_typeof("flow_versions"."graph") = 'object')
);
--> statement-breakpoint
CREATE TABLE "client_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name_snapshot" text,
	"preferred_locale" text,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_profiles_display_name_length_check" CHECK ("client_profiles"."display_name_snapshot" is null or length(trim("client_profiles"."display_name_snapshot")) between 1 and 200),
	CONSTRAINT "client_profiles_preferred_locale_length_check" CHECK ("client_profiles"."preferred_locale" is null or length(trim("client_profiles"."preferred_locale")) between 2 and 20),
	CONSTRAINT "client_profiles_timezone_length_check" CHECK ("client_profiles"."timezone" is null or length(trim("client_profiles"."timezone")) > 0)
);
--> statement-breakpoint
CREATE TABLE "client_birth_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"label" text,
	"birth_date" text,
	"birth_time" text,
	"birth_time_precision" text DEFAULT 'unknown' NOT NULL,
	"birth_place_text" text,
	"birth_country_code" text,
	"birth_city" text,
	"birth_region" text,
	"birth_timezone" text,
	"birth_time_dst_occurrence" text,
	"birth_latitude" double precision,
	"birth_longitude" double precision,
	"source" text DEFAULT 'client_profile' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_birth_data_time_precision_check" CHECK ("client_birth_data"."birth_time_precision" in ('exact', 'approximate', 'unknown')),
	CONSTRAINT "client_birth_data_source_check" CHECK ("client_birth_data"."source" in ('client_profile', 'booking', 'import', 'manual')),
	CONSTRAINT "client_birth_data_time_dst_occurrence_check" CHECK ("client_birth_data"."birth_time_dst_occurrence" is null or "client_birth_data"."birth_time_dst_occurrence" in ('first', 'second')),
	CONSTRAINT "client_birth_data_birth_date_check" CHECK ("client_birth_data"."birth_date" is null or "client_birth_data"."birth_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "client_birth_data_birth_time_check" CHECK ("client_birth_data"."birth_time" is null or "client_birth_data"."birth_time" ~ '^[0-9]{2}:[0-9]{2}$'),
	CONSTRAINT "client_birth_data_unknown_time_check" CHECK ("client_birth_data"."birth_time_precision" <> 'unknown' or "client_birth_data"."birth_time" is null),
	CONSTRAINT "client_birth_data_country_code_check" CHECK ("client_birth_data"."birth_country_code" is null or "client_birth_data"."birth_country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "client_birth_data_latitude_check" CHECK ("client_birth_data"."birth_latitude" is null or ("client_birth_data"."birth_latitude" >= -90 and "client_birth_data"."birth_latitude" <= 90)),
	CONSTRAINT "client_birth_data_longitude_check" CHECK ("client_birth_data"."birth_longitude" is null or ("client_birth_data"."birth_longitude" >= -180 and "client_birth_data"."birth_longitude" <= 180))
);
--> statement-breakpoint
CREATE TABLE "client_astrologer_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_linked_at" timestamp with time zone NOT NULL,
	"last_linked_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	"blocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_astrologer_relationships_source_check" CHECK ("client_astrologer_relationships"."source" in ('direct_link', 'booking', 'order', 'lead_magnet', 'manual')),
	CONSTRAINT "client_astrologer_relationships_status_check" CHECK ("client_astrologer_relationships"."status" in ('active', 'archived', 'blocked')),
	CONSTRAINT "client_astrologer_relationships_distinct_users_check" CHECK ("client_astrologer_relationships"."client_user_id" <> "client_astrologer_relationships"."astrologer_user_id")
);
--> statement-breakpoint
CREATE TABLE "client_join_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"public_handle_snapshot" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_by_client_user_id" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_join_intents_status_check" CHECK ("client_join_intents"."status" in ('pending', 'claimed', 'expired')),
	CONSTRAINT "client_join_intents_public_handle_check" CHECK ("client_join_intents"."public_handle_snapshot" ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
	CONSTRAINT "client_join_intents_claimed_consistency_check" CHECK (("client_join_intents"."status" = 'claimed') = ("client_join_intents"."claimed_by_client_user_id" is not null and "client_join_intents"."claimed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "matrix_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"calculation_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"result_checksum" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "matrix_notes_text_length_check" CHECK (length(trim("matrix_notes"."text")) between 1 and 10000),
	CONSTRAINT "matrix_notes_result_checksum_check" CHECK ("matrix_notes"."result_checksum" ~ '^sha256:[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "matrix_report_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"calculation_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"locale" text NOT NULL,
	"content" jsonb NOT NULL,
	"plain_text" text NOT NULL,
	"result_checksum" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"model_id" text,
	"prompt_version" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "matrix_report_drafts_calculation_unique" UNIQUE("calculation_id"),
	CONSTRAINT "matrix_report_drafts_identity_unique" UNIQUE("id","calculation_id","owner_user_id"),
	CONSTRAINT "matrix_report_drafts_source_check" CHECK ("matrix_report_drafts"."source" in ('manual', 'ai')),
	CONSTRAINT "matrix_report_drafts_status_check" CHECK ("matrix_report_drafts"."status" in ('draft', 'ready')),
	CONSTRAINT "matrix_report_drafts_locale_check" CHECK ("matrix_report_drafts"."locale" in ('ru', 'en')),
	CONSTRAINT "matrix_report_drafts_content_object_check" CHECK (jsonb_typeof("matrix_report_drafts"."content") = 'object'),
	CONSTRAINT "matrix_report_drafts_plain_text_length_check" CHECK (length(trim("matrix_report_drafts"."plain_text")) between 1 and 50000),
	CONSTRAINT "matrix_report_drafts_result_checksum_check" CHECK ("matrix_report_drafts"."result_checksum" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "matrix_report_drafts_revision_check" CHECK ("matrix_report_drafts"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "availability_date_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "availability_date_overrides_identity_unique" UNIQUE("id","schedule_id","owner_user_id"),
	CONSTRAINT "availability_date_overrides_schedule_date_unique" UNIQUE("schedule_id","local_date"),
	CONSTRAINT "availability_date_overrides_mode_check" CHECK ("availability_date_overrides"."mode" in ('available', 'unavailable'))
);
--> statement-breakpoint
CREATE TABLE "availability_override_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"override_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	CONSTRAINT "availability_override_periods_override_range_unique" UNIQUE("override_id","start_minute","end_minute"),
	CONSTRAINT "availability_override_periods_range_check" CHECK ("availability_override_periods"."start_minute" >= 0 and "availability_override_periods"."end_minute" <= 1440 and "availability_override_periods"."start_minute" < "availability_override_periods"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "availability_product_assignments" (
	"schedule_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "availability_product_assignments_pk" PRIMARY KEY("schedule_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "availability_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"time_zone" text NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"start_interval_minutes" integer NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"minimum_notice_minutes" integer DEFAULT 0 NOT NULL,
	"booking_horizon_days" integer NOT NULL,
	"maximum_bookings_per_day" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_schedules_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "availability_schedules_name_length_check" CHECK (length(trim("availability_schedules"."name")) between 1 and 120),
	CONSTRAINT "availability_schedules_time_zone_length_check" CHECK (length(trim("availability_schedules"."time_zone")) between 1 and 100),
	CONSTRAINT "availability_schedules_version_check" CHECK ("availability_schedules"."version" > 0),
	CONSTRAINT "availability_schedules_start_interval_check" CHECK ("availability_schedules"."start_interval_minutes" between 1 and 1440),
	CONSTRAINT "availability_schedules_buffer_before_check" CHECK ("availability_schedules"."buffer_before_minutes" between 0 and 10080),
	CONSTRAINT "availability_schedules_buffer_after_check" CHECK ("availability_schedules"."buffer_after_minutes" between 0 and 10080),
	CONSTRAINT "availability_schedules_minimum_notice_check" CHECK ("availability_schedules"."minimum_notice_minutes" between 0 and 525600),
	CONSTRAINT "availability_schedules_booking_horizon_check" CHECK ("availability_schedules"."booking_horizon_days" between 1 and 730),
	CONSTRAINT "availability_schedules_maximum_bookings_check" CHECK ("availability_schedules"."maximum_bookings_per_day" is null or "availability_schedules"."maximum_bookings_per_day" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "availability_weekly_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	CONSTRAINT "availability_weekly_periods_schedule_day_range_unique" UNIQUE("schedule_id","weekday","start_minute","end_minute"),
	CONSTRAINT "availability_weekly_periods_weekday_check" CHECK ("availability_weekly_periods"."weekday" between 1 and 7),
	CONSTRAINT "availability_weekly_periods_range_check" CHECK ("availability_weekly_periods"."start_minute" >= 0 and "availability_weekly_periods"."end_minute" <= 1440 and "availability_weekly_periods"."start_minute" < "availability_weekly_periods"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"state" text DEFAULT 'confirmed' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"service_start_at" timestamp with time zone NOT NULL,
	"service_end_at" timestamp with time zone NOT NULL,
	"product_title_snapshot" text NOT NULL,
	"duration_minutes_snapshot" integer NOT NULL,
	"delivery_format_snapshot" text NOT NULL,
	"price_minor_snapshot" integer NOT NULL,
	"currency_snapshot" text NOT NULL,
	"time_zone_snapshot" text NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reservation_unique" UNIQUE("reservation_id"),
	CONSTRAINT "bookings_state_check" CHECK ("bookings"."state" in ('hold', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired')),
	CONSTRAINT "bookings_source_check" CHECK ("bookings"."source" in ('manual', 'client_paid')),
	CONSTRAINT "bookings_hold_expiry_check" CHECK (("bookings"."state" = 'hold' and "bookings"."hold_expires_at" is not null) or ("bookings"."state" <> 'hold' and "bookings"."hold_expires_at" is null)),
	CONSTRAINT "bookings_service_range_check" CHECK ("bookings"."service_start_at" < "bookings"."service_end_at"),
	CONSTRAINT "bookings_product_title_length_check" CHECK (length(trim("bookings"."product_title_snapshot")) between 1 and 200),
	CONSTRAINT "bookings_duration_check" CHECK ("bookings"."duration_minutes_snapshot" between 1 and 1440),
	CONSTRAINT "bookings_delivery_format_check" CHECK ("bookings"."delivery_format_snapshot" in ('video', 'audio', 'chat', 'text', 'file', 'channel')),
	CONSTRAINT "bookings_price_check" CHECK ("bookings"."price_minor_snapshot" >= 0),
	CONSTRAINT "bookings_currency_check" CHECK ("bookings"."currency_snapshot" in ('RUB')),
	CONSTRAINT "bookings_time_zone_length_check" CHECK (length(trim("bookings"."time_zone_snapshot")) between 1 and 100),
	CONSTRAINT "bookings_policy_snapshot_check" CHECK (jsonb_typeof("bookings"."policy_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "manual_calendar_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_calendar_blocks_reservation_unique" UNIQUE("reservation_id"),
	CONSTRAINT "manual_calendar_blocks_title_length_check" CHECK (length(trim("manual_calendar_blocks"."title")) between 1 and 120),
	CONSTRAINT "manual_calendar_blocks_state_check" CHECK ("manual_calendar_blocks"."state" in ('active', 'released'))
);
--> statement-breakpoint
CREATE TABLE "schedule_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"service_start_at" timestamp with time zone NOT NULL,
	"service_end_at" timestamp with time zone NOT NULL,
	"occupied_start_at" timestamp with time zone NOT NULL,
	"occupied_end_at" timestamp with time zone NOT NULL,
	"source_aggregate_id" uuid,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_reservations_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "schedule_reservations_kind_check" CHECK ("schedule_reservations"."kind" in ('booking', 'hold', 'manual_block')),
	CONSTRAINT "schedule_reservations_lifecycle_check" CHECK ("schedule_reservations"."lifecycle" in ('active', 'consumed', 'released', 'expired', 'cancelled')),
	CONSTRAINT "schedule_reservations_service_range_check" CHECK ("schedule_reservations"."service_start_at" < "schedule_reservations"."service_end_at"),
	CONSTRAINT "schedule_reservations_occupied_range_check" CHECK ("schedule_reservations"."occupied_start_at" < "schedule_reservations"."occupied_end_at" and "schedule_reservations"."occupied_start_at" <= "schedule_reservations"."service_start_at" and "schedule_reservations"."occupied_end_at" >= "schedule_reservations"."service_end_at"),
	CONSTRAINT "schedule_reservations_source_check" CHECK (("schedule_reservations"."kind" in ('booking', 'manual_block') and "schedule_reservations"."source_aggregate_id" is not null) or "schedule_reservations"."kind" = 'hold'),
	CONSTRAINT "schedule_reservations_hold_expiry_check" CHECK (("schedule_reservations"."kind" = 'hold' and "schedule_reservations"."hold_expires_at" is not null) or ("schedule_reservations"."kind" <> 'hold' and "schedule_reservations"."hold_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "idempotency_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_surface" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"command_scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_commands_api_surface_length_check" CHECK (length(trim("idempotency_commands"."api_surface")) between 1 and 100),
	CONSTRAINT "idempotency_commands_scope_length_check" CHECK (length(trim("idempotency_commands"."command_scope")) between 1 and 150),
	CONSTRAINT "idempotency_commands_key_length_check" CHECK (length("idempotency_commands"."key") between 8 and 255),
	CONSTRAINT "idempotency_commands_request_hash_check" CHECK ("idempotency_commands"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "idempotency_commands_state_check" CHECK ("idempotency_commands"."state" in ('processing', 'completed')),
	CONSTRAINT "idempotency_commands_result_state_check" CHECK (("idempotency_commands"."state" = 'processing' and "idempotency_commands"."result" is null) or ("idempotency_commands"."state" = 'completed' and jsonb_typeof("idempotency_commands"."result") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "messaging_channel_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'connecting' NOT NULL,
	"external_account_id" text,
	"external_owner_user_id" text,
	"display_name_snapshot" text,
	"username_snapshot" text,
	"capabilities" jsonb NOT NULL,
	"consent_record_id" uuid,
	"connected_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_channel_connections_id_provider_unique" UNIQUE("id","provider"),
	CONSTRAINT "messaging_channel_connections_provider_check" CHECK ("messaging_channel_connections"."provider" in ('telegram', 'instagram')),
	CONSTRAINT "messaging_channel_connections_mode_check" CHECK ("messaging_channel_connections"."mode" in ('telegram_business_bot', 'telegram_mtproto_account', 'instagram_graph')),
	CONSTRAINT "messaging_channel_connections_provider_mode_check" CHECK (("messaging_channel_connections"."provider" = 'telegram' and "messaging_channel_connections"."mode" in ('telegram_business_bot', 'telegram_mtproto_account')) or ("messaging_channel_connections"."provider" = 'instagram' and "messaging_channel_connections"."mode" = 'instagram_graph')),
	CONSTRAINT "messaging_channel_connections_status_check" CHECK ("messaging_channel_connections"."status" in ('connecting', 'active', 'paused', 'revoked', 'reauth_required', 'error')),
	CONSTRAINT "messaging_channel_connections_capabilities_object_check" CHECK (jsonb_typeof("messaging_channel_connections"."capabilities") = 'object'),
	CONSTRAINT "messaging_channel_connections_external_account_id_length_check" CHECK ("messaging_channel_connections"."external_account_id" is null or length(trim("messaging_channel_connections"."external_account_id")) between 1 and 200),
	CONSTRAINT "messaging_channel_connections_external_owner_id_length_check" CHECK ("messaging_channel_connections"."external_owner_user_id" is null or length(trim("messaging_channel_connections"."external_owner_user_id")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "messaging_external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text,
	"provider_chat_id" text NOT NULL,
	"username_snapshot" text,
	"display_name_snapshot" text,
	"avatar_media_id" uuid,
	"linked_client_user_id" uuid,
	"link_status" text DEFAULT 'unlinked' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "messaging_external_identities_id_provider_unique" UNIQUE("id","provider"),
	CONSTRAINT "messaging_external_identities_provider_check" CHECK ("messaging_external_identities"."provider" in ('telegram', 'instagram')),
	CONSTRAINT "messaging_external_identities_link_status_check" CHECK ("messaging_external_identities"."link_status" in ('unlinked', 'suggested', 'linked', 'ignored')),
	CONSTRAINT "messaging_external_identities_provider_chat_id_length_check" CHECK (length(trim("messaging_external_identities"."provider_chat_id")) between 1 and 200),
	CONSTRAINT "messaging_external_identities_seen_at_check" CHECK ("messaging_external_identities"."last_seen_at" >= "messaging_external_identities"."first_seen_at")
);
--> statement-breakpoint
CREATE TABLE "messaging_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"client_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"last_message_id" uuid,
	"last_message_at" timestamp with time zone,
	"unread_astrologer_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_threads_status_check" CHECK ("messaging_threads"."status" in ('open', 'archived', 'blocked')),
	CONSTRAINT "messaging_threads_unread_astrologer_count_check" CHECK ("messaging_threads"."unread_astrologer_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "messaging_thread_identities" (
	"thread_id" uuid NOT NULL,
	"external_identity_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_thread_identities_provider_check" CHECK ("messaging_thread_identities"."provider" in ('telegram', 'instagram'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"external_identity_id" uuid,
	"direction" text NOT NULL,
	"sender_kind" text NOT NULL,
	"provider_message_id" text,
	"provider_update_id" text,
	"provider_sent_at" timestamp with time zone,
	"content_type" text DEFAULT 'text' NOT NULL,
	"text" text NOT NULL,
	"media_asset_id" uuid,
	"status" text NOT NULL,
	"failure_code" text,
	"idempotency_key" text,
	"request_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_direction_check" CHECK ("messages"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "messages_sender_kind_check" CHECK ("messages"."sender_kind" in ('client', 'astrologer', 'system')),
	CONSTRAINT "messages_content_type_check" CHECK ("messages"."content_type" in ('text', 'image', 'file', 'voice', 'video_note', 'video', 'unsupported')),
	CONSTRAINT "messages_status_check" CHECK ("messages"."status" in ('received', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown', 'deleted')),
	CONSTRAINT "messages_text_length_check" CHECK (length("messages"."text") <= 4000),
	CONSTRAINT "messages_outbound_request_check" CHECK ("messages"."direction" <> 'outbound' or ("messages"."idempotency_key" is not null and "messages"."request_hash" ~ '^sha256:[a-f0-9]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "message_media_ingestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_file_id" text NOT NULL,
	"provider_file_unique_id" text NOT NULL,
	"provider_mime_type" text,
	"provider_size_bytes" integer,
	"content_type" text NOT NULL,
	"duration_seconds" integer,
	"width" integer,
	"height" integer,
	"download_status" text DEFAULT 'pending' NOT NULL,
	"media_asset_id" uuid,
	"failure_code" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"checksum_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_media_ingestions_provider_check" CHECK ("message_media_ingestions"."provider" in ('telegram', 'instagram')),
	CONSTRAINT "message_media_ingestions_content_type_check" CHECK ("message_media_ingestions"."content_type" in ('text', 'image', 'file', 'voice', 'video_note', 'video', 'unsupported')),
	CONSTRAINT "message_media_ingestions_download_status_check" CHECK ("message_media_ingestions"."download_status" in ('pending', 'downloading', 'ready', 'failed', 'permanent_failed')),
	CONSTRAINT "message_media_ingestions_provider_size_check" CHECK ("message_media_ingestions"."provider_size_bytes" is null or "message_media_ingestions"."provider_size_bytes" >= 0),
	CONSTRAINT "message_media_ingestions_duration_check" CHECK ("message_media_ingestions"."duration_seconds" is null or "message_media_ingestions"."duration_seconds" >= 0),
	CONSTRAINT "message_media_ingestions_width_check" CHECK ("message_media_ingestions"."width" is null or "message_media_ingestions"."width" > 0),
	CONSTRAINT "message_media_ingestions_height_check" CHECK ("message_media_ingestions"."height" is null or "message_media_ingestions"."height" > 0),
	CONSTRAINT "message_media_ingestions_attempt_count_check" CHECK ("message_media_ingestions"."attempt_count" >= 0),
	CONSTRAINT "message_media_ingestions_checksum_check" CHECK ("message_media_ingestions"."checksum_sha256" is null or "message_media_ingestions"."checksum_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "message_media_ingestions_ready_media_check" CHECK ("message_media_ingestions"."download_status" <> 'ready' or "message_media_ingestions"."media_asset_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "message_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_request_id" text,
	"provider_response_message_id" text,
	"provider_status_code" integer,
	"status" text NOT NULL,
	"retryable" boolean NOT NULL,
	"error_code" text,
	"error_message" text,
	"attempted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "message_delivery_attempts_provider_check" CHECK ("message_delivery_attempts"."provider" in ('telegram', 'instagram')),
	CONSTRAINT "message_delivery_attempts_status_check" CHECK ("message_delivery_attempts"."status" in ('sent', 'failed', 'unknown')),
	CONSTRAINT "message_delivery_attempts_number_check" CHECK ("message_delivery_attempts"."attempt_number" > 0),
	CONSTRAINT "message_delivery_attempts_status_code_check" CHECK ("message_delivery_attempts"."provider_status_code" is null or "message_delivery_attempts"."provider_status_code" between 100 and 599)
);
--> statement-breakpoint
CREATE TABLE "messaging_instagram_graph_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text,
	"instagram_user_id" text NOT NULL,
	"instagram_username" text,
	"instagram_display_name" text,
	"user_access_token_encrypted" jsonb NOT NULL,
	"page_access_token_encrypted" jsonb NOT NULL,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_instagram_graph_accounts_connection_unique" UNIQUE("channel_connection_id"),
	CONSTRAINT "messaging_instagram_graph_accounts_instagram_user_unique" UNIQUE("instagram_user_id"),
	CONSTRAINT "messaging_instagram_graph_accounts_page_id_length_check" CHECK (length(trim("messaging_instagram_graph_accounts"."page_id")) between 1 and 200),
	CONSTRAINT "messaging_instagram_graph_accounts_instagram_user_id_length_check" CHECK (length(trim("messaging_instagram_graph_accounts"."instagram_user_id")) between 1 and 200),
	CONSTRAINT "messaging_instagram_graph_accounts_user_token_object_check" CHECK (jsonb_typeof("messaging_instagram_graph_accounts"."user_access_token_encrypted") = 'object'),
	CONSTRAINT "messaging_instagram_graph_accounts_page_token_object_check" CHECK (jsonb_typeof("messaging_instagram_graph_accounts"."page_access_token_encrypted") = 'object')
);
--> statement-breakpoint
CREATE TABLE "messaging_telegram_mtproto_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"login_state" text DEFAULT 'code_required' NOT NULL,
	"phone_number_encrypted" jsonb NOT NULL,
	"phone_code_hash_encrypted" jsonb NOT NULL,
	"session_encrypted" jsonb,
	"phone_number_last4" text NOT NULL,
	"telegram_user_id" text,
	"pts" integer,
	"qts" integer,
	"date_cursor" timestamp with time zone,
	"seq" integer,
	"lease_owner" text,
	"leased_until" timestamp with time zone,
	"last_listener_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_telegram_mtproto_sessions_connection_unique" UNIQUE("channel_connection_id"),
	CONSTRAINT "messaging_telegram_mtproto_sessions_login_state_check" CHECK ("messaging_telegram_mtproto_sessions"."login_state" in ('code_required', 'password_required', 'authorized', 'reauth_required', 'revoked')),
	CONSTRAINT "messaging_telegram_mtproto_sessions_phone_last4_check" CHECK ("messaging_telegram_mtproto_sessions"."phone_number_last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "messaging_telegram_mtproto_sessions_phone_encrypted_object_check" CHECK (jsonb_typeof("messaging_telegram_mtproto_sessions"."phone_number_encrypted") = 'object'),
	CONSTRAINT "messaging_telegram_mtproto_sessions_phone_code_hash_encrypted_object_check" CHECK (jsonb_typeof("messaging_telegram_mtproto_sessions"."phone_code_hash_encrypted") = 'object'),
	CONSTRAINT "messaging_telegram_mtproto_sessions_session_encrypted_object_check" CHECK ("messaging_telegram_mtproto_sessions"."session_encrypted" is null or jsonb_typeof("messaging_telegram_mtproto_sessions"."session_encrypted") = 'object'),
	CONSTRAINT "messaging_telegram_mtproto_sessions_update_cursors_check" CHECK (("messaging_telegram_mtproto_sessions"."pts" is null or "messaging_telegram_mtproto_sessions"."pts" >= 0) and ("messaging_telegram_mtproto_sessions"."qts" is null or "messaging_telegram_mtproto_sessions"."qts" >= 0) and ("messaging_telegram_mtproto_sessions"."seq" is null or "messaging_telegram_mtproto_sessions"."seq" >= 0)),
	CONSTRAINT "messaging_telegram_mtproto_sessions_telegram_user_id_length_check" CHECK ("messaging_telegram_mtproto_sessions"."telegram_user_id" is null or length(trim("messaging_telegram_mtproto_sessions"."telegram_user_id")) between 1 and 200),
	CONSTRAINT "messaging_telegram_mtproto_sessions_lease_owner_length_check" CHECK ("messaging_telegram_mtproto_sessions"."lease_owner" is null or length(trim("messaging_telegram_mtproto_sessions"."lease_owner")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "messaging_realtime_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" bigserial NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"thread_id" uuid,
	"message_id" uuid,
	"channel_connection_id" uuid,
	"external_identity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_realtime_events_type_check" CHECK ("messaging_realtime_events"."type" in ('thread.created', 'thread.updated', 'message.received', 'message.updated', 'message.deleted', 'channelConnection.updated', 'identity.linked', 'delivery.failed'))
);
--> statement-breakpoint
CREATE TABLE "astrologer_risk_profiles" (
	"astrologer_user_id" uuid PRIMARY KEY NOT NULL,
	"risk_tier" text DEFAULT 'standard' NOT NULL,
	"manual_risk_tier" text,
	"manual_override_reason" text,
	"hold_duration_hours_override" integer,
	"reserve_bps_override" integer,
	"reserve_release_delay_days_override" integer,
	"platform_fee_bps_override" integer,
	"provider_settlement_required_override" boolean,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "astrologer_risk_profiles_risk_tier_check" CHECK ("astrologer_risk_profiles"."risk_tier" in ('low', 'standard', 'elevated', 'high', 'manual_review')),
	CONSTRAINT "astrologer_risk_profiles_manual_risk_tier_check" CHECK ("astrologer_risk_profiles"."manual_risk_tier" is null or "astrologer_risk_profiles"."manual_risk_tier" in ('low', 'standard', 'elevated', 'high', 'manual_review')),
	CONSTRAINT "astrologer_risk_profiles_hold_override_check" CHECK ("astrologer_risk_profiles"."hold_duration_hours_override" is null or "astrologer_risk_profiles"."hold_duration_hours_override" between 0 and 4320),
	CONSTRAINT "astrologer_risk_profiles_reserve_override_check" CHECK ("astrologer_risk_profiles"."reserve_bps_override" is null or "astrologer_risk_profiles"."reserve_bps_override" between 0 and 10000),
	CONSTRAINT "astrologer_risk_profiles_reserve_release_override_check" CHECK ("astrologer_risk_profiles"."reserve_release_delay_days_override" is null or "astrologer_risk_profiles"."reserve_release_delay_days_override" between 0 and 540),
	CONSTRAINT "astrologer_risk_profiles_fee_override_check" CHECK ("astrologer_risk_profiles"."platform_fee_bps_override" is null or "astrologer_risk_profiles"."platform_fee_bps_override" between 0 and 10000),
	CONSTRAINT "astrologer_risk_profiles_manual_override_check" CHECK (("astrologer_risk_profiles"."manual_risk_tier" is null and "astrologer_risk_profiles"."manual_override_reason" is null and "astrologer_risk_profiles"."reviewed_by_user_id" is null and "astrologer_risk_profiles"."reviewed_at" is null) or ("astrologer_risk_profiles"."manual_risk_tier" is not null and "astrologer_risk_profiles"."manual_override_reason" is not null and length(trim("astrologer_risk_profiles"."manual_override_reason")) between 1 and 2000 and "astrologer_risk_profiles"."reviewed_by_user_id" is not null and "astrologer_risk_profiles"."reviewed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "finance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_version" integer NOT NULL,
	"risk_tier" text NOT NULL,
	"hold_duration_hours" integer DEFAULT 48 NOT NULL,
	"reserve_bps" integer DEFAULT 0 NOT NULL,
	"reserve_release_delay_days" integer DEFAULT 0 NOT NULL,
	"platform_fee_bps" integer NOT NULL,
	"provider_settlement_required" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"snapshotted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_policies_risk_tier_check" CHECK ("finance_policies"."risk_tier" in ('low', 'standard', 'elevated', 'high', 'manual_review')),
	CONSTRAINT "finance_policies_hold_duration_check" CHECK ("finance_policies"."hold_duration_hours" between 0 and 4320),
	CONSTRAINT "finance_policies_reserve_bps_check" CHECK ("finance_policies"."reserve_bps" between 0 and 10000),
	CONSTRAINT "finance_policies_reserve_release_delay_check" CHECK ("finance_policies"."reserve_release_delay_days" between 0 and 540),
	CONSTRAINT "finance_policies_platform_fee_bps_check" CHECK ("finance_policies"."platform_fee_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"direct_link_intent_id" uuid,
	"booking_id" uuid,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"gross_amount_minor" bigint NOT NULL,
	"gross_currency" text NOT NULL,
	"platform_fee_amount_minor" bigint NOT NULL,
	"platform_fee_currency" text NOT NULL,
	"astrologer_net_amount_minor" bigint NOT NULL,
	"astrologer_net_currency" text NOT NULL,
	"finance_policy_snapshot_id" uuid NOT NULL,
	"finance_policy_risk_tier" text DEFAULT 'standard' NOT NULL,
	"finance_policy_hold_duration_hours" integer DEFAULT 48 NOT NULL,
	"finance_policy_reserve_bps" integer DEFAULT 0 NOT NULL,
	"finance_policy_reserve_release_delay_days" integer DEFAULT 0 NOT NULL,
	"finance_policy_platform_fee_bps" integer DEFAULT 1000 NOT NULL,
	"finance_policy_provider_settlement_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('draft', 'pending_payment', 'paid', 'fulfilled', 'cancelled', 'expired', 'partially_refunded', 'refunded', 'chargeback')),
	CONSTRAINT "orders_money_currency_check" CHECK ("orders"."gross_currency" in ('RUB') and "orders"."platform_fee_currency" = "orders"."gross_currency" and "orders"."astrologer_net_currency" = "orders"."gross_currency"),
	CONSTRAINT "orders_money_amount_check" CHECK ("orders"."gross_amount_minor" >= 0 and "orders"."gross_amount_minor" <= 9007199254740991 and "orders"."platform_fee_amount_minor" >= 0 and "orders"."platform_fee_amount_minor" <= 9007199254740991 and "orders"."astrologer_net_amount_minor" >= 0 and "orders"."astrologer_net_amount_minor" <= 9007199254740991),
	CONSTRAINT "orders_money_allocation_check" CHECK ("orders"."gross_amount_minor" = "orders"."platform_fee_amount_minor" + "orders"."astrologer_net_amount_minor"),
	CONSTRAINT "orders_finance_policy_risk_tier_check" CHECK ("orders"."finance_policy_risk_tier" in ('low', 'standard', 'elevated', 'high', 'manual_review')),
	CONSTRAINT "orders_finance_policy_hold_duration_check" CHECK ("orders"."finance_policy_hold_duration_hours" between 0 and 4320),
	CONSTRAINT "orders_finance_policy_reserve_bps_check" CHECK ("orders"."finance_policy_reserve_bps" between 0 and 10000),
	CONSTRAINT "orders_finance_policy_reserve_release_check" CHECK ("orders"."finance_policy_reserve_release_delay_days" between 0 and 540),
	CONSTRAINT "orders_finance_policy_platform_fee_check" CHECK ("orders"."finance_policy_platform_fee_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"provider_payment_id" text,
	"provider_checkout_id" text,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_provider_check" CHECK ("payment_attempts"."provider" in ('arc_pay')),
	CONSTRAINT "payment_attempts_environment_check" CHECK ("payment_attempts"."environment" in ('sandbox', 'live')),
	CONSTRAINT "payment_attempts_status_check" CHECK ("payment_attempts"."status" in ('created', 'checkout_opened', 'pending', 'authorized', 'captured', 'settled', 'failed', 'declined', 'timeout', 'expired', 'voided', 'partially_refunded', 'refunded', 'chargeback')),
	CONSTRAINT "payment_attempts_amount_check" CHECK ("payment_attempts"."amount_minor" >= 0 and "payment_attempts"."amount_minor" <= 9007199254740991),
	CONSTRAINT "payment_attempts_currency_check" CHECK ("payment_attempts"."currency" in ('RUB')),
	CONSTRAINT "payment_attempts_provider_payment_id_length_check" CHECK ("payment_attempts"."provider_payment_id" is null or length(trim("payment_attempts"."provider_payment_id")) between 1 and 160),
	CONSTRAINT "payment_attempts_provider_checkout_id_length_check" CHECK ("payment_attempts"."provider_checkout_id" is null or length(trim("payment_attempts"."provider_checkout_id")) between 1 and 160),
	CONSTRAINT "payment_attempts_idempotency_key_length_check" CHECK (length(trim("payment_attempts"."idempotency_key")) between 1 and 160),
	CONSTRAINT "payment_attempts_metadata_check" CHECK (jsonb_typeof("payment_attempts"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "payment_provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_attempt_id" uuid,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"provider_webhook_id" text NOT NULL,
	"provider_payment_id" text,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "payment_provider_events_provider_check" CHECK ("payment_provider_events"."provider" in ('arc_pay')),
	CONSTRAINT "payment_provider_events_environment_check" CHECK ("payment_provider_events"."environment" in ('sandbox', 'live')),
	CONSTRAINT "payment_provider_events_type_check" CHECK ("payment_provider_events"."type" in ('payment.created', 'payment.checkout_opened', 'payment.pending', 'payment.pending_3ds', 'payment.authorized', 'payment.processing', 'payment.captured', 'payment.settled', 'payment.failed', 'payment.declined', 'payment.timeout', 'payment.expired', 'payment.voided', 'payment.refunded', 'payment.partially_refunded', 'payment.chargeback', 'settlement.cleared', 'reconciliation.exception')),
	CONSTRAINT "payment_provider_events_webhook_id_length_check" CHECK (length(trim("payment_provider_events"."provider_webhook_id")) between 1 and 160),
	CONSTRAINT "payment_provider_events_payment_id_length_check" CHECK ("payment_provider_events"."provider_payment_id" is null or length(trim("payment_provider_events"."provider_payment_id")) between 1 and 160),
	CONSTRAINT "payment_provider_events_payload_check" CHECK (jsonb_typeof("payment_provider_events"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_attempt_id" uuid NOT NULL,
	"provider_event_id" uuid,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"reason" text,
	"provider_refund_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_status_check" CHECK ("refunds"."status" in ('requested', 'processing', 'succeeded', 'failed')),
	CONSTRAINT "refunds_provider_check" CHECK ("refunds"."provider" in ('arc_pay')),
	CONSTRAINT "refunds_environment_check" CHECK ("refunds"."environment" in ('sandbox', 'live')),
	CONSTRAINT "refunds_amount_check" CHECK ("refunds"."amount_minor" > 0 and "refunds"."amount_minor" <= 9007199254740991),
	CONSTRAINT "refunds_currency_check" CHECK ("refunds"."currency" in ('RUB')),
	CONSTRAINT "refunds_provider_refund_id_length_check" CHECK ("refunds"."provider_refund_id" is null or length(trim("refunds"."provider_refund_id")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "payment_reversal_case_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" uuid NOT NULL,
	"resolution" text NOT NULL,
	"admin_user_id" uuid,
	"admin_note" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_reversal_case_reviews_resolution_check" CHECK ("payment_reversal_case_reviews"."resolution" in ('ledger_verified', 'provider_follow_up_required', 'evidence_sent')),
	CONSTRAINT "payment_reversal_case_reviews_admin_note_check" CHECK (length(trim("payment_reversal_case_reviews"."admin_note")) between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "payout_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"display_name" text NOT NULL,
	"manual_bank_transfer_details" jsonb,
	"provider" text,
	"environment" text,
	"provider_payout_account_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_methods_method_check" CHECK ("payout_methods"."method" in ('manual_bank_transfer', 'arc_pay_provider')),
	CONSTRAINT "payout_methods_currency_check" CHECK ("payout_methods"."currency" in ('RUB')),
	CONSTRAINT "payout_methods_provider_check" CHECK ("payout_methods"."provider" is null or "payout_methods"."provider" in ('arc_pay')),
	CONSTRAINT "payout_methods_environment_check" CHECK ("payout_methods"."environment" is null or "payout_methods"."environment" in ('sandbox', 'live')),
	CONSTRAINT "payout_methods_display_name_check" CHECK (length(trim("payout_methods"."display_name")) between 1 and 160),
	CONSTRAINT "payout_methods_method_provider_shape_check" CHECK (("payout_methods"."method" = 'manual_bank_transfer' and "payout_methods"."provider" is null and "payout_methods"."environment" is null and "payout_methods"."provider_payout_account_id" is null and "payout_methods"."manual_bank_transfer_details" is not null and jsonb_typeof("payout_methods"."manual_bank_transfer_details") = 'object') or ("payout_methods"."method" = 'arc_pay_provider' and "payout_methods"."provider" is not null and "payout_methods"."provider" = 'arc_pay' and "payout_methods"."environment" is not null and "payout_methods"."provider_payout_account_id" is not null and length(trim("payout_methods"."provider_payout_account_id")) between 1 and 160 and "payout_methods"."manual_bank_transfer_details" is null))
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"astrologer_user_id" uuid NOT NULL,
	"payout_method_id" uuid NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"provider" text,
	"environment" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"admin_user_id" uuid,
	"admin_note" text,
	"failure_reason" text,
	"external_reference" text,
	"transferred_at" timestamp with time zone,
	"provider_payout_id" text,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_requests_status_check" CHECK ("payout_requests"."status" in ('requested', 'under_review', 'approved', 'processing_manual', 'processing_provider', 'paid', 'failed', 'rejected', 'cancelled')),
	CONSTRAINT "payout_requests_method_check" CHECK ("payout_requests"."method" in ('manual_bank_transfer', 'arc_pay_provider')),
	CONSTRAINT "payout_requests_amount_check" CHECK ("payout_requests"."amount_minor" > 0 and "payout_requests"."amount_minor" <= 9007199254740991),
	CONSTRAINT "payout_requests_currency_check" CHECK ("payout_requests"."currency" in ('RUB')),
	CONSTRAINT "payout_requests_provider_check" CHECK ("payout_requests"."provider" is null or "payout_requests"."provider" in ('arc_pay')),
	CONSTRAINT "payout_requests_environment_check" CHECK ("payout_requests"."environment" is null or "payout_requests"."environment" in ('sandbox', 'live')),
	CONSTRAINT "payout_requests_method_provider_shape_check" CHECK (("payout_requests"."method" = 'manual_bank_transfer' and "payout_requests"."provider" is null and "payout_requests"."environment" is null and "payout_requests"."provider_payout_id" is null) or ("payout_requests"."method" = 'arc_pay_provider' and "payout_requests"."provider" is not null and "payout_requests"."provider" = 'arc_pay' and "payout_requests"."environment" is not null)),
	CONSTRAINT "payout_requests_paid_evidence_check" CHECK ("payout_requests"."status" <> 'paid' or ("payout_requests"."external_reference" is not null and "payout_requests"."transferred_at" is not null)),
	CONSTRAINT "payout_requests_failure_reason_check" CHECK ("payout_requests"."status" not in ('failed', 'rejected') or ("payout_requests"."failure_reason" is not null and length(trim("payout_requests"."failure_reason")) between 1 and 2000)),
	CONSTRAINT "payout_requests_admin_note_length_check" CHECK ("payout_requests"."admin_note" is null or length(trim("payout_requests"."admin_note")) between 1 and 2000),
	CONSTRAINT "payout_requests_external_reference_length_check" CHECK ("payout_requests"."external_reference" is null or length(trim("payout_requests"."external_reference")) between 1 and 240),
	CONSTRAINT "payout_requests_provider_payout_id_length_check" CHECK ("payout_requests"."provider_payout_id" is null or length(trim("payout_requests"."provider_payout_id")) between 1 and 160),
	CONSTRAINT "payout_requests_metadata_check" CHECK (jsonb_typeof("payout_requests"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_type" text NOT NULL,
	"astrologer_user_id" uuid,
	"balance_bucket" text,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_account_type_check" CHECK ("ledger_accounts"."account_type" in ('platform_clearing', 'platform_revenue', 'provider_fees', 'astrologer_pending', 'astrologer_available', 'astrologer_reserved', 'astrologer_payout_pending', 'astrologer_negative_balance', 'payout_clearing')),
	CONSTRAINT "ledger_accounts_balance_bucket_check" CHECK ("ledger_accounts"."balance_bucket" is null or "ledger_accounts"."balance_bucket" in ('pending', 'available', 'reserved', 'payout_pending', 'negative_balance')),
	CONSTRAINT "ledger_accounts_currency_check" CHECK ("ledger_accounts"."currency" in ('RUB')),
	CONSTRAINT "ledger_accounts_astrologer_shape_check" CHECK (("ledger_accounts"."account_type" in ('platform_clearing', 'platform_revenue', 'provider_fees', 'payout_clearing') and "ledger_accounts"."astrologer_user_id" is null and "ledger_accounts"."balance_bucket" is null) or ("ledger_accounts"."account_type" = 'astrologer_pending' and "ledger_accounts"."astrologer_user_id" is not null and "ledger_accounts"."balance_bucket" = 'pending') or ("ledger_accounts"."account_type" = 'astrologer_available' and "ledger_accounts"."astrologer_user_id" is not null and "ledger_accounts"."balance_bucket" = 'available') or ("ledger_accounts"."account_type" = 'astrologer_reserved' and "ledger_accounts"."astrologer_user_id" is not null and "ledger_accounts"."balance_bucket" = 'reserved') or ("ledger_accounts"."account_type" = 'astrologer_payout_pending' and "ledger_accounts"."astrologer_user_id" is not null and "ledger_accounts"."balance_bucket" = 'payout_pending') or ("ledger_accounts"."account_type" = 'astrologer_negative_balance' and "ledger_accounts"."astrologer_user_id" is not null and "ledger_accounts"."balance_bucket" = 'negative_balance'))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"entry_side" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_side_check" CHECK ("ledger_entries"."entry_side" in ('debit', 'credit')),
	CONSTRAINT "ledger_entries_amount_check" CHECK ("ledger_entries"."amount_minor" > 0 and "ledger_entries"."amount_minor" <= 9007199254740991),
	CONSTRAINT "ledger_entries_currency_check" CHECK ("ledger_entries"."currency" in ('RUB')),
	CONSTRAINT "ledger_entries_metadata_check" CHECK (jsonb_typeof("ledger_entries"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_type" text NOT NULL,
	"order_id" uuid,
	"payout_request_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "ledger_transactions_operation_type_check" CHECK ("ledger_transactions"."operation_type" in ('sale_captured', 'platform_fee_recorded', 'provider_fee_recorded', 'hold_created', 'funds_released', 'reserve_created', 'reserve_released', 'payout_reserved', 'payout_paid', 'payout_failed', 'refund_recorded', 'chargeback_recorded', 'manual_adjustment')),
	CONSTRAINT "ledger_transactions_source_check" CHECK ("ledger_transactions"."order_id" is not null or "ledger_transactions"."payout_request_id" is not null or "ledger_transactions"."operation_type" = 'manual_adjustment'),
	CONSTRAINT "ledger_transactions_metadata_check" CHECK (jsonb_typeof("ledger_transactions"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "wallet_balance_read_models" (
	"astrologer_user_id" uuid PRIMARY KEY NOT NULL,
	"pending_amount_minor" bigint DEFAULT 0 NOT NULL,
	"pending_currency" text DEFAULT 'RUB' NOT NULL,
	"available_amount_minor" bigint DEFAULT 0 NOT NULL,
	"available_currency" text DEFAULT 'RUB' NOT NULL,
	"reserved_amount_minor" bigint DEFAULT 0 NOT NULL,
	"reserved_currency" text DEFAULT 'RUB' NOT NULL,
	"payout_pending_amount_minor" bigint DEFAULT 0 NOT NULL,
	"payout_pending_currency" text DEFAULT 'RUB' NOT NULL,
	"negative_balance_amount_minor" bigint DEFAULT 0 NOT NULL,
	"negative_balance_currency" text DEFAULT 'RUB' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_balance_read_models_amount_check" CHECK ("wallet_balance_read_models"."pending_amount_minor" >= 0 and "wallet_balance_read_models"."pending_amount_minor" <= 9007199254740991 and "wallet_balance_read_models"."available_amount_minor" >= 0 and "wallet_balance_read_models"."available_amount_minor" <= 9007199254740991 and "wallet_balance_read_models"."reserved_amount_minor" >= 0 and "wallet_balance_read_models"."reserved_amount_minor" <= 9007199254740991 and "wallet_balance_read_models"."payout_pending_amount_minor" >= 0 and "wallet_balance_read_models"."payout_pending_amount_minor" <= 9007199254740991 and "wallet_balance_read_models"."negative_balance_amount_minor" >= 0 and "wallet_balance_read_models"."negative_balance_amount_minor" <= 9007199254740991),
	CONSTRAINT "wallet_balance_read_models_currency_check" CHECK ("wallet_balance_read_models"."pending_currency" = 'RUB' and "wallet_balance_read_models"."available_currency" = 'RUB' and "wallet_balance_read_models"."reserved_currency" = 'RUB' and "wallet_balance_read_models"."payout_pending_currency" = 'RUB' and "wallet_balance_read_models"."negative_balance_currency" = 'RUB')
);
--> statement-breakpoint
CREATE TABLE "reconciliation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"provider_payment_id" text,
	"provider_payout_id" text,
	"provider_settlement_id" text,
	"provider_event_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"exception_code" text,
	"exception_message" text,
	"provider_occurred_at" timestamp with time zone,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	CONSTRAINT "reconciliation_records_provider_check" CHECK ("reconciliation_records"."provider" in ('arc_pay')),
	CONSTRAINT "reconciliation_records_environment_check" CHECK ("reconciliation_records"."environment" in ('sandbox', 'live')),
	CONSTRAINT "reconciliation_records_status_check" CHECK ("reconciliation_records"."status" in ('pending', 'matched', 'exception', 'ignored')),
	CONSTRAINT "reconciliation_records_provider_identifier_check" CHECK ("reconciliation_records"."provider_payment_id" is not null or "reconciliation_records"."provider_payout_id" is not null or "reconciliation_records"."provider_settlement_id" is not null),
	CONSTRAINT "reconciliation_records_exception_check" CHECK ("reconciliation_records"."status" <> 'exception' or ("reconciliation_records"."exception_code" is not null and length(trim("reconciliation_records"."exception_code")) between 1 and 120 and "reconciliation_records"."exception_message" is not null and length(trim("reconciliation_records"."exception_message")) between 1 and 2000)),
	CONSTRAINT "reconciliation_records_payload_check" CHECK (jsonb_typeof("reconciliation_records"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "finance_idempotency_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"actor_user_id" uuid,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"result" jsonb,
	"error_code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_idempotency_commands_scope_length_check" CHECK (length(trim("finance_idempotency_commands"."scope")) between 1 and 150),
	CONSTRAINT "finance_idempotency_commands_key_length_check" CHECK (length(trim("finance_idempotency_commands"."idempotency_key")) between 1 and 160),
	CONSTRAINT "finance_idempotency_commands_request_hash_check" CHECK ("finance_idempotency_commands"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "finance_idempotency_commands_state_check" CHECK ("finance_idempotency_commands"."state" in ('processing', 'completed', 'failed')),
	CONSTRAINT "finance_idempotency_commands_result_state_check" CHECK (("finance_idempotency_commands"."state" = 'processing' and "finance_idempotency_commands"."result" is null and "finance_idempotency_commands"."error_code" is null) or ("finance_idempotency_commands"."state" = 'completed' and "finance_idempotency_commands"."result" is not null and jsonb_typeof("finance_idempotency_commands"."result") = 'object' and "finance_idempotency_commands"."error_code" is null) or ("finance_idempotency_commands"."state" = 'failed' and "finance_idempotency_commands"."result" is null and "finance_idempotency_commands"."error_code" is not null and length(trim("finance_idempotency_commands"."error_code")) between 1 and 120))
);
--> statement-breakpoint
CREATE TABLE "audit_log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_log_entries_action_check" CHECK (length(trim("audit_log_entries"."action")) between 1 and 160),
	CONSTRAINT "audit_log_entries_target_type_check" CHECK (length(trim("audit_log_entries"."target_type")) between 1 and 120),
	CONSTRAINT "audit_log_entries_target_id_check" CHECK (length(trim("audit_log_entries"."target_id")) between 1 and 200),
	CONSTRAINT "audit_log_entries_metadata_check" CHECK (jsonb_typeof("audit_log_entries"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenge_deliveries" ADD CONSTRAINT "auth_challenge_deliveries_challenge_id_auth_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."auth_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenge_delivery_attempts" ADD CONSTRAINT "auth_challenge_delivery_attempts_delivery_id_auth_challenge_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."auth_challenge_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_platform_entries" ADD CONSTRAINT "dictionary_platform_entries_category_id_dictionary_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dictionary_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_astrologer_entries" ADD CONSTRAINT "dictionary_astrologer_entries_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_astrologer_entries" ADD CONSTRAINT "dictionary_astrologer_entries_category_id_dictionary_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dictionary_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_astrologer_entries" ADD CONSTRAINT "dictionary_astrologer_entries_platform_entry_identity_fk" FOREIGN KEY ("platform_entry_id","category_id","code","locale") REFERENCES "public"."dictionary_platform_entries"("id","category_id","code","locale") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_delivery_formats" ADD CONSTRAINT "product_delivery_formats_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_required_client_data" ADD CONSTRAINT "product_required_client_data_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_methods" ADD CONSTRAINT "product_methods_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_access_grants" ADD CONSTRAINT "product_access_grants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_included_items" ADD CONSTRAINT "product_included_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifiers" ADD CONSTRAINT "product_modifiers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_plan_id_platform_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payment_methods" ADD CONSTRAINT "billing_payment_methods_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_plan_features" ADD CONSTRAINT "platform_plan_features_plan_id_platform_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_plan_id_platform_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astrologer_profiles" ADD CONSTRAINT "astrologer_profiles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astrologer_profiles" ADD CONSTRAINT "astrologer_profiles_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astrologer_profiles" ADD CONSTRAINT "astrologer_profiles_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_applications" ADD CONSTRAINT "verification_applications_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_applications" ADD CONSTRAINT "verification_applications_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_application_documents" ADD CONSTRAINT "verification_application_documents_application_id_verification_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."verification_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_application_documents" ADD CONSTRAINT "verification_application_documents_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_records" ADD CONSTRAINT "calculation_records_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_participants" ADD CONSTRAINT "calculation_participants_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_client_links" ADD CONSTRAINT "calculation_client_links_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_interpretations" ADD CONSTRAINT "calculation_interpretations_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_artifacts" ADD CONSTRAINT "calculation_artifacts_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_artifacts" ADD CONSTRAINT "calculation_artifacts_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_pdf_jobs" ADD CONSTRAINT "calculation_pdf_jobs_calculation_owner_fk" FOREIGN KEY ("calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_pdf_jobs" ADD CONSTRAINT "calculation_pdf_jobs_artifact_id_fk" FOREIGN KEY ("artifact_id","calculation_id") REFERENCES "public"."calculation_artifacts"("id","calculation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_pdf_jobs" ADD CONSTRAINT "calculation_pdf_jobs_media_asset_id_fk" FOREIGN KEY ("media_asset_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_calculation_jobs" ADD CONSTRAINT "chart_calculation_jobs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_calculation_jobs" ADD CONSTRAINT "chart_calculation_jobs_client_id_client_profiles_user_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_calculation_jobs" ADD CONSTRAINT "chart_calculation_jobs_result_calculation_id_calculation_records_id_fk" FOREIGN KEY ("result_calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_calendar_generations" ADD CONSTRAINT "astro_calendar_generations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_calendar_events" ADD CONSTRAINT "astro_calendar_events_generation_id_astro_calendar_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."astro_calendar_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_calendar_events" ADD CONSTRAINT "astro_calendar_events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_birth_data" ADD CONSTRAINT "client_birth_data_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_astrologer_relationships" ADD CONSTRAINT "client_astrologer_relationships_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_astrologer_relationships" ADD CONSTRAINT "client_astrologer_relationships_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_join_intents" ADD CONSTRAINT "client_join_intents_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_join_intents" ADD CONSTRAINT "client_join_intents_claimed_by_client_user_id_users_id_fk" FOREIGN KEY ("claimed_by_client_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_notes" ADD CONSTRAINT "matrix_notes_calculation_owner_fk" FOREIGN KEY ("calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_report_drafts" ADD CONSTRAINT "matrix_report_drafts_calculation_owner_fk" FOREIGN KEY ("calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_date_overrides" ADD CONSTRAINT "availability_date_overrides_schedule_owner_fk" FOREIGN KEY ("schedule_id","owner_user_id") REFERENCES "public"."availability_schedules"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_override_periods" ADD CONSTRAINT "availability_override_periods_override_schedule_owner_fk" FOREIGN KEY ("override_id","schedule_id","owner_user_id") REFERENCES "public"."availability_date_overrides"("id","schedule_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_product_assignments" ADD CONSTRAINT "availability_product_assignments_schedule_owner_fk" FOREIGN KEY ("schedule_id","owner_user_id") REFERENCES "public"."availability_schedules"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_product_assignments" ADD CONSTRAINT "availability_product_assignments_product_owner_fk" FOREIGN KEY ("product_id","owner_user_id") REFERENCES "public"."products"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_schedules" ADD CONSTRAINT "availability_schedules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_weekly_periods" ADD CONSTRAINT "availability_weekly_periods_schedule_owner_fk" FOREIGN KEY ("schedule_id","owner_user_id") REFERENCES "public"."availability_schedules"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_reservation_owner_fk" FOREIGN KEY ("reservation_id","owner_user_id") REFERENCES "public"."schedule_reservations"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_product_owner_fk" FOREIGN KEY ("product_id","owner_user_id") REFERENCES "public"."products"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_calendar_blocks" ADD CONSTRAINT "manual_calendar_blocks_reservation_owner_fk" FOREIGN KEY ("reservation_id","owner_user_id") REFERENCES "public"."schedule_reservations"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_reservations" ADD CONSTRAINT "schedule_reservations_schedule_owner_fk" FOREIGN KEY ("schedule_id","owner_user_id") REFERENCES "public"."availability_schedules"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_commands" ADD CONSTRAINT "idempotency_commands_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_channel_connections" ADD CONSTRAINT "messaging_channel_connections_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_external_identities" ADD CONSTRAINT "messaging_external_identities_linked_client_user_id_users_id_fk" FOREIGN KEY ("linked_client_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_external_identities" ADD CONSTRAINT "messaging_external_identities_connection_provider_fk" FOREIGN KEY ("channel_connection_id","provider") REFERENCES "public"."messaging_channel_connections"("id","provider") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_identities" ADD CONSTRAINT "messaging_thread_identities_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_thread_identities" ADD CONSTRAINT "messaging_thread_identities_external_identity_provider_fk" FOREIGN KEY ("external_identity_id","provider") REFERENCES "public"."messaging_external_identities"("id","provider") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_messaging_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."messaging_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_connection_id_messaging_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."messaging_channel_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_external_identity_id_messaging_external_identities_id_fk" FOREIGN KEY ("external_identity_id") REFERENCES "public"."messaging_external_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_media_ingestions" ADD CONSTRAINT "message_media_ingestions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_media_ingestions" ADD CONSTRAINT "message_media_ingestions_channel_connection_id_messaging_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."messaging_channel_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_media_ingestions" ADD CONSTRAINT "message_media_ingestions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_delivery_attempts" ADD CONSTRAINT "message_delivery_attempts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_instagram_graph_accounts" ADD CONSTRAINT "messaging_instagram_graph_accounts_channel_connection_id_messaging_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."messaging_channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_telegram_mtproto_sessions" ADD CONSTRAINT "messaging_telegram_mtproto_sessions_channel_connection_id_messaging_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."messaging_channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_realtime_events" ADD CONSTRAINT "messaging_realtime_events_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astrologer_risk_profiles" ADD CONSTRAINT "astrologer_risk_profiles_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astrologer_risk_profiles" ADD CONSTRAINT "astrologer_risk_profiles_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_policies" ADD CONSTRAINT "finance_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_direct_link_intent_id_client_join_intents_id_fk" FOREIGN KEY ("direct_link_intent_id") REFERENCES "public"."client_join_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_finance_policy_snapshot_id_finance_policies_id_fk" FOREIGN KEY ("finance_policy_snapshot_id") REFERENCES "public"."finance_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_provider_event_id_payment_provider_events_id_fk" FOREIGN KEY ("provider_event_id") REFERENCES "public"."payment_provider_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversal_case_reviews" ADD CONSTRAINT "payment_reversal_case_reviews_provider_event_id_payment_provider_events_id_fk" FOREIGN KEY ("provider_event_id") REFERENCES "public"."payment_provider_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversal_case_reviews" ADD CONSTRAINT "payment_reversal_case_reviews_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_payout_method_id_payout_methods_id_fk" FOREIGN KEY ("payout_method_id") REFERENCES "public"."payout_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_payout_request_id_payout_requests_id_fk" FOREIGN KEY ("payout_request_id") REFERENCES "public"."payout_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_balance_read_models" ADD CONSTRAINT "wallet_balance_read_models_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_provider_event_id_payment_provider_events_id_fk" FOREIGN KEY ("provider_event_id") REFERENCES "public"."payment_provider_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_idempotency_commands" ADD CONSTRAINT "finance_idempotency_commands_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_unique" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_email_login_unique" ON "auth_identities" USING btree (lower("email")) WHERE "auth_identities"."provider" = 'email' and "auth_identities"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_phone_login_unique" ON "auth_identities" USING btree ("phone_number") WHERE "auth_identities"."provider" = 'phone' and "auth_identities"."phone_number" is not null;--> statement-breakpoint
CREATE INDEX "auth_identities_user_id_index" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_identities_email_index" ON "auth_identities" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_identities_phone_number_index" ON "auth_identities" USING btree ("phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_assignments_user_role_unique" ON "user_role_assignments" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "user_role_assignments_role_index" ON "user_role_assignments" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_hash_unique" ON "user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_index" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_active_user_index" ON "user_sessions" USING btree ("user_id") WHERE "user_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "user_sessions_expires_at_index" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_challenges_pending_identifier_unique" ON "auth_challenges" USING btree ("channel","identifier_normalized") WHERE "auth_challenges"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_at_index" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_challenges_created_at_index" ON "auth_challenges" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_challenge_deliveries_challenge_id_index" ON "auth_challenge_deliveries" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "auth_challenge_deliveries_status_created_at_index" ON "auth_challenge_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "auth_challenge_deliveries_created_at_index" ON "auth_challenge_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_challenge_delivery_attempts_delivery_id_index" ON "auth_challenge_delivery_attempts" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "auth_challenge_delivery_attempts_delivery_attempt_index" ON "auth_challenge_delivery_attempts" USING btree ("delivery_id","attempt_number","attempted_at");--> statement-breakpoint
CREATE INDEX "auth_challenge_delivery_attempts_attempted_at_index" ON "auth_challenge_delivery_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "auth_security_events_user_id_index" ON "auth_security_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_security_events_session_id_index" ON "auth_security_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "auth_security_events_event_type_index" ON "auth_security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "auth_security_events_occurred_at_index" ON "auth_security_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_type_aggregate_id_unique" ON "outbox_events" USING btree ("event_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_index" ON "outbox_events" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_locked_at_index" ON "outbox_events" USING btree ("locked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_categories_code_unique" ON "dictionary_categories" USING btree ("code");--> statement-breakpoint
CREATE INDEX "dictionary_platform_entries_locale_status_category_index" ON "dictionary_platform_entries" USING btree ("locale","status","category_id");--> statement-breakpoint
CREATE INDEX "dictionary_astrologer_entries_custom_owner_locale_category_index" ON "dictionary_astrologer_entries" USING btree ("owner_user_id","locale","category_id") WHERE "dictionary_astrologer_entries"."entry_type" = 'custom';--> statement-breakpoint
CREATE INDEX "dictionary_astrologer_entries_platform_entry_id_index" ON "dictionary_astrologer_entries" USING btree ("platform_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_astrologer_entries_override_unique" ON "dictionary_astrologer_entries" USING btree ("owner_user_id","platform_entry_id","locale") WHERE "dictionary_astrologer_entries"."entry_type" = 'override';--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_astrologer_entries_custom_code_unique" ON "dictionary_astrologer_entries" USING btree ("owner_user_id","category_id","code","locale") WHERE "dictionary_astrologer_entries"."entry_type" = 'custom';--> statement-breakpoint
CREATE INDEX "products_owner_created_id_idx" ON "products" USING btree ("owner_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "products_owner_status_created_id_idx" ON "products" USING btree ("owner_user_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "product_delivery_formats_product_id_idx" ON "product_delivery_formats" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_delivery_formats_product_value_unique" ON "product_delivery_formats" USING btree ("product_id","value");--> statement-breakpoint
CREATE INDEX "product_required_client_data_product_id_idx" ON "product_required_client_data" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_required_client_data_product_value_unique" ON "product_required_client_data" USING btree ("product_id","value");--> statement-breakpoint
CREATE INDEX "product_methods_product_id_idx" ON "product_methods" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_methods_product_value_unique" ON "product_methods" USING btree ("product_id","value");--> statement-breakpoint
CREATE INDEX "product_access_grants_product_id_idx" ON "product_access_grants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_access_grants_product_value_unique" ON "product_access_grants" USING btree ("product_id","value");--> statement-breakpoint
CREATE INDEX "product_included_items_product_id_idx" ON "product_included_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_modifiers_product_id_idx" ON "product_modifiers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_templates_active_locale_order_idx" ON "product_templates" USING btree ("locale","sort_order","code") WHERE "product_templates"."status" = 'active';--> statement-breakpoint
CREATE INDEX "billing_invoices_owner_issued_idx" ON "billing_invoices" USING btree ("owner_user_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_provider_invoice_unique" ON "billing_invoices" USING btree ("provider","provider_invoice_id");--> statement-breakpoint
CREATE INDEX "billing_payment_methods_owner_created_idx" ON "billing_payment_methods" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payment_methods_provider_method_unique" ON "billing_payment_methods" USING btree ("provider","provider_payment_method_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payment_methods_default_owner_unique" ON "billing_payment_methods" USING btree ("owner_user_id") WHERE "billing_payment_methods"."is_default" = true;--> statement-breakpoint
CREATE INDEX "platform_plan_features_plan_id_idx" ON "platform_plan_features" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_plan_features_plan_value_unique" ON "platform_plan_features" USING btree ("plan_id","value");--> statement-breakpoint
CREATE INDEX "platform_subscriptions_owner_created_idx" ON "platform_subscriptions" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_current_owner_unique" ON "platform_subscriptions" USING btree ("owner_user_id") WHERE "platform_subscriptions"."is_current" = true;--> statement-breakpoint
CREATE INDEX "media_assets_owner_purpose_status_created_idx" ON "media_assets" USING btree ("owner_user_id","purpose","status","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_owner_created_id_idx" ON "media_assets" USING btree ("owner_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "media_variants_asset_id_idx" ON "media_variants" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "astrologer_profiles_public_handle_idx" ON "astrologer_profiles" USING btree ("public_handle");--> statement-breakpoint
CREATE INDEX "verification_applications_owner_submitted_idx" ON "verification_applications" USING btree ("owner_user_id","submitted_at","id");--> statement-breakpoint
CREATE INDEX "verification_applications_status_submitted_idx" ON "verification_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "verification_application_documents_application_idx" ON "verification_application_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "verification_application_documents_media_idx" ON "verification_application_documents" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_application_documents_application_media_unique" ON "verification_application_documents" USING btree ("application_id","media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_records_exact_request_unique" ON "calculation_records" USING btree ("owner_user_id","module","mode","method_code","request_fingerprint");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_updated_id_idx" ON "calculation_records" USING btree ("owner_user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_status_updated_id_idx" ON "calculation_records" USING btree ("owner_user_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_module_created_id_idx" ON "calculation_records" USING btree ("owner_user_id","module","created_at","id");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_status_module_created_id_idx" ON "calculation_records" USING btree ("owner_user_id","status","module","created_at","id");--> statement-breakpoint
CREATE INDEX "calculation_participants_record_role_idx" ON "calculation_participants" USING btree ("calculation_id","role");--> statement-breakpoint
CREATE INDEX "calculation_participants_record_order_idx" ON "calculation_participants" USING btree ("calculation_id","order");--> statement-breakpoint
CREATE INDEX "calculation_client_links_record_idx" ON "calculation_client_links" USING btree ("calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_client_links_client_idx" ON "calculation_client_links" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_client_links_record_client_unique" ON "calculation_client_links" USING btree ("calculation_id","client_id");--> statement-breakpoint
CREATE INDEX "calculation_interpretations_record_idx" ON "calculation_interpretations" USING btree ("calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_artifacts_record_idx" ON "calculation_artifacts" USING btree ("calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_artifacts_media_idx" ON "calculation_artifacts" USING btree ("media_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_pdf_jobs_idempotency_unique" ON "calculation_pdf_jobs" USING btree ("owner_user_id","calculation_id","result_checksum","locale","document_fingerprint") WHERE "calculation_pdf_jobs"."status" <> 'failed';--> statement-breakpoint
CREATE INDEX "calculation_pdf_jobs_owner_calculation_locale_created_idx" ON "calculation_pdf_jobs" USING btree ("owner_user_id","calculation_id","locale","created_at","id");--> statement-breakpoint
CREATE INDEX "calculation_pdf_jobs_status_updated_idx" ON "calculation_pdf_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "chart_calculation_jobs_owner_idx" ON "chart_calculation_jobs" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "chart_calculation_jobs_client_idx" ON "chart_calculation_jobs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "chart_calculation_jobs_status_updated_idx" ON "chart_calculation_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_calculation_jobs_active_fingerprint_unique" ON "chart_calculation_jobs" USING btree ("owner_user_id","input_fingerprint") WHERE "chart_calculation_jobs"."status" in ('queued', 'processing');--> statement-breakpoint
CREATE UNIQUE INDEX "chart_calculation_jobs_success_fingerprint_unique" ON "chart_calculation_jobs" USING btree ("owner_user_id","input_fingerprint") WHERE "chart_calculation_jobs"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "astro_calendar_generations_owner_range_idx" ON "astro_calendar_generations" USING btree ("owner_user_id","range_start","range_end");--> statement-breakpoint
CREATE INDEX "astro_calendar_generations_status_updated_idx" ON "astro_calendar_generations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "astro_calendar_generations_fingerprint_unique" ON "astro_calendar_generations" USING btree ("owner_user_id","input_fingerprint");--> statement-breakpoint
CREATE INDEX "astro_calendar_events_owner_starts_idx" ON "astro_calendar_events" USING btree ("owner_user_id","starts_at","id");--> statement-breakpoint
CREATE INDEX "astro_calendar_events_generation_starts_idx" ON "astro_calendar_events" USING btree ("generation_id","starts_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "astro_calendar_events_generation_event_unique" ON "astro_calendar_events" USING btree ("generation_id","event_id");--> statement-breakpoint
CREATE INDEX "flows_owner_status_updated_idx" ON "flows" USING btree ("owner_user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "flows_owner_name_idx" ON "flows" USING btree ("owner_user_id","name");--> statement-breakpoint
CREATE INDEX "flow_versions_owner_published_idx" ON "flow_versions" USING btree ("owner_user_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_versions_flow_version_unique" ON "flow_versions" USING btree ("flow_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "client_birth_data_primary_unique" ON "client_birth_data" USING btree ("client_user_id") WHERE "client_birth_data"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "client_birth_data_client_idx" ON "client_birth_data" USING btree ("client_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_astrologer_relationships_unique" ON "client_astrologer_relationships" USING btree ("client_user_id","astrologer_user_id");--> statement-breakpoint
CREATE INDEX "client_astrologer_relationships_astrologer_status_idx" ON "client_astrologer_relationships" USING btree ("astrologer_user_id","status");--> statement-breakpoint
CREATE INDEX "client_astrologer_relationships_client_status_idx" ON "client_astrologer_relationships" USING btree ("client_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "client_join_intents_token_hash_unique" ON "client_join_intents" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "client_join_intents_astrologer_status_idx" ON "client_join_intents" USING btree ("astrologer_user_id","status");--> statement-breakpoint
CREATE INDEX "client_join_intents_claimed_client_idx" ON "client_join_intents" USING btree ("claimed_by_client_user_id");--> statement-breakpoint
CREATE INDEX "matrix_notes_owner_calculation_created_id_idx" ON "matrix_notes" USING btree ("owner_user_id","calculation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "matrix_report_drafts_owner_calculation_idx" ON "matrix_report_drafts" USING btree ("owner_user_id","calculation_id");--> statement-breakpoint
CREATE INDEX "availability_date_overrides_schedule_date_idx" ON "availability_date_overrides" USING btree ("schedule_id","local_date");--> statement-breakpoint
CREATE INDEX "availability_override_periods_override_start_idx" ON "availability_override_periods" USING btree ("override_id","start_minute");--> statement-breakpoint
CREATE INDEX "availability_product_assignments_owner_product_idx" ON "availability_product_assignments" USING btree ("owner_user_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_schedules_default_owner_unique" ON "availability_schedules" USING btree ("owner_user_id") WHERE "availability_schedules"."is_default" = true;--> statement-breakpoint
CREATE INDEX "availability_schedules_owner_updated_idx" ON "availability_schedules" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "availability_weekly_periods_schedule_day_idx" ON "availability_weekly_periods" USING btree ("schedule_id","weekday","start_minute");--> statement-breakpoint
CREATE INDEX "bookings_owner_service_idx" ON "bookings" USING btree ("owner_user_id","service_start_at","id");--> statement-breakpoint
CREATE INDEX "bookings_owner_client_created_idx" ON "bookings" USING btree ("owner_user_id","client_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "manual_calendar_blocks_owner_state_updated_idx" ON "manual_calendar_blocks" USING btree ("owner_user_id","state","updated_at");--> statement-breakpoint
CREATE INDEX "schedule_reservations_owner_service_idx" ON "schedule_reservations" USING btree ("owner_user_id","service_start_at","service_end_at");--> statement-breakpoint
CREATE INDEX "schedule_reservations_owner_lifecycle_occupied_idx" ON "schedule_reservations" USING btree ("owner_user_id","lifecycle","occupied_start_at","occupied_end_at");--> statement-breakpoint
CREATE INDEX "schedule_reservations_hold_expiry_idx" ON "schedule_reservations" USING btree ("lifecycle","hold_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_commands_scope_key_unique" ON "idempotency_commands" USING btree ("api_surface","actor_user_id","command_scope","key");--> statement-breakpoint
CREATE INDEX "idempotency_commands_expiry_idx" ON "idempotency_commands" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_commands_actor_created_idx" ON "idempotency_commands" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "messaging_channel_connections_astrologer_provider_mode_status_idx" ON "messaging_channel_connections" USING btree ("astrologer_user_id","provider","mode","status");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_channel_connections_external_account_unique" ON "messaging_channel_connections" USING btree ("provider","external_account_id") WHERE "messaging_channel_connections"."external_account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_external_identities_connection_chat_unique" ON "messaging_external_identities" USING btree ("channel_connection_id","provider_chat_id");--> statement-breakpoint
CREATE INDEX "messaging_external_identities_linked_client_idx" ON "messaging_external_identities" USING btree ("linked_client_user_id");--> statement-breakpoint
CREATE INDEX "messaging_threads_astrologer_status_last_message_idx" ON "messaging_threads" USING btree ("astrologer_user_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "messaging_threads_astrologer_client_idx" ON "messaging_threads" USING btree ("astrologer_user_id","client_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_thread_identities_thread_identity_unique" ON "messaging_thread_identities" USING btree ("thread_id","external_identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_thread_identities_external_identity_unique" ON "messaging_thread_identities" USING btree ("external_identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_thread_identities_primary_thread_provider_unique" ON "messaging_thread_identities" USING btree ("thread_id","provider") WHERE "messaging_thread_identities"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_inbound_provider_dedupe_unique" ON "messages" USING btree ("channel_connection_id","external_identity_id","provider_message_id","direction") WHERE "messages"."provider_message_id" is not null and "messages"."external_identity_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_outbound_idempotency_unique" ON "messages" USING btree ("thread_id","idempotency_key") WHERE "messages"."direction" = 'outbound';--> statement-breakpoint
CREATE INDEX "messages_thread_created_idx" ON "messages" USING btree ("thread_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_media_ingestions_message_unique" ON "message_media_ingestions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_media_ingestions_status_retry_idx" ON "message_media_ingestions" USING btree ("download_status","next_retry_at","created_at");--> statement-breakpoint
CREATE INDEX "message_media_ingestions_message_idx" ON "message_media_ingestions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_delivery_attempts_message_attempt_unique" ON "message_delivery_attempts" USING btree ("message_id","attempt_number");--> statement-breakpoint
CREATE INDEX "messaging_telegram_mtproto_sessions_login_state_idx" ON "messaging_telegram_mtproto_sessions" USING btree ("login_state");--> statement-breakpoint
CREATE INDEX "messaging_telegram_mtproto_sessions_lease_idx" ON "messaging_telegram_mtproto_sessions" USING btree ("leased_until","login_state");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_realtime_events_event_id_unique" ON "messaging_realtime_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "messaging_realtime_events_astrologer_event_id_idx" ON "messaging_realtime_events" USING btree ("astrologer_user_id","event_id");--> statement-breakpoint
CREATE INDEX "astrologer_risk_profiles_risk_tier_idx" ON "astrologer_risk_profiles" USING btree ("risk_tier");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_policies_version_unique" ON "finance_policies" USING btree ("policy_version");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_policies_active_risk_tier_unique" ON "finance_policies" USING btree ("risk_tier") WHERE "finance_policies"."is_active" = true;--> statement-breakpoint
CREATE INDEX "finance_policies_risk_version_idx" ON "finance_policies" USING btree ("risk_tier","policy_version");--> statement-breakpoint
CREATE INDEX "orders_client_created_idx" ON "orders" USING btree ("client_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "orders_astrologer_created_idx" ON "orders" USING btree ("astrologer_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_booking_unique" ON "orders" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_payment_unique" ON "payment_attempts" USING btree ("provider","environment","provider_payment_id") WHERE "payment_attempts"."provider_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_attempts_order_created_idx" ON "payment_attempts" USING btree ("order_id","created_at","id");--> statement-breakpoint
CREATE INDEX "payment_attempts_provider_status_idx" ON "payment_attempts" USING btree ("provider","environment","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_events_webhook_unique" ON "payment_provider_events" USING btree ("provider","environment","provider_webhook_id");--> statement-breakpoint
CREATE INDEX "payment_provider_events_payment_idx" ON "payment_provider_events" USING btree ("provider","environment","provider_payment_id");--> statement-breakpoint
CREATE INDEX "payment_provider_events_received_idx" ON "payment_provider_events" USING btree ("received_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_refund_unique" ON "refunds" USING btree ("provider","environment","provider_refund_id") WHERE "refunds"."provider_refund_id" is not null;--> statement-breakpoint
CREATE INDEX "refunds_order_created_idx" ON "refunds" USING btree ("order_id","created_at","id");--> statement-breakpoint
CREATE INDEX "refunds_payment_attempt_idx" ON "refunds" USING btree ("payment_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reversal_case_reviews_provider_event_unique" ON "payment_reversal_case_reviews" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_reversal_case_reviews_reviewed_at_idx" ON "payment_reversal_case_reviews" USING btree ("reviewed_at");--> statement-breakpoint
CREATE INDEX "payment_reversal_case_reviews_admin_user_idx" ON "payment_reversal_case_reviews" USING btree ("admin_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_methods_default_astrologer_unique" ON "payout_methods" USING btree ("astrologer_user_id") WHERE "payout_methods"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_methods_provider_account_unique" ON "payout_methods" USING btree ("provider","environment","provider_payout_account_id") WHERE "payout_methods"."provider_payout_account_id" is not null;--> statement-breakpoint
CREATE INDEX "payout_methods_astrologer_created_idx" ON "payout_methods" USING btree ("astrologer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "payout_requests_astrologer_requested_idx" ON "payout_requests" USING btree ("astrologer_user_id","requested_at","id");--> statement-breakpoint
CREATE INDEX "payout_requests_status_requested_idx" ON "payout_requests" USING btree ("status","requested_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_requests_provider_payout_unique" ON "payout_requests" USING btree ("provider","environment","provider_payout_id") WHERE "payout_requests"."provider_payout_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_platform_unique" ON "ledger_accounts" USING btree ("account_type","currency") WHERE "ledger_accounts"."astrologer_user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_astrologer_unique" ON "ledger_accounts" USING btree ("astrologer_user_id","account_type","currency") WHERE "ledger_accounts"."astrologer_user_id" is not null;--> statement-breakpoint
CREATE INDEX "ledger_accounts_astrologer_bucket_idx" ON "ledger_accounts" USING btree ("astrologer_user_id","balance_bucket");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_account_side_idx" ON "ledger_entries" USING btree ("ledger_transaction_id","account_id","entry_side");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_created_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_transactions_order_idx" ON "ledger_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_payout_request_idx" ON "ledger_transactions" USING btree ("payout_request_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_posted_idx" ON "ledger_transactions" USING btree ("posted_at","id");--> statement-breakpoint
CREATE INDEX "reconciliation_records_provider_payment_idx" ON "reconciliation_records" USING btree ("provider","environment","provider_payment_id");--> statement-breakpoint
CREATE INDEX "reconciliation_records_provider_payout_idx" ON "reconciliation_records" USING btree ("provider","environment","provider_payout_id");--> statement-breakpoint
CREATE INDEX "reconciliation_records_status_checked_idx" ON "reconciliation_records" USING btree ("status","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_idempotency_commands_scope_key_unique" ON "finance_idempotency_commands" USING btree ("scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "finance_idempotency_commands_actor_created_idx" ON "finance_idempotency_commands" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "finance_idempotency_commands_expiry_idx" ON "finance_idempotency_commands" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "audit_log_entries_actor_user_id_index" ON "audit_log_entries" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_entries_action_index" ON "audit_log_entries" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_entries_target_index" ON "audit_log_entries" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_entries_occurred_at_index" ON "audit_log_entries" USING btree ("occurred_at");
--> statement-breakpoint
ALTER TABLE "schedule_reservations"
  ADD CONSTRAINT "schedule_reservations_active_owner_range_exclude"
  EXCLUDE USING gist (
    "owner_user_id" WITH =,
    tstzrange("occupied_start_at", "occupied_end_at", '[)') WITH &&
  ) WHERE ("lifecycle" = 'active');
