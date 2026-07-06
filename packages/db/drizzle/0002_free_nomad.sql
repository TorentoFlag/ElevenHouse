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
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_birth_data" ADD CONSTRAINT "client_birth_data_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_astrologer_relationships" ADD CONSTRAINT "client_astrologer_relationships_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_astrologer_relationships" ADD CONSTRAINT "client_astrologer_relationships_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_join_intents" ADD CONSTRAINT "client_join_intents_astrologer_user_id_users_id_fk" FOREIGN KEY ("astrologer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_join_intents" ADD CONSTRAINT "client_join_intents_claimed_by_client_user_id_users_id_fk" FOREIGN KEY ("claimed_by_client_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "client_birth_data_client_unique" ON "client_birth_data" USING btree ("client_user_id");
--> statement-breakpoint
CREATE INDEX "client_birth_data_client_idx" ON "client_birth_data" USING btree ("client_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "client_astrologer_relationships_unique" ON "client_astrologer_relationships" USING btree ("client_user_id","astrologer_user_id");
--> statement-breakpoint
CREATE INDEX "client_astrologer_relationships_astrologer_status_idx" ON "client_astrologer_relationships" USING btree ("astrologer_user_id","status");
--> statement-breakpoint
CREATE INDEX "client_astrologer_relationships_client_status_idx" ON "client_astrologer_relationships" USING btree ("client_user_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "client_join_intents_token_hash_unique" ON "client_join_intents" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "client_join_intents_astrologer_status_idx" ON "client_join_intents" USING btree ("astrologer_user_id","status");
--> statement-breakpoint
CREATE INDEX "client_join_intents_claimed_client_idx" ON "client_join_intents" USING btree ("claimed_by_client_user_id");
