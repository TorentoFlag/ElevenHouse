CREATE TABLE "calculation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"module" text NOT NULL,
	"mode" text NOT NULL,
	"interpretation_mode" text,
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
	CONSTRAINT "calculation_records_interpretation_mode_check" CHECK ("calculation_records"."interpretation_mode" is null or (
        "calculation_records"."module" = 'chart'
        and "calculation_records"."method_code" = 'natal'
        and "calculation_records"."interpretation_mode" in ('adult_natal', 'child', 'legacy_unclassified')
      )),
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
	CONSTRAINT "calculation_participants_record_role_unique" UNIQUE("calculation_id","role"),
	CONSTRAINT "calculation_participants_record_order_unique" UNIQUE("calculation_id","order"),
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
	"published_interpretation_id" uuid,
	"published_result_checksum" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_client_links_visibility_check" CHECK ("calculation_client_links"."visibility" in ('private_to_astrologer', 'visible_to_client')),
	CONSTRAINT "calculation_client_links_published_at_check" CHECK ("calculation_client_links"."visibility" <> 'visible_to_client' or "calculation_client_links"."published_at" is not null),
	CONSTRAINT "calculation_client_links_published_result_checksum_check" CHECK ("calculation_client_links"."published_result_checksum" is null or "calculation_client_links"."published_result_checksum" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "calculation_client_links_publication_binding_check" CHECK ((
        "calculation_client_links"."visibility" = 'private_to_astrologer'
        and "calculation_client_links"."published_at" is null
        and "calculation_client_links"."published_interpretation_id" is null
        and "calculation_client_links"."published_result_checksum" is null
      ) or (
        "calculation_client_links"."visibility" = 'visible_to_client'
        and "calculation_client_links"."published_at" is not null
        and "calculation_client_links"."published_interpretation_id" is not null
        and "calculation_client_links"."published_result_checksum" is not null
      ))
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
	CONSTRAINT "calculation_interpretations_id_record_unique" UNIQUE("id","calculation_id"),
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
	"target_calculation_id" uuid,
	"expected_source_checksum" text,
	"method" text DEFAULT 'natal' NOT NULL,
	"interpretation_mode" text,
	"method_version" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"input_fingerprint" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"settings_snapshot" jsonb NOT NULL,
	"participant_snapshot" jsonb NOT NULL,
	"provider" text DEFAULT 'kerykeion' NOT NULL,
	"schema_version" text DEFAULT 'chart-result.v2' NOT NULL,
	"execution_profile" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"lease_generation" integer DEFAULT 0 NOT NULL,
	"result_checksum" text,
	"result_reproducibility_fingerprint" text,
	"last_error_code" text,
	"last_error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_calculation_jobs_method_check" CHECK ("chart_calculation_jobs"."method" in ('natal', 'astrocartography', 'transit', 'synastry', 'composite', 'solar_return', 'progression', 'horary')),
	CONSTRAINT "chart_calculation_jobs_interpretation_mode_check" CHECK ("chart_calculation_jobs"."interpretation_mode" is null or (
        "chart_calculation_jobs"."interpretation_mode" in ('adult_natal', 'child', 'legacy_unclassified')
        and (
          "chart_calculation_jobs"."method" = 'natal'
          or "chart_calculation_jobs"."interpretation_mode" = 'legacy_unclassified'
        )
      )),
	CONSTRAINT "chart_calculation_jobs_status_check" CHECK ("chart_calculation_jobs"."status" in ('queued', 'processing', 'succeeded', 'failed')),
	CONSTRAINT "chart_calculation_jobs_provider_check" CHECK ("chart_calculation_jobs"."provider" in ('kerykeion')),
	CONSTRAINT "chart_calculation_jobs_schema_version_check" CHECK ("chart_calculation_jobs"."schema_version" in ('chart-result.v1', 'chart-result.v2')),
	CONSTRAINT "chart_calculation_jobs_input_fingerprint_check" CHECK ("chart_calculation_jobs"."input_fingerprint" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "chart_calculation_jobs_input_snapshot_object_check" CHECK (jsonb_typeof("chart_calculation_jobs"."input_snapshot") = 'object'),
	CONSTRAINT "chart_calculation_jobs_settings_snapshot_object_check" CHECK (jsonb_typeof("chart_calculation_jobs"."settings_snapshot") = 'object'),
	CONSTRAINT "chart_calculation_jobs_participant_snapshot_check" CHECK (coalesce((
        jsonb_typeof("chart_calculation_jobs"."participant_snapshot") = 'array'
        and (
          (
            "chart_calculation_jobs"."method" in ('synastry', 'composite')
            and jsonb_array_length("chart_calculation_jobs"."participant_snapshot") = 2
            and "chart_calculation_jobs"."participant_snapshot"->0 = jsonb_build_object(
              'role', 'subject', 'clientId', "chart_calculation_jobs"."client_id"
            )
            and "chart_calculation_jobs"."participant_snapshot"->1->>'role' = 'partner'
            and "chart_calculation_jobs"."participant_snapshot"->1 = jsonb_build_object(
              'role', 'partner', 'clientId', "chart_calculation_jobs"."participant_snapshot"->1->>'clientId'
            )
            and "chart_calculation_jobs"."participant_snapshot"->1->>'clientId'
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and "chart_calculation_jobs"."participant_snapshot"->1->>'clientId' <> "chart_calculation_jobs"."client_id"::text
          )
          or (
            "chart_calculation_jobs"."method" not in ('synastry', 'composite')
            and "chart_calculation_jobs"."participant_snapshot" = jsonb_build_array(
              jsonb_build_object('role', 'subject', 'clientId', "chart_calculation_jobs"."client_id")
            )
          )
        )
      ), false)),
	CONSTRAINT "chart_calculation_jobs_replacement_pair_check" CHECK (("chart_calculation_jobs"."target_calculation_id" is null) = ("chart_calculation_jobs"."expected_source_checksum" is null)),
	CONSTRAINT "chart_calculation_jobs_expected_source_checksum_check" CHECK ("chart_calculation_jobs"."expected_source_checksum" is null or "chart_calculation_jobs"."expected_source_checksum" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "chart_calculation_jobs_method_version_check" CHECK (coalesce((
        (
          "chart_calculation_jobs"."schema_version" = 'chart-result.v1'
          and "chart_calculation_jobs"."method_version" is null
          and "chart_calculation_jobs"."execution_profile" is null
          and "chart_calculation_jobs"."result_reproducibility_fingerprint" is null
        )
        or (
          "chart_calculation_jobs"."schema_version" = 'chart-result.v2'
          and "chart_calculation_jobs"."execution_profile" is not null
          and "chart_calculation_jobs"."method_version" = case "chart_calculation_jobs"."method"
            when 'natal' then 'chart.natal.kerykeion-5.12.v2'
            when 'astrocartography' then 'chart.astrocartography.swisseph.v2'
            when 'transit' then 'chart.transit.kerykeion-5.12.v2'
            when 'synastry' then 'chart.synastry.kerykeion-5.12.v2'
            when 'composite' then 'chart.composite.kerykeion-5.12.v2'
            when 'solar_return' then 'chart.solar-return.kerykeion-5.12.v2'
            when 'progression' then 'chart.progression.secondary-tropical-year.v2'
            when 'horary' then 'chart.horary.kerykeion-5.12.v2'
          end
        )
      ), false)),
	CONSTRAINT "chart_calculation_jobs_execution_profile_object_check" CHECK (coalesce((
        "chart_calculation_jobs"."execution_profile" is null
        or (
          jsonb_typeof("chart_calculation_jobs"."execution_profile") = 'object'
          and "chart_calculation_jobs"."execution_profile" = jsonb_build_object(
            'provider', "chart_calculation_jobs"."execution_profile"->'provider',
            'kerykeionVersion', "chart_calculation_jobs"."execution_profile"->'kerykeionVersion',
            'pyswissephVersion', "chart_calculation_jobs"."execution_profile"->'pyswissephVersion',
            'expectedEphemeris', "chart_calculation_jobs"."execution_profile"->'expectedEphemeris',
            'expectedEphemerisFlags', "chart_calculation_jobs"."execution_profile"->'expectedEphemerisFlags',
            'expectedEphemerisDataRevision', "chart_calculation_jobs"."execution_profile"->'expectedEphemerisDataRevision'
          )
          and "chart_calculation_jobs"."execution_profile"->>'provider' = 'kerykeion'
          and "chart_calculation_jobs"."execution_profile"->>'kerykeionVersion' = '5.12.9'
          and "chart_calculation_jobs"."execution_profile"->>'pyswissephVersion' = '2.10.3.2'
          and (
            (
              "chart_calculation_jobs"."execution_profile"->>'expectedEphemeris' = 'moshier'
              and "chart_calculation_jobs"."execution_profile"->'expectedEphemerisFlags' in (
                '["FLG_MOSEPH", "FLG_SPEED"]'::jsonb,
                '["FLG_SPEED", "FLG_MOSEPH"]'::jsonb
              )
              and "chart_calculation_jobs"."execution_profile"->'expectedEphemerisDataRevision' = 'null'::jsonb
            )
            or (
              "chart_calculation_jobs"."execution_profile"->>'expectedEphemeris' = 'swiss-ephemeris'
              and "chart_calculation_jobs"."execution_profile"->'expectedEphemerisFlags' in (
                '["FLG_SWIEPH", "FLG_SPEED"]'::jsonb,
                '["FLG_SPEED", "FLG_SWIEPH"]'::jsonb
              )
              and "chart_calculation_jobs"."execution_profile"->>'expectedEphemerisDataRevision'
                ~ '^sha256:[a-f0-9]{64}$'
            )
          )
        )
      ), false)),
	CONSTRAINT "chart_calculation_jobs_attempts_check" CHECK ("chart_calculation_jobs"."attempts" >= 0),
	CONSTRAINT "chart_calculation_jobs_max_attempts_check" CHECK ("chart_calculation_jobs"."max_attempts" > 0),
	CONSTRAINT "chart_calculation_jobs_attempts_limit_check" CHECK ("chart_calculation_jobs"."attempts" <= "chart_calculation_jobs"."max_attempts"),
	CONSTRAINT "chart_calculation_jobs_lease_generation_check" CHECK ("chart_calculation_jobs"."lease_generation" >= 0),
	CONSTRAINT "chart_calculation_jobs_result_checksum_check" CHECK ("chart_calculation_jobs"."result_checksum" is null or "chart_calculation_jobs"."result_checksum" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "chart_calculation_jobs_result_reproducibility_fingerprint_check" CHECK ("chart_calculation_jobs"."result_reproducibility_fingerprint" is null or "chart_calculation_jobs"."result_reproducibility_fingerprint" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "chart_calculation_jobs_lease_state_check" CHECK (coalesce((
        (
          "chart_calculation_jobs"."status" = 'queued'
          and "chart_calculation_jobs"."locked_by" is null
          and "chart_calculation_jobs"."locked_until" is null
          and "chart_calculation_jobs"."finished_at" is null
          and "chart_calculation_jobs"."result_calculation_id" is null
          and "chart_calculation_jobs"."result_checksum" is null
          and "chart_calculation_jobs"."result_reproducibility_fingerprint" is null
          and (
            ("chart_calculation_jobs"."last_error_code" is null and "chart_calculation_jobs"."last_error_message" is null)
            or (
              length(trim("chart_calculation_jobs"."last_error_code")) > 0
              and length(trim("chart_calculation_jobs"."last_error_message")) > 0
            )
          )
        )
        or (
          "chart_calculation_jobs"."status" = 'processing'
          and length(trim("chart_calculation_jobs"."locked_by")) > 0
          and "chart_calculation_jobs"."locked_until" is not null
          and "chart_calculation_jobs"."lease_generation" > 0
          and "chart_calculation_jobs"."started_at" is not null
          and "chart_calculation_jobs"."finished_at" is null
          and "chart_calculation_jobs"."result_calculation_id" is null
          and "chart_calculation_jobs"."result_checksum" is null
          and "chart_calculation_jobs"."result_reproducibility_fingerprint" is null
          and "chart_calculation_jobs"."last_error_code" is null
          and "chart_calculation_jobs"."last_error_message" is null
        )
        or (
          "chart_calculation_jobs"."status" = 'succeeded'
          and "chart_calculation_jobs"."locked_by" is null
          and "chart_calculation_jobs"."locked_until" is null
          and "chart_calculation_jobs"."started_at" is not null
          and "chart_calculation_jobs"."finished_at" is not null
          and "chart_calculation_jobs"."result_calculation_id" is not null
          and (
            "chart_calculation_jobs"."schema_version" = 'chart-result.v1'
            or (
              "chart_calculation_jobs"."result_checksum" is not null
              and "chart_calculation_jobs"."result_reproducibility_fingerprint" is not null
            )
          )
          and "chart_calculation_jobs"."last_error_code" is null
          and "chart_calculation_jobs"."last_error_message" is null
        )
        or (
          "chart_calculation_jobs"."status" = 'failed'
          and "chart_calculation_jobs"."locked_by" is null
          and "chart_calculation_jobs"."locked_until" is null
          and "chart_calculation_jobs"."started_at" is not null
          and "chart_calculation_jobs"."finished_at" is not null
          and "chart_calculation_jobs"."result_calculation_id" is null
          and "chart_calculation_jobs"."result_checksum" is null
          and "chart_calculation_jobs"."result_reproducibility_fingerprint" is null
          and length(trim("chart_calculation_jobs"."last_error_code")) > 0
          and length(trim("chart_calculation_jobs"."last_error_message")) > 0
        )
      ), false))
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
CREATE UNIQUE INDEX "calculation_records_exact_request_unique" ON "calculation_records" USING btree ("owner_user_id","module","mode","method_code","request_fingerprint") WHERE "calculation_records"."status" <> 'archived';--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_client_links_record_client_unique" ON "calculation_client_links" USING btree ("calculation_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calculation_pdf_jobs_idempotency_unique" ON "calculation_pdf_jobs" USING btree ("owner_user_id","calculation_id","result_checksum","locale","document_fingerprint") WHERE "calculation_pdf_jobs"."status" <> 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX "chart_calculation_jobs_active_fingerprint_unique" ON "chart_calculation_jobs" USING btree ("owner_user_id","input_fingerprint") WHERE "chart_calculation_jobs"."status" in ('queued', 'processing');--> statement-breakpoint
ALTER TABLE "calculation_records" ADD CONSTRAINT "calculation_records_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_participants" ADD CONSTRAINT "calculation_participants_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_client_links" ADD CONSTRAINT "calculation_client_links_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_client_links" ADD CONSTRAINT "calculation_client_links_published_interpretation_fk" FOREIGN KEY ("published_interpretation_id","calculation_id") REFERENCES "public"."calculation_interpretations"("id","calculation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_interpretations" ADD CONSTRAINT "calculation_interpretations_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_artifacts" ADD CONSTRAINT "calculation_artifacts_calculation_id_calculation_records_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."calculation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_artifacts" ADD CONSTRAINT "calculation_artifacts_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_pdf_jobs" ADD CONSTRAINT "calculation_pdf_jobs_calculation_owner_fk" FOREIGN KEY ("calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_pdf_jobs" ADD CONSTRAINT "calculation_pdf_jobs_artifact_id_fk" FOREIGN KEY ("artifact_id","calculation_id") REFERENCES "public"."calculation_artifacts"("id","calculation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_pdf_jobs" ADD CONSTRAINT "calculation_pdf_jobs_media_asset_id_fk" FOREIGN KEY ("media_asset_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_calculation_jobs" ADD CONSTRAINT "chart_calculation_jobs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_calculation_jobs" ADD CONSTRAINT "chart_calculation_jobs_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_calculation_jobs" ADD CONSTRAINT "chart_calculation_jobs_result_owner_fk" FOREIGN KEY ("result_calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_calculation_jobs" ADD CONSTRAINT "chart_calculation_jobs_target_owner_fk" FOREIGN KEY ("target_calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_notes" ADD CONSTRAINT "matrix_notes_calculation_owner_fk" FOREIGN KEY ("calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_report_drafts" ADD CONSTRAINT "matrix_report_drafts_calculation_owner_fk" FOREIGN KEY ("calculation_id","owner_user_id") REFERENCES "public"."calculation_records"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calculation_records_owner_updated_id_idx" ON "calculation_records" USING btree ("owner_user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_status_updated_id_idx" ON "calculation_records" USING btree ("owner_user_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_module_created_id_idx" ON "calculation_records" USING btree ("owner_user_id","module","created_at","id");--> statement-breakpoint
CREATE INDEX "calculation_records_owner_status_module_created_id_idx" ON "calculation_records" USING btree ("owner_user_id","status","module","created_at","id");--> statement-breakpoint
CREATE INDEX "calculation_client_links_record_idx" ON "calculation_client_links" USING btree ("calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_client_links_client_idx" ON "calculation_client_links" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "calculation_client_links_published_interpretation_idx" ON "calculation_client_links" USING btree ("published_interpretation_id","calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_interpretations_record_idx" ON "calculation_interpretations" USING btree ("calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_artifacts_record_idx" ON "calculation_artifacts" USING btree ("calculation_id");--> statement-breakpoint
CREATE INDEX "calculation_artifacts_media_idx" ON "calculation_artifacts" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "calculation_pdf_jobs_owner_calculation_locale_created_idx" ON "calculation_pdf_jobs" USING btree ("owner_user_id","calculation_id","locale","created_at","id");--> statement-breakpoint
CREATE INDEX "calculation_pdf_jobs_status_updated_idx" ON "calculation_pdf_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "chart_calculation_jobs_owner_idx" ON "chart_calculation_jobs" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "chart_calculation_jobs_client_idx" ON "chart_calculation_jobs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "chart_calculation_jobs_status_updated_idx" ON "chart_calculation_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "matrix_notes_owner_calculation_created_id_idx" ON "matrix_notes" USING btree ("owner_user_id","calculation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "matrix_report_drafts_owner_calculation_idx" ON "matrix_report_drafts" USING btree ("owner_user_id","calculation_id");
--> statement-breakpoint
-- ElevenHouse chart job result checksum integrity: begin
CREATE OR REPLACE FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $chart_job_result_checksum_guard$
BEGIN
  IF OLD.result_checksum IS NOT NULL
     AND OLD.result_checksum IS DISTINCT FROM NEW.result_checksum THEN
    RAISE EXCEPTION 'succeeded chart job result checksum is immutable'
      USING ERRCODE = '55000',
            CONSTRAINT = 'chart_calculation_jobs_result_checksum_immutable';
  END IF;

  RETURN NEW;
END;
$chart_job_result_checksum_guard$;
--> statement-breakpoint
CREATE TRIGGER "chart_calculation_jobs_result_checksum_immutable"
BEFORE UPDATE OF result_checksum ON chart_calculation_jobs
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation();
-- ElevenHouse chart job result checksum integrity: end
