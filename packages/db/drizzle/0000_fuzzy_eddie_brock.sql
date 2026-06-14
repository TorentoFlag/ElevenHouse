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
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"email" text,
	"phone_number" text,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"password_hash" text,
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
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "auth_security_events_user_id_index" ON "auth_security_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_security_events_session_id_index" ON "auth_security_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "auth_security_events_event_type_index" ON "auth_security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "auth_security_events_occurred_at_index" ON "auth_security_events" USING btree ("occurred_at");