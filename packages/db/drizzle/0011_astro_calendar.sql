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
CREATE UNIQUE INDEX "astro_calendar_generations_fingerprint_unique" ON "astro_calendar_generations" USING btree ("owner_user_id","input_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "astro_calendar_events_generation_event_unique" ON "astro_calendar_events" USING btree ("generation_id","event_id");--> statement-breakpoint
ALTER TABLE "astro_calendar_generations" ADD CONSTRAINT "astro_calendar_generations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_calendar_events" ADD CONSTRAINT "astro_calendar_events_generation_id_astro_calendar_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."astro_calendar_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "astro_calendar_events" ADD CONSTRAINT "astro_calendar_events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "astro_calendar_generations_owner_range_idx" ON "astro_calendar_generations" USING btree ("owner_user_id","range_start","range_end");--> statement-breakpoint
CREATE INDEX "astro_calendar_generations_status_updated_idx" ON "astro_calendar_generations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "astro_calendar_events_owner_starts_idx" ON "astro_calendar_events" USING btree ("owner_user_id","starts_at","id");--> statement-breakpoint
CREATE INDEX "astro_calendar_events_generation_starts_idx" ON "astro_calendar_events" USING btree ("generation_id","starts_at","id");