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
	"cover_media_id" text,
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
ALTER TABLE "product_delivery_formats" ADD CONSTRAINT "product_delivery_formats_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_required_client_data" ADD CONSTRAINT "product_required_client_data_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_methods" ADD CONSTRAINT "product_methods_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_access_grants" ADD CONSTRAINT "product_access_grants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_included_items" ADD CONSTRAINT "product_included_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_modifiers" ADD CONSTRAINT "product_modifiers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "products_owner_status_idx" ON "products" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "product_delivery_formats_product_id_idx" ON "product_delivery_formats" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_delivery_formats_product_value_unique" ON "product_delivery_formats" USING btree ("product_id","value");--> statement-breakpoint
CREATE INDEX "product_required_client_data_product_id_idx" ON "product_required_client_data" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_required_client_data_product_value_unique" ON "product_required_client_data" USING btree ("product_id","value");--> statement-breakpoint
CREATE INDEX "product_methods_product_id_idx" ON "product_methods" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_methods_product_value_unique" ON "product_methods" USING btree ("product_id","value");--> statement-breakpoint
CREATE INDEX "product_access_grants_product_id_idx" ON "product_access_grants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_access_grants_product_value_unique" ON "product_access_grants" USING btree ("product_id","value");--> statement-breakpoint
CREATE INDEX "product_included_items_product_id_idx" ON "product_included_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_modifiers_product_id_idx" ON "product_modifiers" USING btree ("product_id");