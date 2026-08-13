CREATE TABLE "finance_client_subscription_capture_dispatch_receipts" (
	"dispatch_receipt_id" uuid PRIMARY KEY NOT NULL,
	"capture_application_receipt_id" uuid NOT NULL,
	"capture_application_digest" varchar(71) NOT NULL,
	"order_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_canonical_digest" varchar(71) NOT NULL,
	"subscription_id" uuid NOT NULL,
	"subscription_expected_version" integer NOT NULL,
	"capture_kind" text NOT NULL,
	"renewal_request_id" uuid,
	"intended_period_id" uuid,
	"source_event_id" uuid NOT NULL,
	"source_event_digest" varchar(71) NOT NULL,
	"period_id" uuid NOT NULL,
	"primary_lifecycle_event_id" uuid NOT NULL,
	"entitlement_changed_event_id" uuid NOT NULL,
	"canonical_preimage" text NOT NULL,
	"canonical_digest" varchar(71) NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"dispatched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "finance_client_subscription_capture_dispatch_capture_unique" UNIQUE("capture_application_receipt_id"),
	CONSTRAINT "finance_client_subscription_capture_dispatch_source_event_unique" UNIQUE("source_event_id"),
	CONSTRAINT "finance_client_subscription_capture_dispatch_digest_unique" UNIQUE("canonical_digest"),
	CONSTRAINT "client_subscription_capture_dispatch_receipt_capture_kind_check" CHECK (("finance_client_subscription_capture_dispatch_receipts"."capture_kind" = 'initial'
          and "finance_client_subscription_capture_dispatch_receipts"."renewal_request_id" is null
          and "finance_client_subscription_capture_dispatch_receipts"."intended_period_id" is null)
        or ("finance_client_subscription_capture_dispatch_receipts"."capture_kind" = 'renewal'
          and "finance_client_subscription_capture_dispatch_receipts"."renewal_request_id" is not null
          and "finance_client_subscription_capture_dispatch_receipts"."intended_period_id" is not null
          and "finance_client_subscription_capture_dispatch_receipts"."period_id" = "finance_client_subscription_capture_dispatch_receipts"."intended_period_id")),
	CONSTRAINT "client_subscription_capture_dispatch_receipt_output_ids_check" CHECK ("finance_client_subscription_capture_dispatch_receipts"."subscription_expected_version" >= 1
        and "finance_client_subscription_capture_dispatch_receipts"."capture_application_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "finance_client_subscription_capture_dispatch_receipts"."contract_canonical_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "finance_client_subscription_capture_dispatch_receipts"."source_event_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "finance_client_subscription_capture_dispatch_receipts"."canonical_digest" ~ '^sha256:[a-f0-9]{64}$'
        and length("finance_client_subscription_capture_dispatch_receipts"."canonical_preimage") between 1 and 32000
        and "finance_client_subscription_capture_dispatch_receipts"."dispatched_at" >= "finance_client_subscription_capture_dispatch_receipts"."captured_at"
        and "finance_client_subscription_capture_dispatch_receipts"."dispatch_receipt_id" <> "finance_client_subscription_capture_dispatch_receipts"."capture_application_receipt_id"
        and "finance_client_subscription_capture_dispatch_receipts"."source_event_id" <> "finance_client_subscription_capture_dispatch_receipts"."capture_application_receipt_id"
        and "finance_client_subscription_capture_dispatch_receipts"."primary_lifecycle_event_id" <> "finance_client_subscription_capture_dispatch_receipts"."entitlement_changed_event_id"
        and "finance_client_subscription_capture_dispatch_receipts"."period_id" <> "finance_client_subscription_capture_dispatch_receipts"."capture_application_receipt_id")
);
--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" ADD CONSTRAINT "finance_client_subscription_capture_dispatch_capture_v2_fk" FOREIGN KEY ("capture_application_receipt_id") REFERENCES "public"."finance_online_sale_capture_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" ADD CONSTRAINT "finance_client_subscription_capture_dispatch_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" ADD CONSTRAINT "finance_client_subscription_capture_dispatch_contract_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."client_subscription_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" ADD CONSTRAINT "finance_client_subscription_capture_dispatch_subscription_fk" FOREIGN KEY ("subscription_id","contract_id") REFERENCES "public"."client_subscriptions"("id","contract_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" ADD CONSTRAINT "finance_client_subscription_capture_dispatch_renewal_request_fk" FOREIGN KEY ("renewal_request_id","subscription_id","intended_period_id") REFERENCES "public"."client_subscription_renewal_requests"("id","subscription_id","intended_period_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" ADD CONSTRAINT "finance_client_subscription_capture_dispatch_intended_period_fk" FOREIGN KEY ("intended_period_id","subscription_id") REFERENCES "public"."client_subscription_periods"("id","subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" ADD CONSTRAINT "finance_client_subscription_capture_dispatch_period_fk" FOREIGN KEY ("period_id","subscription_id") REFERENCES "public"."client_subscription_periods"("id","subscription_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_finance_client_order_capture_dispatch_payload_check" CHECK ("outbox_events"."event_type" <> 'finance.client_order.capture_applied.v1' or (
        "outbox_events"."payload" = jsonb_build_object(
          'captureApplicationReceiptId',
          "outbox_events"."aggregate_id"::text
        )
      ));
--> statement-breakpoint
create extension if not exists pgcrypto;

create or replace function finance_assert_client_subscription_capture_dispatch_receipt()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  capture_row record;
  application_row record;
  contract_row record;
  primary_event_row record;
  entitlement_event_row record;
begin
  select application.id, application.canonical_digest, intent.source_id, semantic.observed_at
    into capture_row
    from finance_online_sale_capture_applications application
    join finance_economic_payment_intents intent
      on intent.id = application.economic_payment_intent_id
    join finance_provider_semantic_facts semantic
      on semantic.id = application.semantic_fact_id
   where application.id = new.capture_application_receipt_id;
  if not found
     or capture_row.canonical_digest <> new.capture_application_digest
     or capture_row.source_id <> new.order_id::text then
    raise exception 'client subscription capture dispatch receipt capture authority is inconsistent'
      using errcode = '23514';
  end if;

  select source_event_id, source_event_digest, evidence_id, subscription_id,
         result_kind, result_version, transition_id
    into application_row
    from client_subscription_event_application_receipts
   where source_event_id = new.source_event_id;
  if not found
     or application_row.source_event_digest <> new.source_event_digest
     or application_row.evidence_id <> new.capture_application_receipt_id
     or application_row.subscription_id <> new.subscription_id
     or application_row.result_kind <> 'applied'
     or application_row.result_version <> new.subscription_expected_version + 1
     or application_row.transition_id is null then
    raise exception 'client subscription capture dispatch receipt source application authority is inconsistent'
      using errcode = '23514';
  end if;

  select id, order_id, canonical_digest
    into contract_row
    from client_subscription_contracts
   where id = new.contract_id;
  if not found
     or contract_row.order_id <> new.order_id
     or contract_row.canonical_digest <> new.contract_canonical_digest then
    raise exception 'client subscription capture dispatch receipt contract authority is inconsistent'
      using errcode = '23514';
  end if;

  if new.capture_kind = 'renewal' and not exists (
    select 1
      from client_subscription_renewal_requests
     where id = new.renewal_request_id
       and subscription_id = new.subscription_id
       and intended_period_id = new.intended_period_id
  ) then
    raise exception 'client subscription capture dispatch receipt renewal authority is inconsistent'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
      from client_subscription_periods
     where id = new.period_id
       and subscription_id = new.subscription_id
       and capture_evidence_id = new.capture_application_receipt_id
  ) then
    raise exception 'client subscription capture dispatch receipt period authority is inconsistent'
      using errcode = '23514';
  end if;

  select id, transition_id, subscription_id, contract_id, subscription_version, event_type, data
    into primary_event_row
    from client_subscription_lifecycle_events
   where id = new.primary_lifecycle_event_id;
  if not found
     or primary_event_row.subscription_id <> new.subscription_id
     or primary_event_row.contract_id <> new.contract_id
     or primary_event_row.transition_id <> application_row.transition_id
     or primary_event_row.subscription_version <> new.subscription_expected_version + 1
     or primary_event_row.data->>'periodId' <> new.period_id::text
     or (new.capture_kind = 'initial' and primary_event_row.event_type <> 'client_subscription.activated.v1')
     or (new.capture_kind = 'renewal' and primary_event_row.event_type <> 'client_subscription.period_renewed.v1') then
    raise exception 'client subscription capture dispatch receipt primary lifecycle event is inconsistent'
      using errcode = '23514';
  end if;

  select id, transition_id, subscription_id, contract_id, subscription_version, event_type, data
    into entitlement_event_row
    from client_subscription_lifecycle_events
   where id = new.entitlement_changed_event_id;
  if not found
     or entitlement_event_row.transition_id <> primary_event_row.transition_id
     or entitlement_event_row.subscription_id <> new.subscription_id
     or entitlement_event_row.contract_id <> new.contract_id
     or entitlement_event_row.subscription_version <> new.subscription_expected_version + 1
     or entitlement_event_row.event_type <> 'client_subscription.entitlement_changed.v1'
     or entitlement_event_row.data->>'scope' <> 'period'
     or entitlement_event_row.data->>'periodId' <> new.period_id::text then
    raise exception 'client subscription capture dispatch receipt entitlement event is inconsistent'
      using errcode = '23514';
  end if;

  new.captured_at := capture_row.observed_at;
  new.canonical_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
    'schemaVersion', 'finance-client-subscription-capture-dispatch-receipt.v1',
    'dispatchReceiptId', new.dispatch_receipt_id,
    'captureApplicationReceiptId', new.capture_application_receipt_id,
    'captureApplicationDigest', capture_row.canonical_digest,
    'orderId', new.order_id,
    'contractId', new.contract_id,
    'contractCanonicalDigest', contract_row.canonical_digest,
    'subscriptionId', new.subscription_id,
    'subscriptionExpectedVersion', new.subscription_expected_version,
    'applicationResultVersion', application_row.result_version,
    'transitionId', application_row.transition_id,
    'captureKind', new.capture_kind,
    'renewalRequestId', new.renewal_request_id,
    'intendedPeriodId', new.intended_period_id,
    'sourceEventId', application_row.source_event_id,
    'sourceEventDigest', application_row.source_event_digest,
    'evidenceId', application_row.evidence_id,
    'periodId', new.period_id,
    'primaryLifecycleEventId', new.primary_lifecycle_event_id,
    'entitlementChangedEventId', new.entitlement_changed_event_id,
    'capturedAt', new.captured_at
  ));
  new.canonical_digest := 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'), 'hex'
  );

  if cardinality(array[
    new.capture_application_receipt_id,
    new.order_id,
    new.contract_id,
    new.subscription_id,
    new.dispatch_receipt_id,
    new.source_event_id,
    new.period_id,
    new.primary_lifecycle_event_id,
    new.entitlement_changed_event_id
  ]) <> cardinality(array(
    select distinct value
      from unnest(array[
        new.capture_application_receipt_id,
        new.order_id,
        new.contract_id,
        new.subscription_id,
        new.dispatch_receipt_id,
        new.source_event_id,
        new.period_id,
        new.primary_lifecycle_event_id,
        new.entitlement_changed_event_id
      ]) as identities(value)
  )) then
    raise exception 'client subscription capture dispatch receipt output identities alias authority identities'
      using errcode = '23514';
  end if;

  if new.canonical_digest <> 'sha256:' || encode(
    digest(convert_to(new.canonical_preimage, 'UTF8'), 'sha256'),
    'hex'
  ) then
    raise exception 'client subscription capture dispatch receipt canonical digest is inconsistent'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger finance_issue_client_subscription_capture_dispatch_receipt
before insert on finance_client_subscription_capture_dispatch_receipts
for each row execute function finance_assert_client_subscription_capture_dispatch_receipt();

create or replace function finance_reject_client_subscription_capture_dispatch_receipt_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'finance client subscription capture dispatch receipt is immutable'
    using errcode = '23514';
end;
$$;

create trigger finance_client_subscription_capture_dispatch_receipts_immutable
before update or delete on finance_client_subscription_capture_dispatch_receipts
for each row execute function finance_reject_client_subscription_capture_dispatch_receipt_mutation();

create trigger finance_client_subscription_capture_dispatch_receipts_no_truncate
before truncate on finance_client_subscription_capture_dispatch_receipts
for each statement execute function finance_reject_client_subscription_capture_dispatch_receipt_mutation();

create or replace function finance_assert_client_subscription_capture_dispatch_installation()
returns void language plpgsql set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'client_subscription_capture_dispatch_receipt_capture_kind_check'
  ) or not exists (
    select 1 from pg_constraint
    where conname = 'client_subscription_capture_dispatch_receipt_output_ids_check'
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'finance_issue_client_subscription_capture_dispatch_receipt'
      and tgrelid = 'finance_client_subscription_capture_dispatch_receipts'::regclass
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'finance_client_subscription_capture_dispatch_receipts_immutable'
      and tgrelid = 'finance_client_subscription_capture_dispatch_receipts'::regclass
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'finance_client_subscription_capture_dispatch_receipts_no_truncate'
      and tgrelid = 'finance_client_subscription_capture_dispatch_receipts'::regclass
  ) then
    raise exception 'client subscription capture dispatch receipt integrity installation is incomplete'
      using errcode = '23514';
  end if;
end;
$$;

do $$
begin
  perform finance_assert_client_subscription_capture_dispatch_installation();
end;
$$;
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"state" text DEFAULT 'scheduled' NOT NULL,
	"lifecycle_revision" integer DEFAULT 1 NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"time_zone_snapshot" text NOT NULL,
	"product_title_snapshot" text NOT NULL,
	"provider" text DEFAULT 'livekit' NOT NULL,
	"provider_room_name" text NOT NULL,
	"latest_message_sequence" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_booking_unique" UNIQUE("booking_id"),
	CONSTRAINT "sessions_provider_room_unique" UNIQUE("provider","provider_room_name"),
	CONSTRAINT "sessions_id_owner_client_unique" UNIQUE("id","owner_user_id","client_user_id"),
	CONSTRAINT "sessions_state_check" CHECK ("sessions"."state" in ('scheduled', 'active', 'ended', 'cancelled', 'expired')),
	CONSTRAINT "sessions_lifecycle_revision_check" CHECK ("sessions"."lifecycle_revision" > 0),
	CONSTRAINT "sessions_schedule_range_check" CHECK ("sessions"."scheduled_start_at" < "sessions"."scheduled_end_at"),
	CONSTRAINT "sessions_lifecycle_evidence_check" CHECK ((
        "sessions"."state" = 'scheduled'
        and "sessions"."started_at" is null
        and "sessions"."ended_at" is null
        and "sessions"."end_reason" is null
      ) or (
        "sessions"."state" = 'active'
        and "sessions"."started_at" is not null
        and "sessions"."ended_at" is null
        and "sessions"."end_reason" is null
      ) or (
        "sessions"."state" = 'ended'
        and "sessions"."started_at" is not null
        and "sessions"."ended_at" is not null
        and "sessions"."end_reason" is not null
      ) or (
        "sessions"."state" in ('cancelled', 'expired')
        and "sessions"."started_at" is null
        and "sessions"."ended_at" is not null
        and "sessions"."end_reason" is null
      )),
	CONSTRAINT "sessions_end_reason_check" CHECK ("sessions"."end_reason" is null or "sessions"."end_reason" in ('astrologer_ended', 'participants_absent')),
	CONSTRAINT "sessions_provider_check" CHECK ("sessions"."provider" = 'livekit'),
	CONSTRAINT "sessions_provider_room_length_check" CHECK (length(trim("sessions"."provider_room_name")) between 1 and 200),
	CONSTRAINT "sessions_product_title_length_check" CHECK (length(trim("sessions"."product_title_snapshot")) between 1 and 200),
	CONSTRAINT "sessions_time_zone_length_check" CHECK (length(trim("sessions"."time_zone_snapshot")) between 1 and 100),
	CONSTRAINT "sessions_message_sequence_check" CHECK ("sessions"."latest_message_sequence" >= 0),
	CONSTRAINT "sessions_distinct_users_check" CHECK ("sessions"."owner_user_id" <> "sessions"."client_user_id")
);
--> statement-breakpoint
CREATE TABLE "session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"provider_participant_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"display_name_snapshot" text NOT NULL,
	"first_joined_at" timestamp with time zone,
	"last_joined_at" timestamp with time zone,
	"presence_state" text DEFAULT 'absent' NOT NULL,
	"presence_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_participants_session_role_unique" UNIQUE("session_id","role"),
	CONSTRAINT "session_participants_session_user_unique" UNIQUE("session_id","user_id"),
	CONSTRAINT "session_participants_provider_identity_unique" UNIQUE("provider_participant_id"),
	CONSTRAINT "session_participants_role_check" CHECK ("session_participants"."role" in ('astrologer', 'client')),
	CONSTRAINT "session_participants_presence_check" CHECK ("session_participants"."presence_state" in ('absent', 'present')),
	CONSTRAINT "session_participants_display_name_length_check" CHECK (length(trim("session_participants"."display_name_snapshot")) between 1 and 200),
	CONSTRAINT "session_participants_join_evidence_check" CHECK ("session_participants"."last_joined_at" is null or "session_participants"."first_joined_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "session_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"operation_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"sender_role" text NOT NULL,
	"request_hash" varchar(71) NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_messages_session_sequence_unique" UNIQUE("session_id","sequence"),
	CONSTRAINT "session_messages_actor_operation_unique" UNIQUE("session_id","sender_user_id","operation_id"),
	CONSTRAINT "session_messages_sequence_check" CHECK ("session_messages"."sequence" > 0),
	CONSTRAINT "session_messages_sender_role_check" CHECK ("session_messages"."sender_role" in ('astrologer', 'client')),
	CONSTRAINT "session_messages_request_hash_check" CHECK ("session_messages"."request_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "session_messages_text_length_check" CHECK (char_length("session_messages"."text") between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "session_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"kind" text NOT NULL,
	"request_hash" varchar(71) NOT NULL,
	"status" text NOT NULL,
	"safe_failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "session_commands_actor_kind_operation_unique" UNIQUE("session_id","actor_user_id","kind","operation_id"),
	CONSTRAINT "session_commands_actor_role_check" CHECK ("session_commands"."actor_role" in ('astrologer', 'client')),
	CONSTRAINT "session_commands_kind_check" CHECK ("session_commands"."kind" in ('leave', 'end')),
	CONSTRAINT "session_commands_status_check" CHECK ("session_commands"."status" in ('prepared', 'completed', 'outcome_unknown')),
	CONSTRAINT "session_commands_request_hash_check" CHECK ("session_commands"."request_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "session_commands_outcome_evidence_check" CHECK ((
        "session_commands"."status" = 'prepared' and "session_commands"."completed_at" is null and "session_commands"."safe_failure_code" is null
      ) or (
        "session_commands"."status" = 'completed' and "session_commands"."completed_at" is not null and "session_commands"."safe_failure_code" is null
      ) or (
        "session_commands"."status" = 'outcome_unknown' and "session_commands"."completed_at" is null and "session_commands"."safe_failure_code" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "session_provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_room_name" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_participant_id" uuid,
	"payload_digest" varchar(71) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"application_status" text NOT NULL,
	"safe_failure_code" text,
	CONSTRAINT "session_provider_events_provider_event_unique" UNIQUE("provider","provider_event_id"),
	CONSTRAINT "session_provider_events_provider_check" CHECK ("session_provider_events"."provider" = 'livekit'),
	CONSTRAINT "session_provider_events_type_check" CHECK ("session_provider_events"."event_type" in ('participant_joined', 'participant_left', 'room_started', 'room_finished')),
	CONSTRAINT "session_provider_events_application_status_check" CHECK ("session_provider_events"."application_status" in ('applied', 'ignored', 'failed')),
	CONSTRAINT "session_provider_events_payload_digest_check" CHECK ("session_provider_events"."payload_digest" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "session_provider_events_application_evidence_check" CHECK (("session_provider_events"."application_status" = 'failed' and "session_provider_events"."safe_failure_code" is not null) or ("session_provider_events"."application_status" <> 'failed' and "session_provider_events"."safe_failure_code" is null))
);
--> statement-breakpoint
CREATE TABLE "session_realtime_events" (
	"event_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "session_realtime_events_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message_id" uuid,
	"state" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_realtime_events_type_check" CHECK ("session_realtime_events"."type" in ('session.updated', 'message.created')),
	CONSTRAINT "session_realtime_events_state_check" CHECK ("session_realtime_events"."state" is null or "session_realtime_events"."state" in ('scheduled', 'active', 'ended', 'cancelled', 'expired')),
	CONSTRAINT "session_realtime_events_ids_only_shape_check" CHECK ((
        "session_realtime_events"."type" = 'message.created' and "session_realtime_events"."message_id" is not null and "session_realtime_events"."state" is null
      ) or (
        "session_realtime_events"."type" = 'session.updated' and "session_realtime_events"."message_id" is null and "session_realtime_events"."state" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "session_booking_lifecycle_receipts" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"outcome" text NOT NULL,
	"session_id" uuid,
	"processed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_booking_lifecycle_receipts_event_booking_owner_unique" UNIQUE("event_id","booking_id","owner_user_id"),
	CONSTRAINT "session_booking_lifecycle_receipts_revision_check" CHECK ("session_booking_lifecycle_receipts"."revision" > 0),
	CONSTRAINT "session_booking_lifecycle_receipts_outcome_check" CHECK ("session_booking_lifecycle_receipts"."outcome" in ('provisioned', 'updated', 'ignored')),
	CONSTRAINT "session_booking_lifecycle_receipts_session_evidence_check" CHECK ("session_booking_lifecycle_receipts"."outcome" = 'ignored' or "session_booking_lifecycle_receipts"."session_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "flow_versions" DROP CONSTRAINT "flow_versions_capability_manifest_schema_check";--> statement-breakpoint
ALTER TABLE "flow_run_events" DROP CONSTRAINT "flow_run_events_summary_schema_check";--> statement-breakpoint
ALTER TABLE "flow_runtime_events" DROP CONSTRAINT "flow_runtime_events_normalized_shape_check";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_booking_owner_client_fk" FOREIGN KEY ("booking_id","owner_user_id","client_user_id") REFERENCES "public"."bookings"("id","owner_user_id","client_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_commands" ADD CONSTRAINT "session_commands_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_commands" ADD CONSTRAINT "session_commands_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_provider_events" ADD CONSTRAINT "session_provider_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_realtime_events" ADD CONSTRAINT "session_realtime_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_booking_lifecycle_receipts" ADD CONSTRAINT "session_booking_lifecycle_receipts_event_booking_owner_fk" FOREIGN KEY ("event_id","booking_id","owner_user_id") REFERENCES "public"."booking_lifecycle_events"("id","booking_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_owner_schedule_idx" ON "sessions" USING btree ("owner_user_id","scheduled_start_at","id");--> statement-breakpoint
CREATE INDEX "sessions_client_schedule_idx" ON "sessions" USING btree ("client_user_id","scheduled_start_at","id");--> statement-breakpoint
CREATE INDEX "sessions_state_schedule_idx" ON "sessions" USING btree ("state","scheduled_end_at","id");--> statement-breakpoint
CREATE INDEX "session_participants_user_session_idx" ON "session_participants" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX "session_messages_session_created_idx" ON "session_messages" USING btree ("session_id","created_at","id");--> statement-breakpoint
CREATE INDEX "session_commands_status_updated_idx" ON "session_commands" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "session_provider_events_room_occurred_idx" ON "session_provider_events" USING btree ("provider_room_name","occurred_at","id");--> statement-breakpoint
CREATE INDEX "session_realtime_events_session_event_idx" ON "session_realtime_events" USING btree ("session_id","event_id");--> statement-breakpoint
CREATE INDEX "session_booking_lifecycle_receipts_booking_revision_idx" ON "session_booking_lifecycle_receipts" USING btree ("booking_id","revision");--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_capability_manifest_schema_check" CHECK ((
  source_revision > 0
  AND graph_schema_version = 'flow-graph.v2'
  AND (
    jsonb_typeof(graph) = 'object'
    AND graph ?& ARRAY['schemaVersion', 'nodes', 'edges']::text[]
    AND graph - ARRAY['schemaVersion', 'nodes', 'edges']::text[] = '{}'::jsonb
    AND jsonb_typeof(graph->'schemaVersion') = 'string'
    AND graph->>'schemaVersion' = 'flow-graph.v2'
    AND CASE
    WHEN jsonb_typeof(graph->'nodes') = 'array' THEN
      jsonb_array_length(graph->'nodes') BETWEEN 1 AND 200
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*] ? (@.type() == "object")'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].id'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].kind'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].displayTitle'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].configSchemaVersion'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].executorContractVersion'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].config'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].id ? (@.type() == "string")'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].kind ? (@.type() == "string")'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].displayTitle ? (@.type() == "string")'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].configSchemaVersion ? (@.type() == "number")'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_path_query_array(graph->'nodes', '$[*].configSchemaVersion') <@ '[1]'::jsonb
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].executorContractVersion ? (@.type() == "number")'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_path_query_array(graph->'nodes', '$[*].executorContractVersion') <@ '[1]'::jsonb
      AND jsonb_array_length(jsonb_path_query_array(graph->'nodes', '$[*].config ? (@.type() == "object")'))
        = jsonb_array_length(graph->'nodes')
      AND jsonb_path_query_array(graph->'nodes', '$[*].keyvalue().key') <@ '["id","kind","displayTitle","configSchemaVersion","executorContractVersion","config"]'::jsonb
      AND jsonb_path_query_array(graph->'nodes', '$[*].kind') <@ '["booking_confirmed","manual_client","new_lead","free_product_received","product_purchased","first_inbound_message","astro_event","client_lifecycle_changed","schedule_time","review_received","subscription_event","birth_data_available","natal_chart_request","natal_chart_ai_draft","send_message","astrologer_work_item","astrologer_approval","completed","suppressed","failed"]'::jsonb
    ELSE FALSE
  END
    AND CASE
    WHEN jsonb_typeof(graph->'edges') = 'array' THEN
      jsonb_array_length(graph->'edges') BETWEEN 0 AND 400
      AND jsonb_array_length(jsonb_path_query_array(graph->'edges', '$[*] ? (@.type() == "object")'))
        = jsonb_array_length(graph->'edges')
      AND jsonb_array_length(jsonb_path_query_array(graph->'edges', '$[*].id'))
        = jsonb_array_length(graph->'edges')
      AND jsonb_array_length(jsonb_path_query_array(graph->'edges', '$[*].sourceNodeId'))
        = jsonb_array_length(graph->'edges')
      AND jsonb_array_length(jsonb_path_query_array(graph->'edges', '$[*].targetNodeId'))
        = jsonb_array_length(graph->'edges')
      AND jsonb_array_length(jsonb_path_query_array(graph->'edges', '$[*].sourceHandle'))
        = jsonb_array_length(graph->'edges')
      AND jsonb_array_length(jsonb_path_query_array(graph->'edges', '$[*].id ? (@.type() == "string")'))
        = jsonb_array_length(graph->'edges')
      AND jsonb_array_length(jsonb_path_query_array(graph->'edges', '$[*].sourceNodeId ? (@.type() == "string")'))
        = jsonb_array_length(graph->'edges')
      AND jsonb_array_length(jsonb_path_query_array(graph->'edges', '$[*].targetNodeId ? (@.type() == "string")'))
        = jsonb_array_length(graph->'edges')
      AND jsonb_array_length(jsonb_path_query_array(graph->'edges', '$[*].sourceHandle ? (@.type() == "string")'))
        = jsonb_array_length(graph->'edges')
      AND jsonb_path_query_array(graph->'edges', '$[*].keyvalue().key') <@ '["id","sourceNodeId","targetNodeId","sourceHandle"]'::jsonb
      AND jsonb_path_query_array(graph->'edges', '$[*].sourceHandle') <@ '["next","true","false","success","error","timeout","approved","rejected"]'::jsonb
    ELSE FALSE
  END
  )
  AND jsonb_typeof(capability_manifest) = 'object'
  AND capability_manifest->>'schemaVersion' = 'flow-capability-manifest.v2'
          AND capability_manifest ?& ARRAY[
            'schemaVersion', 'executionSemanticsVersion', 'triggerMatcher', 'nodeExecutors',
            'requiredCapabilities'
          ]::text[]
          AND capability_manifest - ARRAY[
            'schemaVersion', 'executionSemanticsVersion', 'triggerMatcher', 'nodeExecutors',
            'requiredCapabilities'
          ]::text[] = '{}'::jsonb
          AND jsonb_typeof(capability_manifest->'schemaVersion') = 'string'
          AND jsonb_typeof(capability_manifest->'executionSemanticsVersion') = 'string'
          AND capability_manifest->>'executionSemanticsVersion' = 'flow-interpreter.v1'
          AND CASE
    WHEN jsonb_typeof(capability_manifest->'nodeExecutors') = 'array' THEN
      jsonb_array_length(capability_manifest->'nodeExecutors') <= 200
      AND capability_manifest->'nodeExecutors' <@ '[{"kind":"birth_data_available","configSchemaVersion":1,"executorContractVersion":1},{"kind":"natal_chart_request","configSchemaVersion":1,"executorContractVersion":1},{"kind":"natal_chart_ai_draft","configSchemaVersion":1,"executorContractVersion":1},{"kind":"send_message","configSchemaVersion":1,"executorContractVersion":1},{"kind":"astrologer_work_item","configSchemaVersion":1,"executorContractVersion":1},{"kind":"astrologer_approval","configSchemaVersion":1,"executorContractVersion":1},{"kind":"completed","configSchemaVersion":1,"executorContractVersion":1},{"kind":"suppressed","configSchemaVersion":1,"executorContractVersion":1},{"kind":"failed","configSchemaVersion":1,"executorContractVersion":1}]'::jsonb
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*].kind'))
        = jsonb_array_length(capability_manifest->'nodeExecutors')
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*].configSchemaVersion'))
        = jsonb_array_length(capability_manifest->'nodeExecutors')
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*].executorContractVersion'))
        = jsonb_array_length(capability_manifest->'nodeExecutors')
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'nodeExecutors',
        '$[*] ? (@.kind == "birth_data_available")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'nodeExecutors',
        '$[*] ? (@.kind == "natal_chart_request")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'nodeExecutors',
        '$[*] ? (@.kind == "natal_chart_ai_draft")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'nodeExecutors',
        '$[*] ? (@.kind == "send_message")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'nodeExecutors',
        '$[*] ? (@.kind == "astrologer_work_item")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'nodeExecutors',
        '$[*] ? (@.kind == "astrologer_approval")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'nodeExecutors',
        '$[*] ? (@.kind == "completed")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'nodeExecutors',
        '$[*] ? (@.kind == "suppressed")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'nodeExecutors',
        '$[*] ? (@.kind == "failed")'
      )) <= 1
    ELSE FALSE
  END
          AND CASE
    WHEN jsonb_typeof(capability_manifest->'requiredCapabilities') = 'array' THEN
      jsonb_array_length(capability_manifest->'requiredCapabilities') <= 50
      AND capability_manifest->'requiredCapabilities' <@ '["bookings.events.booking_confirmed","clients.events.new_lead","products.events.free_product_received","finance.events.client_order_captured","messaging.events.first_inbound_message","astro.events.calendar","clients.events.lifecycle_changed","schedule.events.time","reviews.events.received","subscriptions.events.changed","clients.birth_data.read.service_preparation","products.read","charts.calculate.natal.booking_context","charts.interpret.natal.ai_draft","messaging.outbound.send.existing_thread"]'::jsonb
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "bookings.events.booking_confirmed")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "clients.events.new_lead")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "products.events.free_product_received")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "finance.events.client_order_captured")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "messaging.events.first_inbound_message")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "astro.events.calendar")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "clients.events.lifecycle_changed")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "schedule.events.time")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "reviews.events.received")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "subscriptions.events.changed")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "clients.birth_data.read.service_preparation")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "products.read")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "charts.calculate.natal.booking_context")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "charts.interpret.natal.ai_draft")'
      )) <= 1
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "messaging.outbound.send.existing_thread")'
      )) <= 1
    ELSE FALSE
  END
          AND jsonb_typeof(capability_manifest->'triggerMatcher') = 'object'
          AND (capability_manifest->'triggerMatcher') ?& ARRAY[
            'kind', 'configSchemaVersion', 'matcherContractVersion', 'eventSchemaVersion'
          ]::text[]
          AND (capability_manifest->'triggerMatcher') - ARRAY[
            'kind', 'configSchemaVersion', 'matcherContractVersion', 'eventSchemaVersion'
          ]::text[] = '{}'::jsonb
          AND jsonb_typeof(capability_manifest->'triggerMatcher'->'kind') = 'string'
          AND capability_manifest->'triggerMatcher'->>'kind'
            IN ('booking_confirmed', 'manual_client', 'new_lead', 'free_product_received', 'product_purchased', 'first_inbound_message', 'astro_event', 'client_lifecycle_changed', 'schedule_time', 'review_received', 'subscription_event')
          AND jsonb_typeof(
            capability_manifest->'triggerMatcher'->'configSchemaVersion'
          ) = 'number'
          AND capability_manifest->'triggerMatcher'->>'configSchemaVersion' = '1'
          AND jsonb_typeof(
            capability_manifest->'triggerMatcher'->'matcherContractVersion'
          ) = 'number'
          AND capability_manifest->'triggerMatcher'->>'matcherContractVersion' = '1'
          AND jsonb_typeof(
            capability_manifest->'triggerMatcher'->'eventSchemaVersion'
          ) = 'number'
          AND capability_manifest->'triggerMatcher'->>'eventSchemaVersion' = '1'

) IS TRUE);--> statement-breakpoint
ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_summary_schema_check" CHECK ((
        "flow_run_events"."event_type" = 'run_enrolled'
        and "flow_run_events"."node_id" is not null
        and "flow_run_events"."attempt_id" is null
        and "flow_run_events"."command_id" is null
        and "flow_run_events"."summary" ?& array[
          'schemaVersion', 'outcome', 'reasonCode', 'resultCode', 'eventKind',
          'activationEpochId', 'triggerNodeId', 'targetNodeId', 'targetNodeKind',
          'enrollmentPolicyKey', 'occurrenceKey'
        ]::text[]
        and "flow_run_events"."summary" - array[
          'schemaVersion', 'outcome', 'reasonCode', 'resultCode', 'eventKind',
          'activationEpochId', 'triggerNodeId', 'targetNodeId', 'targetNodeKind',
          'enrollmentPolicyKey', 'occurrenceKey'
        ]::text[] = '{}'::jsonb
        and jsonb_typeof("flow_run_events"."summary"->'schemaVersion') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'outcome') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'reasonCode') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'resultCode') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'eventKind') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'activationEpochId') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'triggerNodeId') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'enrollmentPolicyKey') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'occurrenceKey') = 'string'
        and "flow_run_events"."summary"->>'schemaVersion' = 'flow-enrollment-trace.v1'
        and "flow_run_events"."summary"->>'outcome' = 'enrolled'
        and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_TRIGGER_MATCHED'
        and "flow_run_events"."summary"->>'resultCode' = 'FLOW_RUN_ENROLLED'
        and "flow_run_events"."summary"->>'eventKind' in ('booking_confirmed', 'manual_client', 'new_lead', 'free_product_received', 'product_purchased', 'first_inbound_message', 'astro_event', 'client_lifecycle_changed', 'schedule_time', 'review_received', 'subscription_event')
        and "flow_run_events"."summary"->>'triggerNodeId' = "flow_run_events"."node_id"
        and length("flow_run_events"."summary"->>'triggerNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'triggerNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'send_message', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
        and "flow_run_events"."summary"->>'enrollmentPolicyKey' in ('once_per_occurrence', 'once_per_client', 'each_occurrence', 'after_previous_terminal')
        and length("flow_run_events"."summary"->>'occurrenceKey') between 1 and 180
      ) or (
        "flow_run_events"."event_type" <> 'run_enrolled'
        and "flow_run_events"."summary" ?& array[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[]
        and (
          (
            "flow_run_events"."event_type" = 'token_advanced'
            and "flow_run_events"."summary" ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and jsonb_typeof("flow_run_events"."summary"->'sourceHandle') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'selectedEdgeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
          ) or (
            "flow_run_events"."event_type" = 'token_advanced'
            and "flow_run_events"."summary" ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind',
              'sourceOutboxEventId', 'birthDataHistoryId', 'birthDataRevision',
              'workItemId', 'fromRevision', 'toRevision'
            ]::text[]
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind',
              'sourceOutboxEventId', 'birthDataHistoryId', 'birthDataRevision',
              'workItemId', 'fromRevision', 'toRevision'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof("flow_run_events"."summary"->'sourceHandle') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'selectedEdgeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'sourceOutboxEventId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'birthDataHistoryId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'birthDataRevision') = 'number'
            and jsonb_typeof("flow_run_events"."summary"->'workItemId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'fromRevision') = 'number'
            and jsonb_typeof("flow_run_events"."summary"->'toRevision') = 'number'
            and "flow_run_events"."summary"->>'sourceOutboxEventId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and "flow_run_events"."summary"->>'birthDataHistoryId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and "flow_run_events"."summary"->>'workItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and scale(("flow_run_events"."summary"->>'birthDataRevision')::numeric) = 0
            and ("flow_run_events"."summary"->>'birthDataRevision')::numeric between 1 and 2147483647
            and scale(("flow_run_events"."summary"->>'fromRevision')::numeric) = 0
            and scale(("flow_run_events"."summary"->>'toRevision')::numeric) = 0
            and ("flow_run_events"."summary"->>'fromRevision')::numeric between 1 and 2147483646
            and ("flow_run_events"."summary"->>'toRevision')::numeric =
              ("flow_run_events"."summary"->>'fromRevision')::numeric + 1
          )
          or (
            "flow_run_events"."event_type" = 'token_signaled'
            and "flow_run_events"."summary" ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and jsonb_typeof("flow_run_events"."summary"->'sourceHandle') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'selectedEdgeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
          )
          or (
            "flow_run_events"."event_type" = 'work_item_available'
            and "flow_run_events"."summary" ?& array[
              'workItemId', 'fromRevision', 'toRevision', 'scheduledFor'
            ]::text[]
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'workItemId', 'fromRevision', 'toRevision', 'scheduledFor'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof("flow_run_events"."summary"->'workItemId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'fromRevision') = 'number'
            and jsonb_typeof("flow_run_events"."summary"->'toRevision') = 'number'
            and jsonb_typeof("flow_run_events"."summary"->'scheduledFor') = 'string'
            and "flow_run_events"."summary"->>'workItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and scale(("flow_run_events"."summary"->>'fromRevision')::numeric) = 0
            and scale(("flow_run_events"."summary"->>'toRevision')::numeric) = 0
            and ("flow_run_events"."summary"->>'fromRevision')::numeric between 1 and 2147483646
            and ("flow_run_events"."summary"->>'toRevision')::numeric =
              ("flow_run_events"."summary"->>'fromRevision')::numeric + 1
            and length("flow_run_events"."summary"->>'scheduledFor') between 20 and 35
          )
          or (
            "flow_run_events"."event_type" = 'approval_expired'
            and "flow_run_events"."summary" ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof("flow_run_events"."summary"->'sourceHandle') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'selectedEdgeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeId') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'targetNodeKind') = 'string'
          )
          or (
            "flow_run_events"."event_type" = 'booking_rescheduled'
            and "flow_run_events"."summary" ?& array[
              'bookingId', 'bookingLifecycleRevision',
              'previousStartAt', 'previousEndAt', 'previousTimeZone',
              'currentStartAt', 'currentEndAt', 'currentTimeZone',
              'workItemId', 'fromRevision', 'toRevision',
              'previousWorkItemStatus', 'currentWorkItemStatus',
              'previousDueAt', 'currentDueAt',
              'previousSnoozedUntil', 'currentSnoozedUntil', 'snoozeAdjustment'
            ]::text[]
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'bookingId', 'bookingLifecycleRevision',
              'previousStartAt', 'previousEndAt', 'previousTimeZone',
              'currentStartAt', 'currentEndAt', 'currentTimeZone',
              'workItemId', 'fromRevision', 'toRevision',
              'previousWorkItemStatus', 'currentWorkItemStatus',
              'previousDueAt', 'currentDueAt',
              'previousSnoozedUntil', 'currentSnoozedUntil', 'snoozeAdjustment'
            ]::text[] = '{}'::jsonb
            and jsonb_typeof("flow_run_events"."summary"->'bookingId') = 'string'
            and "flow_run_events"."summary"->>'bookingId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and jsonb_typeof("flow_run_events"."summary"->'bookingLifecycleRevision') = 'number'
            and scale(("flow_run_events"."summary"->>'bookingLifecycleRevision')::numeric) = 0
            and ("flow_run_events"."summary"->>'bookingLifecycleRevision')::numeric
                  between 1 and 2147483647
            and jsonb_typeof("flow_run_events"."summary"->'previousStartAt') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'previousEndAt') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'previousTimeZone') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'currentStartAt') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'currentEndAt') = 'string'
            and jsonb_typeof("flow_run_events"."summary"->'currentTimeZone') = 'string'
            and ("flow_run_events"."summary"->>'previousStartAt')::timestamptz <
                  ("flow_run_events"."summary"->>'previousEndAt')::timestamptz
            and ("flow_run_events"."summary"->>'currentStartAt')::timestamptz <
                  ("flow_run_events"."summary"->>'currentEndAt')::timestamptz
            and length(trim("flow_run_events"."summary"->>'previousTimeZone')) between 1 and 120
            and length(trim("flow_run_events"."summary"->>'currentTimeZone')) between 1 and 120
            and (
              ("flow_run_events"."summary"->>'previousStartAt')::timestamptz IS DISTINCT FROM
                ("flow_run_events"."summary"->>'currentStartAt')::timestamptz
              or ("flow_run_events"."summary"->>'previousEndAt')::timestamptz IS DISTINCT FROM
                ("flow_run_events"."summary"->>'currentEndAt')::timestamptz
              or "flow_run_events"."summary"->>'previousTimeZone' IS DISTINCT FROM
                "flow_run_events"."summary"->>'currentTimeZone'
            )
            and (
              (
                jsonb_typeof("flow_run_events"."summary"->'workItemId') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'fromRevision') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'toRevision') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'previousWorkItemStatus') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'currentWorkItemStatus') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'previousDueAt') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'currentDueAt') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'previousSnoozedUntil') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'currentSnoozedUntil') = 'null'
                and jsonb_typeof("flow_run_events"."summary"->'snoozeAdjustment') = 'null'
              ) or (
                jsonb_typeof("flow_run_events"."summary"->'workItemId') = 'string'
                and "flow_run_events"."summary"->>'workItemId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                and jsonb_typeof("flow_run_events"."summary"->'fromRevision') = 'number'
                and jsonb_typeof("flow_run_events"."summary"->'toRevision') = 'number'
                and scale(("flow_run_events"."summary"->>'fromRevision')::numeric) = 0
                and scale(("flow_run_events"."summary"->>'toRevision')::numeric) = 0
                and ("flow_run_events"."summary"->>'fromRevision')::numeric between 1 and 2147483646
                and ("flow_run_events"."summary"->>'toRevision')::numeric =
                      ("flow_run_events"."summary"->>'fromRevision')::numeric + 1
                and jsonb_typeof("flow_run_events"."summary"->'previousWorkItemStatus') = 'string'
                and jsonb_typeof("flow_run_events"."summary"->'currentWorkItemStatus') = 'string'
                and "flow_run_events"."summary"->>'previousWorkItemStatus' in (
                  'pending', 'in_progress', 'snoozed'
                )
                and "flow_run_events"."summary"->>'currentWorkItemStatus' in (
                  'pending', 'in_progress', 'snoozed'
                )
                and jsonb_typeof("flow_run_events"."summary"->'previousDueAt') = 'string'
                and jsonb_typeof("flow_run_events"."summary"->'currentDueAt') = 'string'
                and jsonb_typeof("flow_run_events"."summary"->'previousSnoozedUntil') in ('null', 'string')
                and jsonb_typeof("flow_run_events"."summary"->'currentSnoozedUntil') in ('null', 'string')
                and jsonb_typeof("flow_run_events"."summary"->'snoozeAdjustment') = 'string'
                and "flow_run_events"."summary"->>'snoozeAdjustment' in ('unchanged', 'shortened', 'woken')
                and (
                  ("flow_run_events"."summary"->>'previousWorkItemStatus' = 'snoozed') =
                    (jsonb_typeof("flow_run_events"."summary"->'previousSnoozedUntil') = 'string')
                )
                and (
                  ("flow_run_events"."summary"->>'currentWorkItemStatus' = 'snoozed') =
                    (jsonb_typeof("flow_run_events"."summary"->'currentSnoozedUntil') = 'string')
                )
                and (
                  (
                    "flow_run_events"."summary"->>'snoozeAdjustment' = 'unchanged'
                    and "flow_run_events"."summary"->>'previousWorkItemStatus' =
                          "flow_run_events"."summary"->>'currentWorkItemStatus'
                    and "flow_run_events"."summary"->'previousSnoozedUntil' =
                          "flow_run_events"."summary"->'currentSnoozedUntil'
                    and (
                      "flow_run_events"."summary"->>'currentWorkItemStatus' <> 'snoozed'
                      or ("flow_run_events"."summary"->>'currentDueAt')::timestamptz >=
                           ("flow_run_events"."summary"->>'currentSnoozedUntil')::timestamptz
                    )
                  ) or (
                    "flow_run_events"."summary"->>'snoozeAdjustment' = 'shortened'
                    and "flow_run_events"."summary"->>'previousWorkItemStatus' = 'snoozed'
                    and "flow_run_events"."summary"->>'currentWorkItemStatus' = 'snoozed'
                    and ("flow_run_events"."summary"->>'currentSnoozedUntil')::timestamptz =
                          ("flow_run_events"."summary"->>'currentDueAt')::timestamptz
                    and ("flow_run_events"."summary"->>'currentSnoozedUntil')::timestamptz <
                          ("flow_run_events"."summary"->>'previousSnoozedUntil')::timestamptz
                  ) or (
                    "flow_run_events"."summary"->>'snoozeAdjustment' = 'woken'
                    and "flow_run_events"."summary"->>'previousWorkItemStatus' = 'snoozed'
                    and "flow_run_events"."summary"->>'currentWorkItemStatus' = 'pending'
                    and jsonb_typeof("flow_run_events"."summary"->'previousSnoozedUntil') = 'string'
                    and jsonb_typeof("flow_run_events"."summary"->'currentSnoozedUntil') = 'null'
                  )
                )
              )
            )
          )
          or (
            "flow_run_events"."event_type" not in (
              'token_advanced', 'token_signaled', 'work_item_available', 'approval_expired',
              'booking_rescheduled'
            )
            and "flow_run_events"."summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
            ]::text[] = '{}'::jsonb
          )
        )
        and jsonb_typeof("flow_run_events"."summary"->'schemaVersion') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'outcome') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'nodeKind') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'reasonCode') = 'string'
        and jsonb_typeof("flow_run_events"."summary"->'resultCode') = 'string'
        and "flow_run_events"."summary"->>'schemaVersion' = 'flow-runtime-trace.v1'
        and "flow_run_events"."summary"->>'nodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'send_message', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
        and length("flow_run_events"."summary"->>'resultCode') between 1 and 160
        and "flow_run_events"."summary"->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        and (
          (
            "flow_run_events"."event_type" = 'token_advanced'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'send_message', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
            and length("flow_run_events"."summary"->>'selectedEdgeId') between 1 and 160
            and "flow_run_events"."summary"->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
            and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and (
              (
                "flow_run_events"."attempt_id" is not null
                and "flow_run_events"."command_id" is null
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_EDGE_SELECTED'
                and "flow_run_events"."summary"->>'sourceHandle' in ('next', 'true', 'false', 'success', 'error', 'timeout', 'approved', 'rejected')
              ) or (
                "flow_run_events"."attempt_id" is null
                and "flow_run_events"."command_id" is not null
                and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_work_item'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_WORK_ITEM_COMPLETED'
                and "flow_run_events"."summary"->>'sourceHandle' = 'success'
              ) or (
                "flow_run_events"."attempt_id" is null
                and "flow_run_events"."command_id" is not null
                and "flow_run_events"."summary"->>'nodeKind' in ('astrologer_approval', 'natal_chart_ai_draft')
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_APPROVAL_DECIDED'
                and "flow_run_events"."summary"->>'sourceHandle' in ('approved', 'rejected')
              ) or (
                "flow_run_events"."attempt_id" is null
                and "flow_run_events"."command_id" is null
                and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_work_item'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_BIRTH_PROFILE_RECHECK_READY'
                and "flow_run_events"."summary"->>'sourceHandle' = 'success'
              )
            )
          )
          or
          (
            "flow_run_events"."event_type" = 'token_signaled'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'send_message', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
            and length("flow_run_events"."summary"->>'selectedEdgeId') between 1 and 160
            and "flow_run_events"."summary"->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
            and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and (
              (
                "flow_run_events"."summary"->>'nodeKind' = 'natal_chart_request'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_CHART_CALCULATION_COMPLETED'
                and "flow_run_events"."summary"->>'sourceHandle' = 'next'
              ) or (
                "flow_run_events"."summary"->>'nodeKind' = 'send_message'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_MESSAGING_DELIVERY_COMPLETED'
                and "flow_run_events"."summary"->>'sourceHandle' in ('success', 'error')
              )
            )
          )
          or
          (
            "flow_run_events"."event_type" = 'work_item_available'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_work_item'
            and "flow_run_events"."summary"->>'outcome' = 'available'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_WORK_ITEM_SNOOZE_ELAPSED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_WORK_ITEM_AVAILABLE'
          )
          or
          (
            "flow_run_events"."event_type" = 'approval_available'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'nodeKind' in ('astrologer_approval', 'natal_chart_ai_draft')
            and "flow_run_events"."summary"->>'outcome' = 'available'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_APPROVAL_SNOOZE_ELAPSED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_APPROVAL_AVAILABLE'
          )
          or
          (
            "flow_run_events"."event_type" = 'approval_expired'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'nodeKind' in ('astrologer_approval', 'natal_chart_ai_draft')
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_APPROVAL_EXPIRED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'sourceHandle' = 'timeout'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'send_message', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
            and length("flow_run_events"."summary"->>'selectedEdgeId') between 1 and 160
            and "flow_run_events"."summary"->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
            and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          )
          or
          (
            "flow_run_events"."event_type" = 'booking_rescheduled'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."booking_lifecycle_event_id" is not null
            and "flow_run_events"."summary"->>'outcome' = 'rescheduled'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_BOOKING_RESCHEDULED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_BOOKING_SCHEDULE_UPDATED'
          )
          or
          (
            "flow_run_events"."event_type" = 'token_waiting'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."attempt_id" is not null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'outcome' = 'waiting'
            and (
              (
                "flow_run_events"."summary"->>'nodeKind' = 'astrologer_work_item'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_WORK_ITEM_CREATED'
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_WAITING_WORK_ITEM'
              ) or (
                "flow_run_events"."summary"->>'nodeKind' = 'natal_chart_request'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_CHART_CALCULATION_REQUESTED'
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_WAITING_SIGNAL'
              ) or (
                "flow_run_events"."summary"->>'nodeKind' = 'send_message'
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_MESSAGING_DELIVERY_REQUESTED'
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_WAITING_EXTERNAL'
              ) or (
                "flow_run_events"."summary"->>'nodeKind' in ('astrologer_approval', 'natal_chart_ai_draft')
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_APPROVAL_CREATED'
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_WAITING_APPROVAL'
              )
            )
          )
          or
          (
            "flow_run_events"."event_type" = 'run_completed'
            and "flow_run_events"."attempt_id" is not null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'nodeKind' in ('completed', 'suppressed', 'failed')
            and "flow_run_events"."summary"->>'outcome' = 'terminal'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_GOAL_REACHED'
          )
          or (
            "flow_run_events"."event_type" = 'token_lease_expired'
            and "flow_run_events"."attempt_id" is not null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'outcome' = 'lease_expired'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          )
          or (
            "flow_run_events"."event_type" = 'run_canceled'
            and "flow_run_events"."summary"->>'outcome' = 'canceled'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_RUN_CANCELED'
            and (
              (
                "flow_run_events"."command_id" is not null
                and "flow_run_events"."booking_lifecycle_event_id" is null
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
              ) or (
                "flow_run_events"."command_id" is null
                and "flow_run_events"."booking_lifecycle_event_id" is not null
                and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_BOOKING_CANCELED'
              )
            )
          )
          or (
            "flow_run_events"."event_type" = 'token_retry_scheduled'
            and "flow_run_events"."attempt_id" is not null
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'outcome' = 'retry_scheduled'
            and "flow_run_events"."summary"->>'reasonCode' in ('FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE')
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
          )
          or (
            "flow_run_events"."event_type" = 'run_failed'
            and "flow_run_events"."command_id" is null
            and "flow_run_events"."summary"->>'outcome' = 'failed'
            and (
              (
                "flow_run_events"."summary"->>'reasonCode' in ('FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID', 'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH', 'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID', 'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE', 'FLOW_NODE_EXECUTION_REJECTED', 'FLOW_CHART_CALCULATION_FAILED')
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
              )
              or (
                "flow_run_events"."summary"->>'reasonCode' in ('FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE', 'FLOW_TOKEN_LEASE_EXPIRED')
                and "flow_run_events"."summary"->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
              )
            )
          )
        )
      ));--> statement-breakpoint
ALTER TABLE "flow_runtime_events" ADD CONSTRAINT "flow_runtime_events_normalized_shape_check" CHECK ((
        "flow_runtime_events"."event_kind" is null
        and "flow_runtime_events"."occurrence_key" is null
        and "flow_runtime_events"."payload_schema_version" is null
        and "flow_runtime_events"."payload_digest" is null
        and "flow_runtime_events"."classification" is null
        and "flow_runtime_events"."redaction_version" is null
        and "flow_runtime_events"."retention_policy_id" is null
        and "flow_runtime_events"."ingestion_outcome" is null
        and "flow_runtime_events"."processed_at" is null
      ) or (
        "flow_runtime_events"."event_kind" in ('booking_confirmed', 'manual_client', 'new_lead', 'free_product_received', 'product_purchased', 'first_inbound_message', 'astro_event', 'client_lifecycle_changed', 'schedule_time', 'review_received', 'subscription_event')
        and length(trim("flow_runtime_events"."occurrence_key")) between 1 and 180
        and "flow_runtime_events"."payload_schema_version" = 1
        and "flow_runtime_events"."payload_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_runtime_events"."classification" in ('personal')
        and "flow_runtime_events"."redaction_version" = 1
        and length(trim("flow_runtime_events"."retention_policy_id")) between 1 and 180
        and "flow_runtime_events"."ingestion_outcome" in ('enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed')
        and "flow_runtime_events"."processed_at" is not null
      ));