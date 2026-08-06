CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE "availability_date_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "availability_date_overrides_identity_unique" UNIQUE("id","schedule_id","owner_user_id"),
	CONSTRAINT "availability_date_overrides_schedule_date_unique" UNIQUE("schedule_id","local_date"),
	CONSTRAINT "availability_date_overrides_mode_check" CHECK ("availability_date_overrides"."mode" in ('available', 'unavailable'))
);
--> statement-breakpoint
CREATE TABLE "availability_override_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"override_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	CONSTRAINT "availability_override_periods_override_range_unique" UNIQUE("override_id","start_minute","end_minute"),
	CONSTRAINT "availability_override_periods_range_check" CHECK ("availability_override_periods"."start_minute" >= 0 and "availability_override_periods"."end_minute" <= 1440 and "availability_override_periods"."start_minute" < "availability_override_periods"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "availability_product_assignments" (
	"schedule_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "availability_product_assignments_pk" PRIMARY KEY("schedule_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "availability_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"time_zone" text NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"start_interval_minutes" integer NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"minimum_notice_minutes" integer DEFAULT 0 NOT NULL,
	"booking_horizon_days" integer NOT NULL,
	"maximum_bookings_per_day" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_schedules_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "availability_schedules_name_length_check" CHECK (length(trim("availability_schedules"."name")) between 1 and 120),
	CONSTRAINT "availability_schedules_time_zone_length_check" CHECK (length(trim("availability_schedules"."time_zone")) between 1 and 100),
	CONSTRAINT "availability_schedules_version_check" CHECK ("availability_schedules"."version" > 0),
	CONSTRAINT "availability_schedules_start_interval_check" CHECK ("availability_schedules"."start_interval_minutes" between 1 and 1440),
	CONSTRAINT "availability_schedules_buffer_before_check" CHECK ("availability_schedules"."buffer_before_minutes" between 0 and 10080),
	CONSTRAINT "availability_schedules_buffer_after_check" CHECK ("availability_schedules"."buffer_after_minutes" between 0 and 10080),
	CONSTRAINT "availability_schedules_minimum_notice_check" CHECK ("availability_schedules"."minimum_notice_minutes" between 0 and 525600),
	CONSTRAINT "availability_schedules_booking_horizon_check" CHECK ("availability_schedules"."booking_horizon_days" between 1 and 730),
	CONSTRAINT "availability_schedules_maximum_bookings_check" CHECK ("availability_schedules"."maximum_bookings_per_day" is null or "availability_schedules"."maximum_bookings_per_day" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "availability_weekly_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	CONSTRAINT "availability_weekly_periods_schedule_day_range_unique" UNIQUE("schedule_id","weekday","start_minute","end_minute"),
	CONSTRAINT "availability_weekly_periods_weekday_check" CHECK ("availability_weekly_periods"."weekday" between 1 and 7),
	CONSTRAINT "availability_weekly_periods_range_check" CHECK ("availability_weekly_periods"."start_minute" >= 0 and "availability_weekly_periods"."end_minute" <= 1440 and "availability_weekly_periods"."start_minute" < "availability_weekly_periods"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "booking_lifecycle_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"event_kind" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"reason_code" text,
	"before_start_at" timestamp with time zone,
	"before_end_at" timestamp with time zone,
	"before_time_zone" text,
	"after_start_at" timestamp with time zone,
	"after_end_at" timestamp with time zone,
	"after_time_zone" text,
	"canonical_digest" varchar(71) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_lifecycle_events_booking_revision_unique" UNIQUE("booking_id","revision"),
	CONSTRAINT "booking_lifecycle_events_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "booking_lifecycle_events_id_booking_owner_unique" UNIQUE("id","booking_id","owner_user_id"),
	CONSTRAINT "booking_lifecycle_events_revision_check" CHECK ("booking_lifecycle_events"."revision" > 0),
	CONSTRAINT "booking_lifecycle_events_event_kind_check" CHECK ("booking_lifecycle_events"."event_kind" in ('confirmed', 'rescheduled', 'completed', 'cancelled')),
	CONSTRAINT "booking_lifecycle_events_actor_check" CHECK ((
        "booking_lifecycle_events"."actor_kind" = 'system' and "booking_lifecycle_events"."actor_user_id" is null
      ) or (
        "booking_lifecycle_events"."actor_kind" in ('astrologer', 'client')
        and "booking_lifecycle_events"."actor_user_id" is not null
      )),
	CONSTRAINT "booking_lifecycle_events_reason_check" CHECK ("booking_lifecycle_events"."reason_code" is null or "booking_lifecycle_events"."reason_code" in ('astrologer_unavailable', 'client_request', 'mutual_agreement', 'other')),
	CONSTRAINT "booking_lifecycle_events_before_schedule_check" CHECK ((
        "booking_lifecycle_events"."before_start_at" is null
        and "booking_lifecycle_events"."before_end_at" is null
        and "booking_lifecycle_events"."before_time_zone" is null
      ) or (
        "booking_lifecycle_events"."before_start_at" < "booking_lifecycle_events"."before_end_at"
        and length(trim("booking_lifecycle_events"."before_time_zone")) between 1 and 100
      )),
	CONSTRAINT "booking_lifecycle_events_after_schedule_check" CHECK ((
        "booking_lifecycle_events"."after_start_at" is null
        and "booking_lifecycle_events"."after_end_at" is null
        and "booking_lifecycle_events"."after_time_zone" is null
      ) or (
        "booking_lifecycle_events"."after_start_at" < "booking_lifecycle_events"."after_end_at"
        and length(trim("booking_lifecycle_events"."after_time_zone")) between 1 and 100
      )),
	CONSTRAINT "booking_lifecycle_events_transition_check" CHECK ((
        "booking_lifecycle_events"."event_kind" = 'confirmed'
        and "booking_lifecycle_events"."revision" = 1
        and "booking_lifecycle_events"."reason_code" is null
        and "booking_lifecycle_events"."before_start_at" is null
        and "booking_lifecycle_events"."before_end_at" is null
        and "booking_lifecycle_events"."before_time_zone" is null
        and "booking_lifecycle_events"."after_start_at" is not null
        and "booking_lifecycle_events"."after_end_at" is not null
        and "booking_lifecycle_events"."after_time_zone" is not null
      ) or (
        "booking_lifecycle_events"."event_kind" = 'rescheduled'
        and "booking_lifecycle_events"."revision" > 1
        and "booking_lifecycle_events"."reason_code" is null
        and "booking_lifecycle_events"."before_start_at" is not null
        and "booking_lifecycle_events"."before_end_at" is not null
        and "booking_lifecycle_events"."before_time_zone" is not null
        and "booking_lifecycle_events"."after_start_at" is not null
        and "booking_lifecycle_events"."after_end_at" is not null
        and "booking_lifecycle_events"."after_time_zone" is not null
        and (
          "booking_lifecycle_events"."before_start_at", "booking_lifecycle_events"."before_end_at", "booking_lifecycle_events"."before_time_zone"
        ) is distinct from (
          "booking_lifecycle_events"."after_start_at", "booking_lifecycle_events"."after_end_at", "booking_lifecycle_events"."after_time_zone"
        )
      ) or (
        "booking_lifecycle_events"."event_kind" = 'completed'
        and "booking_lifecycle_events"."revision" > 1
        and "booking_lifecycle_events"."reason_code" is null
        and "booking_lifecycle_events"."before_start_at" is not null
        and "booking_lifecycle_events"."before_end_at" is not null
        and "booking_lifecycle_events"."before_time_zone" is not null
        and "booking_lifecycle_events"."after_start_at" is null
        and "booking_lifecycle_events"."after_end_at" is null
        and "booking_lifecycle_events"."after_time_zone" is null
      ) or (
        "booking_lifecycle_events"."event_kind" = 'cancelled'
        and "booking_lifecycle_events"."revision" > 1
        and "booking_lifecycle_events"."reason_code" is not null
        and "booking_lifecycle_events"."before_start_at" is not null
        and "booking_lifecycle_events"."before_end_at" is not null
        and "booking_lifecycle_events"."before_time_zone" is not null
        and "booking_lifecycle_events"."after_start_at" is null
        and "booking_lifecycle_events"."after_end_at" is null
        and "booking_lifecycle_events"."after_time_zone" is null
      )),
	CONSTRAINT "booking_lifecycle_events_digest_check" CHECK ("booking_lifecycle_events"."canonical_digest" ~ '^sha256:[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"state" text DEFAULT 'confirmed' NOT NULL,
	"lifecycle_revision" integer DEFAULT 0 NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"service_start_at" timestamp with time zone NOT NULL,
	"service_end_at" timestamp with time zone NOT NULL,
	"product_title_snapshot" text NOT NULL,
	"duration_minutes_snapshot" integer NOT NULL,
	"delivery_format_snapshot" text NOT NULL,
	"price_minor_snapshot" integer NOT NULL,
	"currency_snapshot" text NOT NULL,
	"time_zone_snapshot" text NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"client_data_requirements_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "bookings_id_owner_client_unique" UNIQUE("id","owner_user_id","client_user_id"),
	CONSTRAINT "bookings_reservation_unique" UNIQUE("reservation_id"),
	CONSTRAINT "bookings_state_check" CHECK ("bookings"."state" in ('hold', 'pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show', 'expired')),
	CONSTRAINT "bookings_source_check" CHECK ("bookings"."source" in ('manual', 'client_paid')),
	CONSTRAINT "bookings_hold_expiry_check" CHECK (("bookings"."state" = 'hold' and "bookings"."hold_expires_at" is not null) or ("bookings"."state" <> 'hold' and "bookings"."hold_expires_at" is null)),
	CONSTRAINT "bookings_lifecycle_revision_check" CHECK ("bookings"."lifecycle_revision" >= 0),
	CONSTRAINT "bookings_lifecycle_state_revision_check" CHECK ((
        "bookings"."state" in ('hold', 'pending_payment', 'expired')
        and "bookings"."lifecycle_revision" = 0
      ) or (
        "bookings"."state" in ('confirmed', 'completed', 'no_show')
        and "bookings"."lifecycle_revision" > 0
      ) or (
        "bookings"."state" = 'cancelled'
        and ("bookings"."lifecycle_revision" = 0 or "bookings"."lifecycle_revision" > 1)
      )),
	CONSTRAINT "bookings_service_range_check" CHECK ("bookings"."service_start_at" < "bookings"."service_end_at"),
	CONSTRAINT "bookings_product_title_length_check" CHECK (length(trim("bookings"."product_title_snapshot")) between 1 and 200),
	CONSTRAINT "bookings_duration_check" CHECK ("bookings"."duration_minutes_snapshot" between 1 and 1440),
	CONSTRAINT "bookings_delivery_format_check" CHECK ("bookings"."delivery_format_snapshot" in ('video', 'audio', 'chat', 'text', 'file', 'channel')),
	CONSTRAINT "bookings_price_check" CHECK ("bookings"."price_minor_snapshot" >= 0),
	CONSTRAINT "bookings_currency_check" CHECK ("bookings"."currency_snapshot" in ('RUB')),
	CONSTRAINT "bookings_time_zone_length_check" CHECK (length(trim("bookings"."time_zone_snapshot")) between 1 and 100),
	CONSTRAINT "bookings_policy_snapshot_check" CHECK (jsonb_typeof("bookings"."policy_snapshot") = 'object'),
	CONSTRAINT "bookings_client_data_requirements_snapshot_check" CHECK (jsonb_typeof("client_data_requirements_snapshot") = 'object' and (
    (
      "client_data_requirements_snapshot"->>'schemaVersion' = 'booking-client-data-requirements.v1'
      and jsonb_array_length(jsonb_path_query_array("client_data_requirements_snapshot", '$.keyvalue().key')) = 5
      and jsonb_path_query_array("client_data_requirements_snapshot", '$.keyvalue().key') <@ '["schemaVersion","executionMode","participantMode","requiredClientData","methods"]'::jsonb
      and "client_data_requirements_snapshot"->>'executionMode' in ('live', 'async', 'instant')
      and "client_data_requirements_snapshot"->>'participantMode' in ('solo', 'group', 'gift')
      and jsonb_typeof("client_data_requirements_snapshot"->'requiredClientData') = 'array'
      and jsonb_path_query_array("client_data_requirements_snapshot"->'requiredClientData', '$[*] ? (@.type() == "string")') = "client_data_requirements_snapshot"->'requiredClientData'
      and "client_data_requirements_snapshot"->'requiredClientData' <@ '["chart1","cities","chart2","question","event"]'::jsonb
      and jsonb_array_length("client_data_requirements_snapshot"->'requiredClientData') = (case when "client_data_requirements_snapshot"->'requiredClientData' @> '["chart1"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'requiredClientData' @> '["cities"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'requiredClientData' @> '["chart2"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'requiredClientData' @> '["question"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'requiredClientData' @> '["event"]'::jsonb then 1 else 0 end)
      and jsonb_typeof("client_data_requirements_snapshot"->'methods') = 'array'
      and jsonb_path_query_array("client_data_requirements_snapshot"->'methods', '$[*] ? (@.type() == "string")') = "client_data_requirements_snapshot"->'methods'
      and "client_data_requirements_snapshot"->'methods' <@ '["natal","forecast","synastry","child","numerology","matrix","humandesign"]'::jsonb
      and jsonb_array_length("client_data_requirements_snapshot"->'methods') = (case when "client_data_requirements_snapshot"->'methods' @> '["natal"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'methods' @> '["forecast"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'methods' @> '["synastry"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'methods' @> '["child"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'methods' @> '["numerology"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'methods' @> '["matrix"]'::jsonb then 1 else 0 end) + (case when "client_data_requirements_snapshot"->'methods' @> '["humandesign"]'::jsonb then 1 else 0 end)
    )
  ))
);
--> statement-breakpoint
CREATE TABLE "manual_calendar_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_calendar_blocks_reservation_unique" UNIQUE("reservation_id"),
	CONSTRAINT "manual_calendar_blocks_title_length_check" CHECK (length(trim("manual_calendar_blocks"."title")) between 1 and 120),
	CONSTRAINT "manual_calendar_blocks_state_check" CHECK ("manual_calendar_blocks"."state" in ('active', 'released'))
);
--> statement-breakpoint
CREATE TABLE "schedule_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"service_start_at" timestamp with time zone NOT NULL,
	"service_end_at" timestamp with time zone NOT NULL,
	"occupied_start_at" timestamp with time zone NOT NULL,
	"occupied_end_at" timestamp with time zone NOT NULL,
	"source_aggregate_id" uuid,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_reservations_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "schedule_reservations_kind_check" CHECK ("schedule_reservations"."kind" in ('booking', 'hold', 'manual_block')),
	CONSTRAINT "schedule_reservations_lifecycle_check" CHECK ("schedule_reservations"."lifecycle" in ('active', 'consumed', 'released', 'expired', 'cancelled')),
	CONSTRAINT "schedule_reservations_service_range_check" CHECK ("schedule_reservations"."service_start_at" < "schedule_reservations"."service_end_at"),
	CONSTRAINT "schedule_reservations_occupied_range_check" CHECK ("schedule_reservations"."occupied_start_at" < "schedule_reservations"."occupied_end_at" and "schedule_reservations"."occupied_start_at" <= "schedule_reservations"."service_start_at" and "schedule_reservations"."occupied_end_at" >= "schedule_reservations"."service_end_at"),
	CONSTRAINT "schedule_reservations_source_check" CHECK (("schedule_reservations"."kind" in ('booking', 'manual_block') and "schedule_reservations"."source_aggregate_id" is not null) or "schedule_reservations"."kind" = 'hold'),
	CONSTRAINT "schedule_reservations_hold_expiry_check" CHECK (("schedule_reservations"."kind" = 'hold' and "schedule_reservations"."hold_expires_at" is not null) or ("schedule_reservations"."kind" <> 'hold' and "schedule_reservations"."hold_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "idempotency_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_surface" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"command_scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_commands_api_surface_length_check" CHECK (length(trim("idempotency_commands"."api_surface")) between 1 and 100),
	CONSTRAINT "idempotency_commands_scope_length_check" CHECK (length(trim("idempotency_commands"."command_scope")) between 1 and 150),
	CONSTRAINT "idempotency_commands_key_length_check" CHECK (length("idempotency_commands"."key") between 8 and 255),
	CONSTRAINT "idempotency_commands_request_hash_check" CHECK ("idempotency_commands"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "idempotency_commands_state_check" CHECK ("idempotency_commands"."state" in ('processing', 'completed')),
	CONSTRAINT "idempotency_commands_result_state_check" CHECK (("idempotency_commands"."state" = 'processing' and "idempotency_commands"."result" is null) or ("idempotency_commands"."state" = 'completed' and jsonb_typeof("idempotency_commands"."result") = 'object'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "availability_schedules_default_owner_unique" ON "availability_schedules" USING btree ("owner_user_id") WHERE "availability_schedules"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_commands_scope_key_unique" ON "idempotency_commands" USING btree ("api_surface","actor_user_id","command_scope","key");--> statement-breakpoint
ALTER TABLE "availability_date_overrides" ADD CONSTRAINT "availability_date_overrides_schedule_owner_fk" FOREIGN KEY ("schedule_id","owner_user_id") REFERENCES "public"."availability_schedules"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_override_periods" ADD CONSTRAINT "availability_override_periods_override_schedule_owner_fk" FOREIGN KEY ("override_id","schedule_id","owner_user_id") REFERENCES "public"."availability_date_overrides"("id","schedule_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_product_assignments" ADD CONSTRAINT "availability_product_assignments_schedule_owner_fk" FOREIGN KEY ("schedule_id","owner_user_id") REFERENCES "public"."availability_schedules"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_product_assignments" ADD CONSTRAINT "availability_product_assignments_product_owner_fk" FOREIGN KEY ("product_id","owner_user_id") REFERENCES "public"."products"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_schedules" ADD CONSTRAINT "availability_schedules_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_weekly_periods" ADD CONSTRAINT "availability_weekly_periods_schedule_owner_fk" FOREIGN KEY ("schedule_id","owner_user_id") REFERENCES "public"."availability_schedules"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_lifecycle_events" ADD CONSTRAINT "booking_lifecycle_events_booking_owner_fk" FOREIGN KEY ("booking_id","owner_user_id") REFERENCES "public"."bookings"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_lifecycle_events" ADD CONSTRAINT "booking_lifecycle_events_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_reservation_owner_fk" FOREIGN KEY ("reservation_id","owner_user_id") REFERENCES "public"."schedule_reservations"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_product_owner_fk" FOREIGN KEY ("product_id","owner_user_id") REFERENCES "public"."products"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_calendar_blocks" ADD CONSTRAINT "manual_calendar_blocks_reservation_owner_fk" FOREIGN KEY ("reservation_id","owner_user_id") REFERENCES "public"."schedule_reservations"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_reservations" ADD CONSTRAINT "schedule_reservations_schedule_owner_fk" FOREIGN KEY ("schedule_id","owner_user_id") REFERENCES "public"."availability_schedules"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_commands" ADD CONSTRAINT "idempotency_commands_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_date_overrides_schedule_date_idx" ON "availability_date_overrides" USING btree ("schedule_id","local_date");--> statement-breakpoint
CREATE INDEX "availability_override_periods_override_start_idx" ON "availability_override_periods" USING btree ("override_id","start_minute");--> statement-breakpoint
CREATE INDEX "availability_product_assignments_owner_product_idx" ON "availability_product_assignments" USING btree ("owner_user_id","product_id");--> statement-breakpoint
CREATE INDEX "availability_schedules_owner_updated_idx" ON "availability_schedules" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "availability_weekly_periods_schedule_day_idx" ON "availability_weekly_periods" USING btree ("schedule_id","weekday","start_minute");--> statement-breakpoint
CREATE INDEX "booking_lifecycle_events_owner_occurred_idx" ON "booking_lifecycle_events" USING btree ("owner_user_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "bookings_owner_service_idx" ON "bookings" USING btree ("owner_user_id","service_start_at","id");--> statement-breakpoint
CREATE INDEX "bookings_owner_client_created_idx" ON "bookings" USING btree ("owner_user_id","client_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "manual_calendar_blocks_owner_state_updated_idx" ON "manual_calendar_blocks" USING btree ("owner_user_id","state","updated_at");--> statement-breakpoint
CREATE INDEX "schedule_reservations_owner_service_idx" ON "schedule_reservations" USING btree ("owner_user_id","service_start_at","service_end_at");--> statement-breakpoint
CREATE INDEX "schedule_reservations_owner_lifecycle_occupied_idx" ON "schedule_reservations" USING btree ("owner_user_id","lifecycle","occupied_start_at","occupied_end_at");--> statement-breakpoint
CREATE INDEX "schedule_reservations_hold_expiry_idx" ON "schedule_reservations" USING btree ("lifecycle","hold_expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_commands_expiry_idx" ON "idempotency_commands" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_commands_actor_created_idx" ON "idempotency_commands" USING btree ("actor_user_id","created_at");
--> statement-breakpoint
ALTER TABLE "schedule_reservations"
  ADD CONSTRAINT "schedule_reservations_active_owner_range_exclude"
  EXCLUDE USING gist (
    "owner_user_id" WITH =,
    tstzrange("occupied_start_at", "occupied_end_at", '[)') WITH &&
  ) WHERE ("lifecycle" = 'active');
--> statement-breakpoint
-- ElevenHouse booking lifecycle integrity objects: begin
CREATE OR REPLACE FUNCTION elevenhouse_reject_booking_lifecycle_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $booking_lifecycle_event_guard$
BEGIN
  RAISE EXCEPTION 'booking lifecycle events are immutable'
    USING ERRCODE = '55000';
END;
$booking_lifecycle_event_guard$;
--> statement-breakpoint
CREATE TRIGGER "booking_lifecycle_events_immutable"
BEFORE UPDATE OR DELETE ON "booking_lifecycle_events"
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_reject_booking_lifecycle_event_mutation();
--> statement-breakpoint
CREATE TRIGGER "booking_lifecycle_events_no_truncate"
BEFORE TRUNCATE ON "booking_lifecycle_events"
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_reject_booking_lifecycle_event_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_booking_lifecycle_history()
RETURNS trigger
LANGUAGE plpgsql
AS $booking_lifecycle_history_guard$
DECLARE
  target_booking bookings%ROWTYPE;
  history_count integer;
  minimum_revision integer;
  maximum_revision integer;
  first_event_kind text;
  latest_event booking_lifecycle_events%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'bookings' THEN
    target_booking := NEW;
  ELSE
    SELECT * INTO target_booking
      FROM bookings
     WHERE id = NEW.booking_id
       AND owner_user_id = NEW.owner_user_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT count(*)::integer, min(revision), max(revision),
         (array_agg(event_kind ORDER BY revision))[1]
    INTO history_count, minimum_revision, maximum_revision, first_event_kind
    FROM booking_lifecycle_events
   WHERE booking_id = target_booking.id
     AND owner_user_id = target_booking.owner_user_id;

  IF target_booking.lifecycle_revision = 0 THEN
    IF history_count <> 0 THEN
      RAISE EXCEPTION 'Booking lifecycle revision zero cannot have canonical history'
        USING ERRCODE = '23514', CONSTRAINT = 'bookings_lifecycle_history_consistency';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO latest_event
    FROM booking_lifecycle_events
   WHERE booking_id = target_booking.id
     AND owner_user_id = target_booking.owner_user_id
     AND revision = target_booking.lifecycle_revision;

  IF history_count <> target_booking.lifecycle_revision
     OR minimum_revision <> 1
     OR maximum_revision <> target_booking.lifecycle_revision
     OR first_event_kind <> 'confirmed'
     OR NOT FOUND
     OR (
       target_booking.state IN ('confirmed', 'no_show')
       AND (
         latest_event.event_kind NOT IN ('confirmed', 'rescheduled')
         OR latest_event.after_start_at IS DISTINCT FROM target_booking.service_start_at
         OR latest_event.after_end_at IS DISTINCT FROM target_booking.service_end_at
         OR latest_event.after_time_zone IS DISTINCT FROM target_booking.time_zone_snapshot
       )
     )
     OR (
       target_booking.state = 'completed'
       AND (
         latest_event.event_kind <> 'completed'
         OR latest_event.before_start_at IS DISTINCT FROM target_booking.service_start_at
         OR latest_event.before_end_at IS DISTINCT FROM target_booking.service_end_at
         OR latest_event.before_time_zone IS DISTINCT FROM target_booking.time_zone_snapshot
       )
     )
     OR (target_booking.state = 'cancelled' AND latest_event.event_kind <> 'cancelled') THEN
    RAISE EXCEPTION 'Booking lifecycle revision does not match its canonical history'
      USING ERRCODE = '23514', CONSTRAINT = 'bookings_lifecycle_history_consistency';
  END IF;
  RETURN NULL;
END;
$booking_lifecycle_history_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "bookings_lifecycle_history_consistency"
AFTER INSERT OR UPDATE ON "bookings"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_booking_lifecycle_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "booking_lifecycle_events_aggregate_consistency"
AFTER INSERT ON "booking_lifecycle_events"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_booking_lifecycle_history();
-- ElevenHouse booking lifecycle integrity objects: end
