CREATE TABLE "ai_usage_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"feature" text NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" integer NOT NULL,
	"provider" text NOT NULL,
	"owner_safety_id" text NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"source_checksum" text,
	"model" text,
	"finish_reason" text,
	"safe_error_code" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"duration_ms" integer,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ai_usage_records_status_check" CHECK ("ai_usage_records"."status" in ('started', 'succeeded', 'failed', 'indeterminate')),
	CONSTRAINT "ai_usage_records_safe_fields_check" CHECK (length(trim("ai_usage_records"."feature")) between 1 and 160
        and length(trim("ai_usage_records"."prompt_id")) between 1 and 160
        and "ai_usage_records"."prompt_version" >= 1
        and length(trim("ai_usage_records"."provider")) between 1 and 80
        and ("ai_usage_records"."model" is null or length(trim("ai_usage_records"."model")) between 1 and 160)
        and ("ai_usage_records"."finish_reason" is null or length(trim("ai_usage_records"."finish_reason")) between 1 and 120)
        and ("ai_usage_records"."safe_error_code" is null or "ai_usage_records"."safe_error_code" in (
          'AI_PROVIDER_REFUSED',
          'AI_PROVIDER_BAD_REQUEST',
          'AI_PROVIDER_RESPONSE_INVALID',
          'AI_PROVIDER_INCOMPLETE_RESPONSE',
          'AI_PROVIDER_UNAVAILABLE',
          'AI_PROVIDER_AUTHENTICATION_FAILED',
          'AI_PROVIDER_BILLING_FAILED',
          'AI_PROVIDER_RATE_LIMITED',
          'AI_PROVIDER_SERVER_ERROR',
          'AI_PROVIDER_TIMEOUT',
          'AI_PROVIDER_UNKNOWN_FAILURE',
          'AI_USAGE_OUTCOME_INDETERMINATE'
        ))),
	CONSTRAINT "ai_usage_records_owner_safety_id_check" CHECK ("ai_usage_records"."owner_safety_id" ~ '^eh_[0-9a-f]{61}$'),
	CONSTRAINT "ai_usage_records_resource_evidence_check" CHECK ((
        "ai_usage_records"."resource_type" is null
        and "ai_usage_records"."resource_id" is null
        and "ai_usage_records"."source_checksum" is null
      ) or (
        length(trim("ai_usage_records"."resource_type")) between 1 and 80
        and "ai_usage_records"."resource_id" is not null
        and "ai_usage_records"."source_checksum" ~ '^sha256:[0-9a-f]{64}$'
      )),
	CONSTRAINT "ai_usage_records_token_counts_check" CHECK ((
          "ai_usage_records"."prompt_tokens" is null
          and "ai_usage_records"."completion_tokens" is null
          and "ai_usage_records"."total_tokens" is null
        ) or (
          "ai_usage_records"."prompt_tokens" >= 0
          and "ai_usage_records"."completion_tokens" >= 0
          and "ai_usage_records"."total_tokens" = "ai_usage_records"."prompt_tokens" + "ai_usage_records"."completion_tokens"
        )),
	CONSTRAINT "ai_usage_records_lifecycle_check" CHECK ((
          "ai_usage_records"."status" = 'started'
          and "ai_usage_records"."model" is null
          and "ai_usage_records"."finish_reason" is null
          and "ai_usage_records"."safe_error_code" is null
          and "ai_usage_records"."prompt_tokens" is null
          and "ai_usage_records"."completion_tokens" is null
          and "ai_usage_records"."total_tokens" is null
          and "ai_usage_records"."duration_ms" is null
          and "ai_usage_records"."completed_at" is null
        ) or (
          "ai_usage_records"."status" = 'succeeded'
          and "ai_usage_records"."model" is not null
          and "ai_usage_records"."finish_reason" is not null
          and "ai_usage_records"."safe_error_code" is null
          and "ai_usage_records"."duration_ms" >= 0
          and "ai_usage_records"."completed_at" >= "ai_usage_records"."started_at"
        ) or (
          "ai_usage_records"."status" = 'failed'
          and "ai_usage_records"."model" is null
          and "ai_usage_records"."finish_reason" is null
          and "ai_usage_records"."safe_error_code" is not null
          and "ai_usage_records"."prompt_tokens" is null
          and "ai_usage_records"."completion_tokens" is null
          and "ai_usage_records"."total_tokens" is null
          and "ai_usage_records"."duration_ms" >= 0
          and "ai_usage_records"."completed_at" >= "ai_usage_records"."started_at"
        ) or (
          "ai_usage_records"."status" = 'indeterminate'
          and "ai_usage_records"."model" is null
          and "ai_usage_records"."finish_reason" is null
          and "ai_usage_records"."safe_error_code" = 'AI_USAGE_OUTCOME_INDETERMINATE'
          and "ai_usage_records"."prompt_tokens" is null
          and "ai_usage_records"."completion_tokens" is null
          and "ai_usage_records"."total_tokens" is null
          and "ai_usage_records"."duration_ms" >= 0
          and "ai_usage_records"."completed_at" >= "ai_usage_records"."started_at"
        ))
);
--> statement-breakpoint
CREATE INDEX "ai_usage_records_owner_started_index" ON "ai_usage_records" USING btree ("owner_safety_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_usage_records_status_started_index" ON "ai_usage_records" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "ai_usage_records_feature_started_index" ON "ai_usage_records" USING btree ("feature","started_at");
--> statement-breakpoint
-- ElevenHouse AI usage integrity objects: begin
CREATE OR REPLACE FUNCTION elevenhouse_guard_ai_usage_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $ai_usage_record_guard$
BEGIN
  IF ROW(
      OLD.id,
      OLD.feature,
      OLD.prompt_id,
      OLD.prompt_version,
      OLD.provider,
      OLD.owner_safety_id,
      OLD.resource_type,
      OLD.resource_id,
      OLD.source_checksum,
      OLD.started_at
    ) IS DISTINCT FROM ROW(
      NEW.id,
      NEW.feature,
      NEW.prompt_id,
      NEW.prompt_version,
      NEW.provider,
      NEW.owner_safety_id,
      NEW.resource_type,
      NEW.resource_id,
      NEW.source_checksum,
      NEW.started_at
    )
    OR OLD.status <> 'started'
    OR NEW.status NOT IN ('succeeded', 'failed', 'indeterminate') THEN
    RAISE EXCEPTION 'AI usage evidence permits one started-to-terminal transition'
      USING ERRCODE = '55000', CONSTRAINT = 'ai_usage_records_one_way_lifecycle';
  END IF;
  RETURN NEW;
END;
$ai_usage_record_guard$;
--> statement-breakpoint
CREATE TRIGGER "ai_usage_records_one_way_lifecycle"
BEFORE UPDATE ON ai_usage_records
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_ai_usage_record_mutation();
-- ElevenHouse AI usage integrity objects: end
