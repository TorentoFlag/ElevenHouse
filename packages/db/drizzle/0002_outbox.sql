CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claim_fence" bigint DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"quarantined_at" timestamp with time zone,
	"quarantine_reason_code" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_status_check" CHECK ("outbox_events"."status" in ('pending', 'publishing', 'published', 'quarantined')),
	CONSTRAINT "outbox_events_attempts_check" CHECK ("outbox_events"."attempts" >= 0),
	CONSTRAINT "outbox_events_claim_fence_check" CHECK ("outbox_events"."claim_fence" >= 0),
	CONSTRAINT "outbox_events_finance_dispatch_payload_check" CHECK ("outbox_events"."event_type" <> 'finance.provider_operation.dispatch_requested' or (
        "outbox_events"."payload" = jsonb_build_object(
          'providerOperationIntentId',
          "outbox_events"."aggregate_id"::text
        )
      )),
	CONSTRAINT "outbox_events_finance_capture_payload_check" CHECK ("outbox_events"."event_type" <> 'finance.economic_payment.capture_applied' or (
        "outbox_events"."payload" = jsonb_build_object(
          'captureApplicationReceiptId',
          "outbox_events"."aggregate_id"::text
        )
      )),
	CONSTRAINT "outbox_events_finance_saved_card_setup_preparation_payload_check" CHECK ("outbox_events"."event_type" <> 'finance.saved_card_setup.preparation_requested' or (
        "outbox_events"."payload" = jsonb_build_object(
          'setupSessionId',
          "outbox_events"."aggregate_id"::text
        )
      )),
	CONSTRAINT "outbox_events_finance_platform_tariff_invoice_charge_preparation_payload_check" CHECK ("outbox_events"."event_type" <> 'finance.platform_tariff_invoice_charge.preparation_requested' or (
        "outbox_events"."payload" = jsonb_build_object(
          'preparationRequestId',
          "outbox_events"."aggregate_id"::text
        )
      )),
	CONSTRAINT "outbox_events_booking_lifecycle_dispatch_payload_check" CHECK ("outbox_events"."event_type" <> 'bookings.lifecycle_event.dispatch_requested.v1' or (
        "outbox_events"."payload" = jsonb_build_object(
          'schemaVersion', 'booking-lifecycle-event-dispatch-request.v1',
          'lifecycleEventId', "outbox_events"."aggregate_id"::text
        )
      )),
	CONSTRAINT "outbox_events_quarantine_reason_code_check" CHECK ("outbox_events"."quarantine_reason_code" is null or (
        length("outbox_events"."quarantine_reason_code") between 3 and 120
        and "outbox_events"."quarantine_reason_code" ~ '^[A-Z][A-Z0-9_]+$'
      )),
	CONSTRAINT "outbox_events_state_check" CHECK ((
        "outbox_events"."status" = 'pending'
        and "outbox_events"."locked_at" is null
        and "outbox_events"."published_at" is null
        and "outbox_events"."quarantined_at" is null
        and "outbox_events"."quarantine_reason_code" is null
      ) or (
        "outbox_events"."status" = 'publishing'
        and "outbox_events"."locked_at" is not null
        and "outbox_events"."published_at" is null
        and "outbox_events"."quarantined_at" is null
        and "outbox_events"."quarantine_reason_code" is null
      ) or (
        "outbox_events"."status" = 'published'
        and "outbox_events"."locked_at" is null
        and "outbox_events"."published_at" is not null
        and "outbox_events"."quarantined_at" is null
        and "outbox_events"."quarantine_reason_code" is null
      ) or (
        "outbox_events"."status" = 'quarantined'
        and "outbox_events"."locked_at" is null
        and "outbox_events"."published_at" is null
        and "outbox_events"."quarantined_at" is not null
        and "outbox_events"."quarantine_reason_code" is not null
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_type_aggregate_id_unique" ON "outbox_events" USING btree ("event_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_index" ON "outbox_events" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_locked_at_index" ON "outbox_events" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX "outbox_events_quarantined_index" ON "outbox_events" USING btree ("event_type","quarantined_at","id") WHERE "outbox_events"."status" = 'quarantined';