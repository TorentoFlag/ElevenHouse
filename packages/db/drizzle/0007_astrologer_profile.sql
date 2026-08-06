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
ALTER TABLE "astrologer_profiles" ADD CONSTRAINT "astrologer_profiles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astrologer_profiles" ADD CONSTRAINT "astrologer_profiles_avatar_media_id_media_assets_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astrologer_profiles" ADD CONSTRAINT "astrologer_profiles_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "astrologer_profiles_public_handle_idx" ON "astrologer_profiles" USING btree ("public_handle");