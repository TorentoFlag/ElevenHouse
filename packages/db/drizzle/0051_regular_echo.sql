CREATE TABLE "client_related_birth_profile_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"related_profile_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"source" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_related_birth_profile_history_revision_unique" UNIQUE("related_profile_id","revision"),
	CONSTRAINT "client_related_birth_profile_history_revision_check" CHECK ("client_related_birth_profile_history"."revision" >= 1),
	CONSTRAINT "client_related_birth_profile_history_actor_role_check" CHECK ("client_related_birth_profile_history"."actor_role" in ('client', 'astrologer')),
	CONSTRAINT "client_related_birth_profile_history_source_check" CHECK ("client_related_birth_profile_history"."source" in ('client_profile', 'import', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "client_related_birth_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"relationship_label" text NOT NULL,
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
	"revision" integer DEFAULT 1 NOT NULL,
	"last_edited_by_user_id" uuid NOT NULL,
	"last_edited_by_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_related_birth_profiles_display_name_check" CHECK (length(trim("client_related_birth_profiles"."display_name")) between 1 and 200),
	CONSTRAINT "client_related_birth_profiles_relationship_label_check" CHECK (length(trim("client_related_birth_profiles"."relationship_label")) between 1 and 100),
	CONSTRAINT "client_related_birth_profiles_time_precision_check" CHECK ("client_related_birth_profiles"."birth_time_precision" in ('exact', 'approximate', 'unknown')),
	CONSTRAINT "client_related_birth_profiles_source_check" CHECK ("client_related_birth_profiles"."source" in ('client_profile', 'import', 'manual')),
	CONSTRAINT "client_related_birth_profiles_last_edited_by_role_check" CHECK ("client_related_birth_profiles"."last_edited_by_role" in ('client', 'astrologer')),
	CONSTRAINT "client_related_birth_profiles_time_dst_occurrence_check" CHECK ("client_related_birth_profiles"."birth_time_dst_occurrence" is null or "client_related_birth_profiles"."birth_time_dst_occurrence" in ('first', 'second')),
	CONSTRAINT "client_related_birth_profiles_birth_date_check" CHECK ("client_related_birth_profiles"."birth_date" is null or "client_related_birth_profiles"."birth_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "client_related_birth_profiles_birth_time_check" CHECK ("client_related_birth_profiles"."birth_time" is null or "client_related_birth_profiles"."birth_time" ~ '^[0-9]{2}:[0-9]{2}$'),
	CONSTRAINT "client_related_birth_profiles_unknown_time_check" CHECK ("client_related_birth_profiles"."birth_time_precision" <> 'unknown' or "client_related_birth_profiles"."birth_time" is null),
	CONSTRAINT "client_related_birth_profiles_country_code_check" CHECK ("client_related_birth_profiles"."birth_country_code" is null or "client_related_birth_profiles"."birth_country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "client_related_birth_profiles_latitude_check" CHECK ("client_related_birth_profiles"."birth_latitude" is null or ("client_related_birth_profiles"."birth_latitude" >= -90 and "client_related_birth_profiles"."birth_latitude" <= 90)),
	CONSTRAINT "client_related_birth_profiles_longitude_check" CHECK ("client_related_birth_profiles"."birth_longitude" is null or ("client_related_birth_profiles"."birth_longitude" >= -180 and "client_related_birth_profiles"."birth_longitude" <= 180)),
	CONSTRAINT "client_related_birth_profiles_revision_check" CHECK ("client_related_birth_profiles"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "calculation_participants" DROP CONSTRAINT "calculation_participants_source_check";--> statement-breakpoint
ALTER TABLE "calculation_participants" DROP CONSTRAINT "calculation_participants_source_client_check";--> statement-breakpoint
ALTER TABLE "chart_calculation_jobs" DROP CONSTRAINT "chart_calculation_jobs_participant_snapshot_check";--> statement-breakpoint
ALTER TABLE "calculation_participants" ADD COLUMN "related_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "client_related_birth_profile_history" ADD CONSTRAINT "client_related_birth_profile_history_related_profile_id_client_related_birth_profiles_id_fk" FOREIGN KEY ("related_profile_id") REFERENCES "public"."client_related_birth_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_related_birth_profile_history" ADD CONSTRAINT "client_related_birth_profile_history_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_related_birth_profile_history" ADD CONSTRAINT "client_related_birth_profile_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_related_birth_profiles" ADD CONSTRAINT "client_related_birth_profiles_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_related_birth_profiles" ADD CONSTRAINT "client_related_birth_profiles_last_edited_by_user_id_users_id_fk" FOREIGN KEY ("last_edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_related_birth_profile_history_client_recorded_idx" ON "client_related_birth_profile_history" USING btree ("client_user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "client_related_birth_profiles_client_idx" ON "client_related_birth_profiles" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "client_related_birth_profiles_client_updated_idx" ON "client_related_birth_profiles" USING btree ("client_user_id","updated_at");--> statement-breakpoint
ALTER TABLE "calculation_participants" ADD CONSTRAINT "calculation_participants_related_profile_id_client_related_birth_profiles_id_fk" FOREIGN KEY ("related_profile_id") REFERENCES "public"."client_related_birth_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_participants" ADD CONSTRAINT "calculation_participants_source_check" CHECK ("calculation_participants"."source" in ('crm_client', 'client_related_profile', 'manual'));--> statement-breakpoint
ALTER TABLE "calculation_participants" ADD CONSTRAINT "calculation_participants_source_client_check" CHECK ((
        "calculation_participants"."source" = 'crm_client'
        and "calculation_participants"."client_id" is not null
        and "calculation_participants"."related_profile_id" is null
      ) or (
        "calculation_participants"."source" = 'client_related_profile'
        and "calculation_participants"."client_id" is not null
        and "calculation_participants"."related_profile_id" is not null
      ) or (
        "calculation_participants"."source" = 'manual'
        and "calculation_participants"."client_id" is null
        and "calculation_participants"."related_profile_id" is null
      ));--> statement-breakpoint
ALTER TABLE "chart_calculation_jobs" ADD CONSTRAINT "chart_calculation_jobs_participant_snapshot_check" CHECK (coalesce((
        jsonb_typeof("chart_calculation_jobs"."participant_snapshot") = 'array'
        and (
	          (
	            "chart_calculation_jobs"."method" in ('synastry', 'composite')
	            and jsonb_array_length("chart_calculation_jobs"."participant_snapshot") = 2
	            and "chart_calculation_jobs"."participant_snapshot"->0 = jsonb_build_object(
	              'role', 'subject', 'clientId', "chart_calculation_jobs"."client_id"
	            )
	            and "chart_calculation_jobs"."participant_snapshot"->1->>'role' = 'partner'
	            and (
	              (
	                "chart_calculation_jobs"."participant_snapshot"->1 = jsonb_build_object(
	                  'role', 'partner', 'clientId', "chart_calculation_jobs"."participant_snapshot"->1->>'clientId'
	                )
	                and "chart_calculation_jobs"."participant_snapshot"->1->>'clientId'
	                  ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
	                and "chart_calculation_jobs"."participant_snapshot"->1->>'clientId' <> "chart_calculation_jobs"."client_id"::text
	              )
	              or (
	                "chart_calculation_jobs"."participant_snapshot"->1 = jsonb_build_object(
	                  'role', 'partner',
	                  'source', 'client_related_profile',
	                  'clientId', "chart_calculation_jobs"."client_id",
	                  'relatedProfileId', "chart_calculation_jobs"."participant_snapshot"->1->>'relatedProfileId'
	                )
	                and "chart_calculation_jobs"."participant_snapshot"->1->>'relatedProfileId'
	                  ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
	              )
	            )
	          )
          or (
            "chart_calculation_jobs"."method" not in ('synastry', 'composite')
            and "chart_calculation_jobs"."participant_snapshot" = jsonb_build_array(
              jsonb_build_object('role', 'subject', 'clientId', "chart_calculation_jobs"."client_id")
            )
          )
        )
      ), false));
--> statement-breakpoint
-- ElevenHouse related birth-profile integrity objects: begin
CREATE OR REPLACE FUNCTION elevenhouse_reject_client_related_birth_profile_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $client_related_birth_profile_history_guard$
BEGIN
  RAISE EXCEPTION 'Client related birth-profile history is immutable'
    USING ERRCODE = '55000', CONSTRAINT = 'client_related_birth_profile_history_append_only';
END;
$client_related_birth_profile_history_guard$;
--> statement-breakpoint
CREATE TRIGGER "client_related_birth_profile_history_append_only"
BEFORE UPDATE OR DELETE ON client_related_birth_profile_history
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_reject_client_related_birth_profile_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "client_related_birth_profile_history_reject_truncate"
BEFORE TRUNCATE ON client_related_birth_profile_history
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_reject_client_related_birth_profile_history_mutation();
-- ElevenHouse related birth-profile integrity objects: end
