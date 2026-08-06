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
CREATE TABLE "finance_authorization_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"action_kind" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"expected_version" bigint NOT NULL,
	"payload_hash" varchar(71) NOT NULL,
	"challenge" varchar(128) NOT NULL,
	"rp_id" varchar(253) NOT NULL,
	"origin" varchar(255) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "finance_authorization_challenges_action_check" CHECK ("finance_authorization_challenges"."action_kind" in ('tariff_publish', 'fiscal_policy_publish', 'risk_policy_publish', 'refund_execute', 'chargeback_principal_allocate', 'payout_destination_reveal', 'payout_destination_change', 'payout_approve', 'payout_start_processing', 'payout_confirm_paid', 'bank_snapshot_attest', 'bank_statement_match', 'ledger_correction')),
	CONSTRAINT "finance_authorization_challenges_binding_check" CHECK ("finance_authorization_challenges"."expected_version" between 0 and 9007199254740991 and "finance_authorization_challenges"."payload_hash" ~ '^sha256:[a-f0-9]{64}$' and length("finance_authorization_challenges"."challenge") = 43 and "finance_authorization_challenges"."challenge" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "finance_authorization_challenges_expiry_check" CHECK ("finance_authorization_challenges"."expires_at" > "finance_authorization_challenges"."issued_at" and "finance_authorization_challenges"."expires_at" <= "finance_authorization_challenges"."issued_at" + interval '300 seconds'),
	CONSTRAINT "finance_authorization_challenges_lifecycle_check" CHECK (("finance_authorization_challenges"."status" = 'active' and "finance_authorization_challenges"."consumed_at" is null) or ("finance_authorization_challenges"."status" = 'consumed' and "finance_authorization_challenges"."consumed_at" is not null and "finance_authorization_challenges"."consumed_at" >= "finance_authorization_challenges"."issued_at"))
);
--> statement-breakpoint
CREATE TABLE "finance_authorization_grants" (
	"authorization_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"action_kind" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"expected_version" bigint NOT NULL,
	"payload_hash" varchar(71) NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "finance_authorization_grants_action_check" CHECK ("finance_authorization_grants"."action_kind" in ('tariff_publish', 'fiscal_policy_publish', 'risk_policy_publish', 'refund_execute', 'chargeback_principal_allocate', 'payout_destination_reveal', 'payout_destination_change', 'payout_approve', 'payout_start_processing', 'payout_confirm_paid', 'bank_snapshot_attest', 'bank_statement_match', 'ledger_correction')),
	CONSTRAINT "finance_authorization_grants_binding_check" CHECK ("finance_authorization_grants"."expected_version" between 0 and 9007199254740991 and "finance_authorization_grants"."payload_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "finance_authorization_grants_expiry_check" CHECK ("finance_authorization_grants"."expires_at" > "finance_authorization_grants"."verified_at" and "finance_authorization_grants"."expires_at" <= "finance_authorization_grants"."verified_at" + interval '300 seconds'),
	CONSTRAINT "finance_authorization_grants_lifecycle_check" CHECK (("finance_authorization_grants"."status" = 'active' and "finance_authorization_grants"."consumed_at" is null) or ("finance_authorization_grants"."status" = 'consumed' and "finance_authorization_grants"."consumed_at" is not null and "finance_authorization_grants"."consumed_at" >= "finance_authorization_grants"."verified_at"))
);
--> statement-breakpoint
CREATE TABLE "finance_webauthn_credentials" (
	"credential_id" varchar(4096) PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"public_key" "bytea" NOT NULL,
	"transports" jsonb NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"signature_counter" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"quarantined_at" timestamp with time zone,
	CONSTRAINT "finance_webauthn_credentials_identifier_check" CHECK (length("finance_webauthn_credentials"."credential_id") between 1 and 4096 and "finance_webauthn_credentials"."credential_id" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "finance_webauthn_credentials_public_key_check" CHECK (octet_length("finance_webauthn_credentials"."public_key") > 0),
	CONSTRAINT "finance_webauthn_credentials_transport_check" CHECK (jsonb_typeof("finance_webauthn_credentials"."transports") = 'array'),
	CONSTRAINT "finance_webauthn_credentials_device_type_check" CHECK ("finance_webauthn_credentials"."device_type" in ('singleDevice', 'multiDevice')),
	CONSTRAINT "finance_webauthn_credentials_counter_check" CHECK ("finance_webauthn_credentials"."signature_counter" >= 0),
	CONSTRAINT "finance_webauthn_credentials_lifecycle_check" CHECK (("finance_webauthn_credentials"."status" = 'active' and "finance_webauthn_credentials"."quarantined_at" is null) or ("finance_webauthn_credentials"."status" = 'quarantined' and "finance_webauthn_credentials"."quarantined_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "finance_webauthn_registration_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"challenge" varchar(128) NOT NULL,
	"rp_id" varchar(253) NOT NULL,
	"origin" varchar(255) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "finance_webauthn_registration_challenges_challenge_check" CHECK (length("finance_webauthn_registration_challenges"."challenge") = 43 and "finance_webauthn_registration_challenges"."challenge" ~ '^[A-Za-z0-9_-]+$'),
	CONSTRAINT "finance_webauthn_registration_challenges_expiry_check" CHECK ("finance_webauthn_registration_challenges"."expires_at" > "finance_webauthn_registration_challenges"."issued_at" and "finance_webauthn_registration_challenges"."expires_at" <= "finance_webauthn_registration_challenges"."issued_at" + interval '300 seconds'),
	CONSTRAINT "finance_webauthn_registration_challenges_lifecycle_check" CHECK (("finance_webauthn_registration_challenges"."status" = 'active' and "finance_webauthn_registration_challenges"."consumed_at" is null) or ("finance_webauthn_registration_challenges"."status" = 'consumed' and "finance_webauthn_registration_challenges"."consumed_at" is not null and "finance_webauthn_registration_challenges"."consumed_at" >= "finance_webauthn_registration_challenges"."issued_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_unique" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_email_login_unique" ON "auth_identities" USING btree (lower("email")) WHERE "auth_identities"."provider" = 'email' and "auth_identities"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_phone_login_unique" ON "auth_identities" USING btree ("phone_number") WHERE "auth_identities"."provider" = 'phone' and "auth_identities"."phone_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_assignments_user_role_unique" ON "user_role_assignments" USING btree ("user_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_hash_unique" ON "user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_challenges_pending_identifier_unique" ON "auth_challenges" USING btree ("channel","identifier_normalized") WHERE "auth_challenges"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "finance_authorization_challenges_challenge_unique" ON "finance_authorization_challenges" USING btree ("challenge");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_webauthn_registration_challenges_challenge_unique" ON "finance_webauthn_registration_challenges" USING btree ("challenge");--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenge_deliveries" ADD CONSTRAINT "auth_challenge_deliveries_challenge_id_auth_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."auth_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenge_delivery_attempts" ADD CONSTRAINT "auth_challenge_delivery_attempts_delivery_id_auth_challenge_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."auth_challenge_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_authorization_challenges" ADD CONSTRAINT "finance_authorization_challenges_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_authorization_challenges" ADD CONSTRAINT "finance_authorization_challenges_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_authorization_grants" ADD CONSTRAINT "finance_authorization_grants_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_authorization_grants" ADD CONSTRAINT "finance_authorization_grants_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_webauthn_credentials" ADD CONSTRAINT "finance_webauthn_credentials_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_webauthn_registration_challenges" ADD CONSTRAINT "finance_webauthn_registration_challenges_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_webauthn_registration_challenges" ADD CONSTRAINT "finance_webauthn_registration_challenges_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_identities_user_id_index" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_identities_email_index" ON "auth_identities" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_identities_phone_number_index" ON "auth_identities" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "user_role_assignments_role_index" ON "user_role_assignments" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_index" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_active_user_index" ON "user_sessions" USING btree ("user_id") WHERE "user_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "user_sessions_expires_at_index" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
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
CREATE INDEX "finance_authorization_challenges_active_binding_index" ON "finance_authorization_challenges" USING btree ("actor_user_id","session_id","action_kind","aggregate_id","expires_at") WHERE "finance_authorization_challenges"."status" = 'active';--> statement-breakpoint
CREATE INDEX "finance_authorization_grants_active_binding_index" ON "finance_authorization_grants" USING btree ("actor_user_id","session_id","action_kind","aggregate_id","expires_at") WHERE "finance_authorization_grants"."status" = 'active';--> statement-breakpoint
CREATE INDEX "finance_webauthn_credentials_owner_active_index" ON "finance_webauthn_credentials" USING btree ("owner_user_id","created_at") WHERE "finance_webauthn_credentials"."status" = 'active';--> statement-breakpoint
CREATE INDEX "finance_webauthn_credentials_status_index" ON "finance_webauthn_credentials" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "finance_webauthn_registration_challenges_active_session_index" ON "finance_webauthn_registration_challenges" USING btree ("actor_user_id","session_id","expires_at") WHERE "finance_webauthn_registration_challenges"."status" = 'active';