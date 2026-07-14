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
	CONSTRAINT "media_assets_purpose_check" CHECK ("media_assets"."purpose" in ('product_cover', 'profile_avatar', 'profile_cover', 'verification_identity_document', 'verification_qualification_document', 'matrix_report_pdf')),
	CONSTRAINT "media_assets_status_check" CHECK ("media_assets"."status" in ('uploading', 'processing', 'ready', 'failed', 'deleted')),
	CONSTRAINT "media_assets_visibility_check" CHECK ("media_assets"."visibility" in ('public', 'private')),
	CONSTRAINT "media_assets_mime_type_check" CHECK ("media_assets"."mime_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf')),
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
	"birth_latitude" double precision,
	"birth_longitude" double precision,
	"source" text DEFAULT 'client_profile' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_birth_data_time_precision_check" CHECK ("client_birth_data"."birth_time_precision" in ('exact', 'approximate', 'unknown')),
	CONSTRAINT "client_birth_data_source_check" CHECK ("client_birth_data"."source" in ('client_profile', 'booking', 'import', 'manual')),
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
CREATE TABLE "matrix_pdf_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"calculation_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"report_revision" integer NOT NULL,
	"result_checksum" text NOT NULL,
	"locale" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"artifact_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "matrix_pdf_jobs_idempotency_unique" UNIQUE("owner_user_id","calculation_id","report_id","report_revision","result_checksum","locale"),
	CONSTRAINT "matrix_pdf_jobs_report_revision_check" CHECK ("matrix_pdf_jobs"."report_revision" > 0),
	CONSTRAINT "matrix_pdf_jobs_result_checksum_check" CHECK ("matrix_pdf_jobs"."result_checksum" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "matrix_pdf_jobs_locale_check" CHECK ("matrix_pdf_jobs"."locale" in ('ru', 'en')),
	CONSTRAINT "matrix_pdf_jobs_status_check" CHECK ("matrix_pdf_jobs"."status" in ('queued', 'processing', 'ready', 'failed')),
	CONSTRAINT "matrix_pdf_jobs_failure_reason_check" CHECK ("matrix_pdf_jobs"."failure_reason" is null or length(trim("matrix_pdf_jobs"."failure_reason")) between 1 and 500)
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
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_birth_data" ADD CONSTRAINT "client_birth_data_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_astrologer_relationships" ADD CONSTRAINT "client_astrologer_relationships_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_astrologer_relationships" ADD CONSTRAINT "client_astrologer_relationships_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_join_intents" ADD CONSTRAINT "client_join_intents_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_join_intents" ADD CONSTRAINT "client_join_intents_claimed_by_client_user_id_users_id_fk" FOREIGN KEY ("claimed_by_client_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_notes" ADD CONSTRAINT "matrix_notes_calculation_owner_fk" FOREIGN KEY ("calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_pdf_jobs" ADD CONSTRAINT "matrix_pdf_jobs_calculation_owner_fk" FOREIGN KEY ("calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_pdf_jobs" ADD CONSTRAINT "matrix_pdf_jobs_report_id_fk" FOREIGN KEY ("report_id","calculation_id","owner_user_id") REFERENCES "public"."matrix_report_drafts"("id","calculation_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_pdf_jobs" ADD CONSTRAINT "matrix_pdf_jobs_artifact_id_fk" FOREIGN KEY ("artifact_id","calculation_id") REFERENCES "public"."calculation_artifacts"("id","calculation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_pdf_jobs" ADD CONSTRAINT "matrix_pdf_jobs_media_asset_id_fk" FOREIGN KEY ("media_asset_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_report_drafts" ADD CONSTRAINT "matrix_report_drafts_calculation_owner_fk" FOREIGN KEY ("calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE UNIQUE INDEX "client_birth_data_client_unique" ON "client_birth_data" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "client_birth_data_client_idx" ON "client_birth_data" USING btree ("client_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_astrologer_relationships_unique" ON "client_astrologer_relationships" USING btree ("client_user_id","astrologer_user_id");--> statement-breakpoint
CREATE INDEX "client_astrologer_relationships_astrologer_status_idx" ON "client_astrologer_relationships" USING btree ("astrologer_user_id","status");--> statement-breakpoint
CREATE INDEX "client_astrologer_relationships_client_status_idx" ON "client_astrologer_relationships" USING btree ("client_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "client_join_intents_token_hash_unique" ON "client_join_intents" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "client_join_intents_astrologer_status_idx" ON "client_join_intents" USING btree ("astrologer_user_id","status");--> statement-breakpoint
CREATE INDEX "client_join_intents_claimed_client_idx" ON "client_join_intents" USING btree ("claimed_by_client_user_id");--> statement-breakpoint
CREATE INDEX "matrix_notes_owner_calculation_created_id_idx" ON "matrix_notes" USING btree ("owner_user_id","calculation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "matrix_pdf_jobs_owner_calculation_created_idx" ON "matrix_pdf_jobs" USING btree ("owner_user_id","calculation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "matrix_pdf_jobs_status_updated_idx" ON "matrix_pdf_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "matrix_report_drafts_owner_calculation_idx" ON "matrix_report_drafts" USING btree ("owner_user_id","calculation_id");