ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" DROP CONSTRAINT "finance_client_subscription_capture_dispatch_renewal_request_fk";--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" DROP CONSTRAINT "finance_client_subscription_capture_dispatch_intended_period_fk";--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" DROP CONSTRAINT "client_subscription_capture_dispatch_receipt_capture_kind_check";--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" DROP COLUMN "renewal_request_id";--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" DROP COLUMN "intended_period_id";--> statement-breakpoint
ALTER TABLE "finance_client_subscription_capture_dispatch_receipts" ADD CONSTRAINT "client_subscription_capture_dispatch_receipt_capture_kind_check" CHECK ("finance_client_subscription_capture_dispatch_receipts"."capture_kind" = 'initial');--> statement-breakpoint
ALTER TABLE "client_subscriptions" DROP CONSTRAINT "client_subscriptions_state_check";--> statement-breakpoint
ALTER TABLE "client_subscriptions" DROP CONSTRAINT "client_subscriptions_state_pointer_shape_check";--> statement-breakpoint
DROP INDEX "client_subscriptions_current_relationship_product_unique";--> statement-breakpoint
ALTER TABLE "client_subscriptions" DROP COLUMN "renewal_stopped_at";--> statement-breakpoint
ALTER TABLE "client_subscriptions" DROP COLUMN "renewal_request_id";--> statement-breakpoint
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_state_check" CHECK ("client_subscriptions"."state" in ('pending_initial_payment', 'active', 'ended', 'revoked'));--> statement-breakpoint
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_state_pointer_shape_check" CHECK ((
        "client_subscriptions"."state" = 'pending_initial_payment'
        and "client_subscriptions"."current_period_id" is null
        and "client_subscriptions"."future_period_id" is null
        and "client_subscriptions"."cancellation_effective_at" is null
      ) or (
        "client_subscriptions"."state" = 'active'
        and "client_subscriptions"."current_period_id" is not null
        and "client_subscriptions"."cancellation_effective_at" is null
      ) or (
        "client_subscriptions"."state" = 'ended'
        and "client_subscriptions"."current_period_id" is null
        and "client_subscriptions"."future_period_id" is null
        and "client_subscriptions"."cancellation_effective_at" is null
      ) or (
        "client_subscriptions"."state" = 'revoked'
        and "client_subscriptions"."current_period_id" is null
        and "client_subscriptions"."future_period_id" is null
        and "client_subscriptions"."cancellation_effective_at" is null
      ));--> statement-breakpoint
CREATE UNIQUE INDEX "client_subscriptions_current_relationship_product_unique" ON "client_subscriptions" USING btree ("relationship_id","product_id") WHERE "client_subscriptions"."state" in ('pending_initial_payment', 'active');--> statement-breakpoint
ALTER TABLE "client_subscription_transition_receipts" DROP CONSTRAINT "client_subscription_transition_receipts_state_check";--> statement-breakpoint
ALTER TABLE "client_subscription_transition_receipts" DROP CONSTRAINT "client_subscription_transition_receipts_entitlement_check";--> statement-breakpoint
ALTER TABLE "client_subscription_transition_receipts" DROP CONSTRAINT "client_subscription_transition_receipts_primary_event_check";--> statement-breakpoint
ALTER TABLE "client_subscription_transition_receipts" ADD CONSTRAINT "client_subscription_transition_receipts_state_check" CHECK ("client_subscription_transition_receipts"."state" in ('active', 'ended', 'revoked'));--> statement-breakpoint
ALTER TABLE "client_subscription_transition_receipts" ADD CONSTRAINT "client_subscription_transition_receipts_entitlement_check" CHECK ("client_subscription_transition_receipts"."entitlement_state" in ('active', 'ended', 'revoked')
        and "client_subscription_transition_receipts"."entitlement_scope" in ('none', 'period', 'subscription_all')
        and (
          ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.initial_payment_ended.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'none'
            and "client_subscription_transition_receipts"."period_id" is null
            and "client_subscription_transition_receipts"."entitlement_state" = 'ended'
            and "client_subscription_transition_receipts"."state" = 'ended'
            and "client_subscription_transition_receipts"."slot_effect" = 'release')
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.activated.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'period'
            and "client_subscription_transition_receipts"."period_id" is not null
            and "client_subscription_transition_receipts"."entitlement_state" = 'active'
            and "client_subscription_transition_receipts"."state" = 'active')
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.period_ended.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'period'
            and "client_subscription_transition_receipts"."period_id" is not null
            and "client_subscription_transition_receipts"."entitlement_state" = 'ended'
            and "client_subscription_transition_receipts"."state" in ('active', 'ended'))
          or ("client_subscription_transition_receipts"."primary_event_type" = 'client_subscription.revoked.v1'
            and "client_subscription_transition_receipts"."entitlement_scope" = 'subscription_all'
            and "client_subscription_transition_receipts"."period_id" is null
            and "client_subscription_transition_receipts"."entitlement_state" = 'revoked')
        ));--> statement-breakpoint
ALTER TABLE "client_subscription_transition_receipts" ADD CONSTRAINT "client_subscription_transition_receipts_primary_event_check" CHECK ("client_subscription_transition_receipts"."primary_event_type" in (
        'client_subscription.initial_payment_ended.v1',
        'client_subscription.activated.v1',
        'client_subscription.period_ended.v1',
        'client_subscription.revoked.v1'
      ));--> statement-breakpoint
ALTER TABLE "client_subscription_lifecycle_events" DROP CONSTRAINT "client_subscription_lifecycle_events_type_check";--> statement-breakpoint
ALTER TABLE "client_subscription_lifecycle_events" DROP CONSTRAINT "client_subscription_lifecycle_events_data_shape_check";--> statement-breakpoint
ALTER TABLE "client_subscription_lifecycle_events" ADD CONSTRAINT "client_subscription_lifecycle_events_type_check" CHECK ("client_subscription_lifecycle_events"."event_type" in (
        'client_subscription.initial_payment_ended.v1',
        'client_subscription.activated.v1',
        'client_subscription.period_ended.v1',
        'client_subscription.revoked.v1',
        'client_subscription.entitlement_changed.v1'
      ));--> statement-breakpoint
ALTER TABLE "client_subscription_lifecycle_events" ADD CONSTRAINT "client_subscription_lifecycle_events_data_shape_check" CHECK ((
        "client_subscription_lifecycle_events"."event_type" = 'client_subscription.initial_payment_ended.v1'
        and "client_subscription_lifecycle_events"."data"->>'reason' in ('checkout_expired', 'payment_failed')
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'financeEvidenceId') = 'string'
        and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','financeEvidenceId','reason']::text[] = '{}'::jsonb
      ) or (
        "client_subscription_lifecycle_events"."event_type" in (
          'client_subscription.activated.v1',
          'client_subscription.period_ended.v1'
        )
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'periodId') = 'string'
        and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','periodId']::text[] = '{}'::jsonb
      ) or (
        "client_subscription_lifecycle_events"."event_type" = 'client_subscription.revoked.v1'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'periodId') = 'string'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'financeEvidenceId') = 'string'
        and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','periodId','financeEvidenceId']::text[] = '{}'::jsonb
      ) or (
        "client_subscription_lifecycle_events"."event_type" = 'client_subscription.entitlement_changed.v1'
        and "client_subscription_lifecycle_events"."data"->>'scope' in ('period', 'subscription_all')
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'relationshipId') = 'string'
        and jsonb_typeof("client_subscription_lifecycle_events"."data"->'journalEpochId') = 'string'
        and (
          ("client_subscription_lifecycle_events"."data"->>'scope' = 'period'
            and jsonb_typeof("client_subscription_lifecycle_events"."data"->'periodId') = 'string'
            and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','scope','relationshipId','journalEpochId','periodId']::text[] = '{}'::jsonb)
          or ("client_subscription_lifecycle_events"."data"->>'scope' = 'subscription_all'
            and "client_subscription_lifecycle_events"."data" - ARRAY['subscriptionId','contractId','scope','relationshipId','journalEpochId']::text[] = '{}'::jsonb)
        )
      ));--> statement-breakpoint
DROP TABLE "client_subscription_renewal_requests";--> statement-breakpoint
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
     or new.capture_kind <> 'initial'
     or primary_event_row.event_type <> 'client_subscription.activated.v1' then
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_client_subscription_graph_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $client_subscription_graph_integrity$
DECLARE
  checked_subscription_id uuid;
  checked_relationship_id uuid;
  checked_product_id uuid;
  checked_period_id uuid;
  checked_transition_id uuid;
  checked_event_id uuid;
  checked_allowance_period_id uuid;
  head client_subscriptions%ROWTYPE;
  slot client_subscription_slots%ROWTYPE;
  period_row client_subscription_periods%ROWTYPE;
  transition_row client_subscription_transition_receipts%ROWTYPE;
  event_row client_subscription_lifecycle_events%ROWTYPE;
  allowance_row client_subscription_period_allowances%ROWTYPE;
  actual_reserved integer;
  actual_consumed integer;
  period_count integer;
  maximum_sequence integer;
  current_period_sequence integer;
  slot_old_subscription_id uuid;
  slot_new_subscription_id uuid;
  transition_owner_count integer;
  transition_event_count integer;
  transition_primary_event_count integer;
  transition_entitlement_event_count integer;
  allowance_command_valid boolean;
  allowance_command_preimage text;
  allowance_effect_count integer;
BEGIN
  IF TG_TABLE_NAME = 'outbox_events' THEN
    IF TG_OP <> 'DELETE'
       AND NEW.event_type = 'client_subscription.lifecycle_event.dispatch_requested.v1' THEN
      checked_event_id := NEW.aggregate_id;
    ELSIF TG_OP <> 'INSERT'
       AND OLD.event_type = 'client_subscription.lifecycle_event.dispatch_requested.v1' THEN
      checked_event_id := OLD.aggregate_id;
    ELSE
      RETURN NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscription_slots' THEN
    checked_relationship_id := coalesce(NEW.relationship_id, OLD.relationship_id);
    checked_product_id := coalesce(NEW.product_id, OLD.product_id);
    IF TG_OP = 'UPDATE' THEN
      slot_old_subscription_id := OLD.current_subscription_id;
      slot_new_subscription_id := NEW.current_subscription_id;
      IF slot_old_subscription_id IS NOT NULL AND slot_new_subscription_id IS NULL
         AND NOT EXISTS (
           SELECT 1
             FROM client_subscription_transition_receipts release_receipt
             JOIN client_subscriptions released_head
               ON released_head.id = release_receipt.subscription_id
            WHERE release_receipt.subscription_id = slot_old_subscription_id
              AND release_receipt.subscription_version = released_head.version
              AND release_receipt.slot_effect = 'release'
         ) THEN
        RAISE EXCEPTION 'Subscription slot release requires its terminal transition receipt'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF slot_old_subscription_id IS NULL AND slot_new_subscription_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM client_subscription_creation_receipts creation_receipt
            WHERE creation_receipt.subscription_id = slot_new_subscription_id
              AND creation_receipt.relationship_id = NEW.relationship_id
              AND creation_receipt.product_id = NEW.product_id
              AND creation_receipt.result_kind = 'created'
              AND creation_receipt.slot_effect = 'assign'
              AND creation_receipt.result_slot_version = NEW.version
         ) THEN
        RAISE EXCEPTION 'Subscription slot assignment requires its creation receipt'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscription_creation_receipts' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    IF NEW.result_kind = 'created' AND NOT EXISTS (
      SELECT 1
        FROM client_subscriptions created_head
        JOIN client_subscription_contracts created_contract
          ON created_contract.id = created_head.contract_id
        JOIN client_subscription_slots created_slot
          ON created_slot.relationship_id = created_head.relationship_id
         AND created_slot.product_id = created_head.product_id
       WHERE created_head.id = NEW.subscription_id
         AND created_head.relationship_id = NEW.relationship_id
         AND created_head.product_id = NEW.product_id
         AND created_contract.id = NEW.contract_id
         AND created_contract.order_id = NEW.order_id
         AND created_contract.canonical_digest = NEW.contract_digest
         AND created_slot.current_subscription_id = created_head.id
         AND created_slot.version = NEW.result_slot_version
         AND NEW.result = jsonb_build_object(
           'contractDigest', created_contract.canonical_digest,
           'contractId', created_contract.id::text,
           'outcome', 'created',
           'subscriptionId', created_head.id::text
         )
    ) THEN
      RAISE EXCEPTION 'Created subscription receipt does not match contract, head, and slot'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF NEW.result_kind = 'rejected' AND NOT EXISTS (
      SELECT 1
        FROM client_subscription_slots rejected_slot
        JOIN client_astrologer_relationships rejected_relationship
          ON rejected_relationship.id = rejected_slot.relationship_id
         AND rejected_relationship.client_user_id = rejected_slot.client_user_id
         AND rejected_relationship.astrologer_user_id = rejected_slot.astrologer_user_id
        JOIN orders rejected_order
          ON rejected_order.id = NEW.order_id
         AND rejected_order.product_id = rejected_slot.product_id
         AND rejected_order.client_user_id = rejected_slot.client_user_id
         AND rejected_order.astrologer_user_id = rejected_slot.astrologer_user_id
       WHERE rejected_slot.relationship_id = NEW.relationship_id
         AND rejected_slot.product_id = NEW.product_id
         AND rejected_slot.version = NEW.result_slot_version
    ) THEN
      RAISE EXCEPTION 'Rejected subscription receipt does not match order and slot authority'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF NEW.result_kind = 'created' THEN
      checked_subscription_id := NEW.subscription_id;
    END IF;
    checked_relationship_id := NEW.relationship_id;
    checked_product_id := NEW.product_id;
  ELSIF TG_TABLE_NAME IN (
    'client_subscription_command_receipts',
    'client_subscription_event_application_receipts'
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    checked_subscription_id := NEW.subscription_id;
    SELECT * INTO head FROM client_subscriptions WHERE id = checked_subscription_id;
    IF NOT FOUND OR NEW.result_version IS DISTINCT FROM head.version THEN
      RAISE EXCEPTION 'Subscription persistence receipt version does not match its head'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF TG_TABLE_NAME = 'client_subscription_command_receipts' THEN
      IF (NEW.result_kind = 'applied' AND NEW.result_version <> NEW.expected_version + 1)
         OR (NEW.result_kind <> 'applied' AND NEW.result_version <> NEW.expected_version) THEN
        RAISE EXCEPTION 'Subscription command receipt does not seal its CAS precondition'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
    IF NEW.result_kind = 'applied' AND NOT EXISTS (
      SELECT 1 FROM client_subscription_transition_receipts applied_transition
       WHERE applied_transition.transition_id = NEW.transition_id
         AND applied_transition.subscription_id = NEW.subscription_id
         AND applied_transition.subscription_version = NEW.result_version
         AND applied_transition.slot_effect = NEW.slot_effect
    ) THEN
      RAISE EXCEPTION 'Applied subscription persistence receipt lacks its exact transition'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscription_allowance_command_receipts' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    checked_allowance_period_id := NEW.period_id;
    IF ((NEW.result_kind = 'applied' AND NEW.result_version <> NEW.expected_version + 1)
        OR (NEW.result_kind = 'rejected' AND NEW.result_version <> NEW.expected_version))
       OR NOT EXISTS (
      SELECT 1 FROM client_subscription_period_allowances receipt_allowance
       WHERE receipt_allowance.period_id = NEW.period_id
         AND NEW.result_version = receipt_allowance.version
    ) THEN
      RAISE EXCEPTION 'Allowance receipt version exceeds its allowance head'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    allowance_command_valid := false;
    IF jsonb_typeof(NEW.command) = 'object'
       AND NEW.command->>'occurredAt' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])T([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,9})?Z$'
       AND pg_input_is_valid(NEW.command->>'occurredAt', 'timestamp with time zone') THEN
      IF NEW.command->>'operation' = 'reserve' THEN
        allowance_command_valid := NEW.command = jsonb_build_object(
          'occurredAt', NEW.command->>'occurredAt',
          'operation', 'reserve',
          'reservationId', NEW.command->>'reservationId'
        ) AND NEW.command->>'reservationId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      ELSIF NEW.command->>'operation' = 'consume_available' THEN
        allowance_command_valid := NEW.command = jsonb_build_object(
          'consumptionId', NEW.command->>'consumptionId',
          'occurredAt', NEW.command->>'occurredAt',
          'operation', 'consume_available'
        ) AND NEW.command->>'consumptionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      ELSIF NEW.command->>'operation' IN ('consume_reserved', 'release_reserved', 'forfeit_reserved') THEN
        allowance_command_valid := NEW.command = jsonb_build_object(
          'occurredAt', NEW.command->>'occurredAt',
          'operation', NEW.command->>'operation',
          'reservationId', NEW.command->>'reservationId'
        ) AND NEW.command->>'reservationId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      ELSIF NEW.command->>'operation' = 'expire_available' THEN
        allowance_command_valid := NEW.command = jsonb_build_object(
          'occurredAt', NEW.command->>'occurredAt',
          'operation', 'expire_available'
        );
      END IF;
    END IF;
    allowance_command_preimage := finance_canonical_jsonb_v1(jsonb_build_object(
      'command', NEW.command,
      'expectedVersion', NEW.expected_version,
      'periodId', NEW.period_id::text
    ));
    IF NOT coalesce(allowance_command_valid, false)
       OR NEW.request_hash IS DISTINCT FROM
          'sha256:' || encode(digest(convert_to(allowance_command_preimage, 'UTF8'), 'sha256'), 'hex') THEN
      RAISE EXCEPTION 'Allowance receipt command or canonical request hash is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    SELECT count(*)::integer INTO allowance_effect_count
      FROM client_subscription_allowance_command_effects receipt_effect
     WHERE receipt_effect.period_id = NEW.period_id
       AND receipt_effect.idempotency_key = NEW.idempotency_key;
    IF (NEW.result_kind = 'applied' AND allowance_effect_count <> 1)
       OR (NEW.result_kind = 'rejected' AND allowance_effect_count <> 0) THEN
      RAISE EXCEPTION 'Allowance receipt and exact command effect cardinality is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    checked_period_id := checked_allowance_period_id;
  ELSIF TG_TABLE_NAME = 'client_subscription_allowance_command_effects' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    checked_period_id := NEW.period_id;
    IF NOT EXISTS (
      SELECT 1
        FROM client_subscription_allowance_command_receipts effect_receipt
        JOIN client_subscription_period_allowances effect_allowance
          ON effect_allowance.period_id = effect_receipt.period_id
       WHERE effect_receipt.period_id = NEW.period_id
         AND effect_receipt.idempotency_key = NEW.idempotency_key
         AND effect_receipt.result_kind = 'applied'
         AND effect_receipt.expected_version = NEW.before_version
         AND effect_receipt.result_version = NEW.after_version
         AND effect_receipt.command->>'operation' = NEW.operation
         AND CASE
           WHEN pg_input_is_valid(effect_receipt.command->>'occurredAt', 'timestamp with time zone')
             THEN (effect_receipt.command->>'occurredAt')::timestamptz = NEW.occurred_at
           ELSE false
         END
         AND (
           (NEW.operation = 'reserve'
             AND effect_receipt.command->>'reservationId' = NEW.reservation_id::text)
           OR (NEW.operation = 'consume_available'
             AND effect_receipt.command->>'consumptionId' = NEW.consumption_id::text)
           OR (NEW.operation IN ('consume_reserved', 'release_reserved', 'forfeit_reserved')
             AND effect_receipt.command->>'reservationId' = NEW.reservation_id::text)
           OR NEW.operation = 'expire_available'
         )
         AND effect_allowance.version = NEW.after_version
         AND effect_allowance.available = NEW.after_available
         AND effect_allowance.reserved = NEW.after_reserved
         AND effect_allowance.consumed = NEW.after_consumed
         AND effect_allowance.released = NEW.after_released
         AND (
           (NEW.operation IN ('reserve', 'consume_available')
             AND NEW.occurred_at < effect_allowance.ends_at)
           OR (NEW.operation = 'release_reserved'
             AND (
               (NEW.after_available = NEW.before_available + 1
                 AND NEW.occurred_at < effect_allowance.ends_at)
               OR (NEW.after_released = NEW.before_released + 1
                 AND NEW.occurred_at >= effect_allowance.ends_at)
             ))
           OR (NEW.operation = 'expire_available'
             AND NEW.occurred_at >= effect_allowance.ends_at)
           OR NEW.operation IN ('consume_reserved', 'forfeit_reserved')
         )
    ) THEN
      RAISE EXCEPTION 'Allowance command effect does not match canonical receipt command'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF (NEW.operation = 'reserve' AND NOT EXISTS (
          SELECT 1 FROM client_subscription_allowance_reservations reservation
           WHERE reservation.id = NEW.reservation_id
             AND reservation.period_id = NEW.period_id
             AND reservation.state = 'reserved'
             AND reservation.reserved_at = NEW.occurred_at
        ))
       OR (NEW.operation = 'consume_available' AND NOT EXISTS (
          SELECT 1 FROM client_subscription_allowance_consumptions consumption
           WHERE consumption.id = NEW.consumption_id
             AND consumption.period_id = NEW.period_id
             AND consumption.source = 'available'
             AND consumption.reservation_id IS NULL
             AND consumption.consumed_at = NEW.occurred_at
        ))
       OR (NEW.operation = 'consume_reserved' AND NOT EXISTS (
          SELECT 1
            FROM client_subscription_allowance_reservations reservation
            JOIN client_subscription_allowance_consumptions consumption
              ON consumption.id = reservation.id
             AND consumption.reservation_id = reservation.id
             AND consumption.period_id = reservation.period_id
             AND consumption.subscription_id = reservation.subscription_id
           WHERE reservation.id = NEW.reservation_id
             AND reservation.period_id = NEW.period_id
             AND reservation.state = 'consumed'
             AND reservation.consumed_at = NEW.occurred_at
             AND consumption.source = 'reservation'
             AND consumption.consumed_at = NEW.occurred_at
        ))
       OR (NEW.operation IN ('release_reserved', 'forfeit_reserved') AND NOT EXISTS (
          SELECT 1 FROM client_subscription_allowance_reservations reservation
           WHERE reservation.id = NEW.reservation_id
             AND reservation.period_id = NEW.period_id
             AND reservation.state = 'released'
             AND reservation.released_at = NEW.occurred_at
        )) THEN
      RAISE EXCEPTION 'Allowance command did not persist its exact reservation or consumption fact'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscriptions' THEN
    checked_subscription_id := coalesce(NEW.id, OLD.id);
    IF TG_OP = 'INSERT' AND NOT EXISTS (
      SELECT 1 FROM client_subscription_creation_receipts head_creation
       WHERE head_creation.subscription_id = NEW.id
         AND head_creation.contract_id = NEW.contract_id
         AND head_creation.relationship_id = NEW.relationship_id
         AND head_creation.product_id = NEW.product_id
         AND head_creation.result_kind = 'created'
    ) THEN
      RAISE EXCEPTION 'Subscription head creation requires its exact creation receipt'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    ELSIF TG_OP = 'UPDATE' AND NOT EXISTS (
      SELECT 1 FROM client_subscription_transition_receipts head_transition
       WHERE head_transition.subscription_id = NEW.id
         AND head_transition.contract_id = NEW.contract_id
         AND head_transition.relationship_id = NEW.relationship_id
         AND head_transition.journal_epoch_id = NEW.journal_epoch_id
         AND head_transition.subscription_version = NEW.version
         AND head_transition.state = NEW.state
    ) THEN
      RAISE EXCEPTION 'Subscription head mutation requires its exact transition receipt'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
  ELSIF TG_TABLE_NAME IN (
    'client_subscription_periods',
    'client_subscription_transition_receipts',
    'client_entitlement_grants',
    'client_entitlement_transition_applications'
  ) THEN
    checked_subscription_id := coalesce(NEW.subscription_id, OLD.subscription_id);
    IF TG_TABLE_NAME = 'client_entitlement_grants' THEN
      IF TG_OP = 'INSERT' AND NOT EXISTS (
           SELECT 1
             FROM client_entitlement_transition_effects grant_effect
             JOIN client_entitlement_transition_applications grant_application
               ON grant_application.id = grant_effect.application_id
              AND grant_application.subscription_id = grant_effect.subscription_id
            WHERE grant_effect.grant_id = NEW.id
              AND grant_effect.subscription_id = NEW.subscription_id
              AND grant_effect.before_version IS NULL
              AND grant_effect.before_state IS NULL
              AND grant_effect.after_version = NEW.version
              AND grant_effect.after_state = NEW.state
              AND grant_application.transition_id = NEW.source_transition_id
              AND grant_application.subscription_version = NEW.source_subscription_version
         ) THEN
        RAISE EXCEPTION 'Entitlement grant creation requires its exact transition effect'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      ELSIF TG_OP = 'UPDATE' AND NOT EXISTS (
           SELECT 1
             FROM client_entitlement_transition_effects grant_effect
             JOIN client_entitlement_transition_applications grant_application
               ON grant_application.id = grant_effect.application_id
              AND grant_application.subscription_id = grant_effect.subscription_id
            WHERE grant_effect.grant_id = NEW.id
              AND grant_effect.subscription_id = NEW.subscription_id
              AND grant_effect.before_version = OLD.version
              AND grant_effect.before_state = OLD.state
              AND grant_effect.after_version = NEW.version
              AND grant_effect.after_state = NEW.state
              AND grant_application.transition_id = NEW.source_transition_id
              AND grant_application.subscription_version = NEW.source_subscription_version
         ) THEN
        RAISE EXCEPTION 'Entitlement grant mutation requires its exact transition effect'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN (
    'client_subscription_period_allowances',
    'client_subscription_allowance_reservations',
    'client_subscription_allowance_consumptions'
  ) THEN
    checked_period_id := coalesce(NEW.period_id, OLD.period_id);
    IF TG_TABLE_NAME = 'client_subscription_period_allowances' THEN
      IF TG_OP = 'UPDATE' AND NOT EXISTS (
           SELECT 1
             FROM client_subscription_allowance_command_effects applied_effect
             JOIN client_subscription_allowance_command_receipts applied_receipt
               ON applied_receipt.period_id = applied_effect.period_id
              AND applied_receipt.idempotency_key = applied_effect.idempotency_key
            WHERE applied_effect.period_id = NEW.period_id
              AND applied_effect.before_version = OLD.version
              AND applied_effect.before_available = OLD.available
              AND applied_effect.before_reserved = OLD.reserved
              AND applied_effect.before_consumed = OLD.consumed
              AND applied_effect.before_released = OLD.released
              AND applied_effect.after_version = NEW.version
              AND applied_effect.after_available = NEW.available
              AND applied_effect.after_reserved = NEW.reserved
              AND applied_effect.after_consumed = NEW.consumed
              AND applied_effect.after_released = NEW.released
              AND applied_receipt.result_kind = 'applied'
              AND applied_receipt.expected_version = OLD.version
              AND applied_receipt.result_version = NEW.version
         ) THEN
        RAISE EXCEPTION 'Allowance update requires its exact applied command effect'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'client_subscription_lifecycle_events' THEN
    checked_event_id := coalesce(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'client_entitlement_transition_effects' THEN
    SELECT transition_id INTO checked_transition_id
      FROM client_entitlement_transition_applications
     WHERE id = coalesce(NEW.application_id, OLD.application_id);
  END IF;

  IF checked_event_id IS NOT NULL THEN
    SELECT * INTO event_row
      FROM client_subscription_lifecycle_events
     WHERE id = checked_event_id;
    IF NOT FOUND THEN
      IF EXISTS (
        SELECT 1 FROM outbox_events
         WHERE event_type = 'client_subscription.lifecycle_event.dispatch_requested.v1'
           AND aggregate_id = checked_event_id
      ) THEN
        RAISE EXCEPTION 'Subscription lifecycle outbox references a missing event'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      RETURN NULL;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM outbox_events
       WHERE event_type = 'client_subscription.lifecycle_event.dispatch_requested.v1'
         AND aggregate_id = event_row.id
         AND payload = jsonb_build_object(
           'schemaVersion', 'client-subscription-lifecycle-event-dispatch-request.v1',
           'lifecycleEventId', event_row.id::text
         )
    ) THEN
      RAISE EXCEPTION 'Subscription lifecycle event requires one IDs-only outbox dispatch'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    checked_transition_id := event_row.transition_id;
    checked_subscription_id := event_row.subscription_id;
  END IF;

  IF checked_transition_id IS NOT NULL THEN
    SELECT * INTO transition_row
      FROM client_subscription_transition_receipts
     WHERE transition_id = checked_transition_id;
    IF FOUND THEN
      checked_subscription_id := transition_row.subscription_id;
      IF checked_event_id IS NOT NULL
         AND event_row.occurred_at IS DISTINCT FROM transition_row.occurred_at THEN
        RAISE EXCEPTION 'Subscription lifecycle event occurrence must match its transition'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF checked_event_id IS NOT NULL AND (
        (event_row.event_type IN (
          'client_subscription.activated.v1',
          'client_subscription.period_ended.v1'
        ) AND event_row.data->>'periodId' IS DISTINCT FROM transition_row.period_id::text)
        OR (event_row.event_type = 'client_subscription.entitlement_changed.v1' AND (
          event_row.data->>'scope' IS DISTINCT FROM transition_row.entitlement_scope
          OR event_row.data->>'relationshipId' IS DISTINCT FROM transition_row.relationship_id::text
          OR event_row.data->>'journalEpochId' IS DISTINCT FROM transition_row.journal_epoch_id::text
          OR (transition_row.entitlement_scope = 'period'
              AND event_row.data->>'periodId' IS DISTINCT FROM transition_row.period_id::text)
        ))
        OR (event_row.event_type IN (
          'client_subscription.initial_payment_ended.v1',
          'client_subscription.revoked.v1'
        ) AND NOT EXISTS (
          SELECT 1 FROM client_subscription_event_application_receipts finance_application
           WHERE finance_application.transition_id = transition_row.transition_id
             AND finance_application.evidence_id::text = event_row.data->>'financeEvidenceId'
        ))
        OR (event_row.event_type = 'client_subscription.revoked.v1' AND NOT EXISTS (
          SELECT 1 FROM client_subscription_periods revoked_period
           WHERE revoked_period.id::text = event_row.data->>'periodId'
             AND revoked_period.subscription_id = transition_row.subscription_id
        ))
      ) THEN
        RAISE EXCEPTION 'Subscription lifecycle event data does not match persisted facts'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  END IF;

  IF checked_period_id IS NOT NULL THEN
    SELECT * INTO period_row
      FROM client_subscription_periods
     WHERE id = checked_period_id;
    IF FOUND THEN
      checked_subscription_id := period_row.subscription_id;
    END IF;
  END IF;

  IF checked_subscription_id IS NOT NULL THEN
    SELECT * INTO head
      FROM client_subscriptions
     WHERE id = checked_subscription_id
       FOR KEY SHARE;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    checked_relationship_id := head.relationship_id;
    checked_product_id := head.product_id;

    IF head.current_period_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM client_subscription_periods period
       WHERE period.id = head.current_period_id AND period.subscription_id = head.id
    ) THEN
      RAISE EXCEPTION 'Subscription current period pointer is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF head.future_period_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM client_subscription_periods future_period
        JOIN client_subscription_periods current_period
          ON current_period.id = head.current_period_id
         AND current_period.subscription_id = head.id
       WHERE future_period.id = head.future_period_id
         AND future_period.subscription_id = head.id
         AND future_period.sequence = current_period.sequence + 1
         AND future_period.starts_at = current_period.ends_at
    ) THEN
      RAISE EXCEPTION 'Subscription future period must be the sole contiguous successor'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    SELECT count(*)::integer, coalesce(max(sequence), 0)::integer
      INTO period_count, maximum_sequence
      FROM client_subscription_periods
     WHERE subscription_id = head.id;
    IF period_count <> maximum_sequence THEN
      RAISE EXCEPTION 'Subscription paid period sequence must be contiguous from one'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF head.state = 'pending_initial_payment' AND period_count <> 0 THEN
      RAISE EXCEPTION 'Pending subscription cannot already contain paid periods'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF head.current_period_id IS NOT NULL THEN
      SELECT sequence INTO current_period_sequence
        FROM client_subscription_periods
       WHERE id = head.current_period_id AND subscription_id = head.id;
      IF head.future_period_id IS NULL AND current_period_sequence <> maximum_sequence THEN
        RAISE EXCEPTION 'Subscription current period must be the latest non-future period'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF head.future_period_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM client_subscription_periods exact_future
         WHERE exact_future.id = head.future_period_id
           AND exact_future.subscription_id = head.id
           AND exact_future.sequence = current_period_sequence + 1
           AND exact_future.sequence = maximum_sequence
      ) THEN
        RAISE EXCEPTION 'Subscription future period pointer must cover the sole successor'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  END IF;

  IF checked_relationship_id IS NOT NULL AND checked_product_id IS NOT NULL THEN
    SELECT * INTO slot
      FROM client_subscription_slots
     WHERE relationship_id = checked_relationship_id
       AND product_id = checked_product_id
       FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Subscription head requires a relationship-product CAS slot'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    SELECT * INTO head
     FROM client_subscriptions
     WHERE relationship_id = checked_relationship_id
       AND product_id = checked_product_id
       AND state IN ('pending_initial_payment', 'active');
    IF FOUND AND slot.current_subscription_id IS DISTINCT FROM head.id THEN
      RAISE EXCEPTION 'Subscription slot current pointer does not match the occupying head'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF NOT FOUND AND slot.current_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'Subscription slot retains a terminal paid-period head'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF slot.current_subscription_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM client_subscriptions current_head
       WHERE current_head.id = slot.current_subscription_id
         AND current_head.relationship_id = slot.relationship_id
         AND current_head.product_id = slot.product_id
    ) THEN
      RAISE EXCEPTION 'Subscription slot points outside its exact relationship-product scope'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
  END IF;

  IF checked_period_id IS NOT NULL THEN
    SELECT * INTO period_row FROM client_subscription_periods WHERE id = checked_period_id;
    IF FOUND THEN
      IF NOT EXISTS (
        SELECT 1
          FROM client_subscription_periods origin_period
          JOIN client_subscription_contracts contract
            ON contract.id = period_row.contract_id
           AND contract.id = origin_period.contract_id
         WHERE origin_period.subscription_id = period_row.subscription_id
           AND origin_period.sequence = period_row.anchor_origin_sequence
           AND origin_period.anchor_origin_sequence = origin_period.sequence
           AND origin_period.anchor_captured_at = origin_period.starts_at
           AND origin_period.anchor_captured_at = period_row.anchor_captured_at
           AND origin_period.anchor_service_timezone = period_row.anchor_service_timezone
           AND origin_period.anchor_local_date_time = period_row.anchor_local_date_time
           AND period_row.anchor_service_timezone = contract.astro_diary_config->>'serviceTimezone'
           AND (
             (period_row.sequence = origin_period.sequence
               AND period_row.starts_at = origin_period.starts_at
               AND period_row.resolved_start_local = origin_period.anchor_local_date_time)
             OR (period_row.sequence > origin_period.sequence AND EXISTS (
               SELECT 1 FROM client_subscription_periods predecessor
                WHERE predecessor.subscription_id = period_row.subscription_id
                  AND predecessor.contract_id = period_row.contract_id
                  AND predecessor.sequence = period_row.sequence - 1
                  AND predecessor.ends_at = period_row.starts_at
                  AND predecessor.resolved_end_local = period_row.resolved_start_local
                  AND predecessor.anchor_origin_sequence = period_row.anchor_origin_sequence
                  AND predecessor.anchor_captured_at = period_row.anchor_captured_at
                  AND predecessor.anchor_service_timezone = period_row.anchor_service_timezone
                  AND predecessor.anchor_local_date_time = period_row.anchor_local_date_time
             ))
           )
           AND period_row.resolved_end_local::timestamp = CASE
             WHEN contract.cadence = 'week' THEN
               origin_period.anchor_local_date_time::timestamp
                 + make_interval(days => 7 * (period_row.sequence - origin_period.sequence + 1))
             WHEN contract.cadence = 'month' THEN
               origin_period.anchor_local_date_time::timestamp
                 + make_interval(months => period_row.sequence - origin_period.sequence + 1)
             WHEN contract.cadence = 'year' THEN
               origin_period.anchor_local_date_time::timestamp
                 + make_interval(years => period_row.sequence - origin_period.sequence + 1)
           END
      ) THEN
        RAISE EXCEPTION 'Subscription period original anchor or cadence chain is invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_timezone_names
         WHERE name = period_row.anchor_service_timezone
      )
      OR period_row.anchor_local_date_time::timestamp IS DISTINCT FROM
         period_row.anchor_captured_at AT TIME ZONE period_row.anchor_service_timezone
      OR period_row.resolved_start_local::timestamp IS DISTINCT FROM
         period_row.starts_at AT TIME ZONE period_row.anchor_service_timezone
      OR period_row.resolved_end_local::timestamp IS DISTINCT FROM
         period_row.ends_at AT TIME ZONE period_row.anchor_service_timezone
      OR (period_row.resolved_start_local || period_row.resolved_start_offset)::timestamptz
         IS DISTINCT FROM period_row.starts_at
      OR (period_row.resolved_end_local || period_row.resolved_end_offset)::timestamptz
         IS DISTINCT FROM period_row.ends_at THEN
        RAISE EXCEPTION 'Subscription period timezone evidence is invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      SELECT * INTO allowance_row
        FROM client_subscription_period_allowances
       WHERE period_id = period_row.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Paid subscription period requires its exact initial allowance'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF TG_TABLE_NAME = 'client_subscription_periods'
         AND TG_OP = 'INSERT'
         AND (
           allowance_row.version <> 1
           OR allowance_row.available <> allowance_row.total
           OR allowance_row.reserved <> 0
           OR allowance_row.consumed <> 0
           OR allowance_row.released <> 0
         ) THEN
        RAISE EXCEPTION 'Paid subscription period requires its exact initial allowance'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF NOT EXISTS (
        SELECT 1
          FROM client_subscription_event_application_receipts capture_application
          JOIN client_subscription_transition_receipts capture_transition
            ON capture_transition.transition_id = capture_application.transition_id
           AND capture_transition.subscription_id = capture_application.subscription_id
           AND capture_transition.subscription_version = capture_application.result_version
          JOIN client_subscription_lifecycle_events capture_event
            ON capture_event.transition_id = capture_transition.transition_id
           AND capture_event.subscription_id = capture_transition.subscription_id
           AND capture_event.subscription_version = capture_transition.subscription_version
         WHERE capture_application.result_kind = 'applied'
           AND capture_application.subscription_id = period_row.subscription_id
           AND capture_application.evidence_id = period_row.capture_evidence_id
           AND capture_transition.period_id = period_row.id
           AND capture_transition.contract_id = period_row.contract_id
           AND capture_transition.entitlement_scope = 'period'
           AND capture_event.event_type = 'client_subscription.activated.v1'
      ) THEN
        RAISE EXCEPTION 'Paid subscription period requires applied capture evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF allowance_row.period_id IS NOT NULL THEN
        SELECT count(*) FILTER (WHERE state = 'reserved')::integer
          INTO actual_reserved
          FROM client_subscription_allowance_reservations
         WHERE period_id = allowance_row.period_id;
        SELECT count(*)::integer INTO actual_consumed
          FROM client_subscription_allowance_consumptions
         WHERE period_id = allowance_row.period_id;
        IF actual_reserved IS DISTINCT FROM allowance_row.reserved
           OR actual_consumed IS DISTINCT FROM allowance_row.consumed
           OR allowance_row.available + allowance_row.reserved + allowance_row.consumed + allowance_row.released
              IS DISTINCT FROM allowance_row.total
           OR allowance_row.total IS DISTINCT FROM (
             SELECT (contract.astro_diary_config->>'reflectionCyclesPerPeriod')::integer
               FROM client_subscription_contracts contract
              WHERE contract.id = period_row.contract_id
           ) THEN
          RAISE EXCEPTION 'Subscription allowance rows do not match normalized bucket facts'
            USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
        END IF;
        IF EXISTS (
          SELECT 1 FROM client_subscription_allowance_reservations reservation
           WHERE reservation.period_id = allowance_row.period_id
             AND (
               (reservation.state = 'consumed' AND NOT EXISTS (
                 SELECT 1 FROM client_subscription_allowance_consumptions consumption
                  WHERE consumption.reservation_id = reservation.id
                    AND consumption.period_id = reservation.period_id
                    AND consumption.subscription_id = reservation.subscription_id
                    AND consumption.source = 'reservation'
               ))
               OR (reservation.state <> 'consumed' AND EXISTS (
                 SELECT 1 FROM client_subscription_allowance_consumptions consumption
                  WHERE consumption.reservation_id = reservation.id
               ))
             )
        ) THEN
          RAISE EXCEPTION 'Reservation consumption facts are inconsistent'
            USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
        END IF;
      END IF;
    END IF;
  END IF;

  FOR transition_row IN
    SELECT receipt.*
      FROM client_subscription_transition_receipts receipt
     WHERE checked_subscription_id IS NOT NULL
       AND receipt.subscription_id = checked_subscription_id
  LOOP
    SELECT count(*)::integer INTO transition_owner_count
      FROM (
        SELECT command_owner.subscription_id
          FROM client_subscription_command_receipts command_owner
         WHERE command_owner.result_kind = 'applied'
           AND command_owner.transition_id = transition_row.transition_id
           AND command_owner.subscription_id = transition_row.subscription_id
           AND command_owner.result_version = transition_row.subscription_version
        UNION ALL
        SELECT source_owner.subscription_id
          FROM client_subscription_event_application_receipts source_owner
         WHERE source_owner.result_kind = 'applied'
           AND source_owner.transition_id = transition_row.transition_id
           AND source_owner.subscription_id = transition_row.subscription_id
           AND source_owner.result_version = transition_row.subscription_version
      ) persistence_owners;
    IF transition_owner_count <> 1 THEN
      RAISE EXCEPTION 'Subscription transition requires exactly one persistence owner'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE event.event_type = transition_row.primary_event_type)::integer,
      count(*) FILTER (WHERE event.event_type = 'client_subscription.entitlement_changed.v1')::integer
      INTO transition_event_count, transition_primary_event_count, transition_entitlement_event_count
      FROM client_subscription_lifecycle_events event
     WHERE event.transition_id = transition_row.transition_id
       AND event.subscription_id = transition_row.subscription_id
       AND event.subscription_version = transition_row.subscription_version;
    IF transition_primary_event_count <> 1
       OR (
         transition_row.primary_event_type IN (
           'client_subscription.activated.v1',
           'client_subscription.period_ended.v1',
           'client_subscription.revoked.v1'
         )
         AND (transition_event_count <> 2 OR transition_entitlement_event_count <> 1)
       )
       OR (
         transition_row.primary_event_type NOT IN (
           'client_subscription.activated.v1',
           'client_subscription.period_ended.v1',
           'client_subscription.revoked.v1'
         )
         AND (transition_event_count <> 1 OR transition_entitlement_event_count <> 0)
       )
       OR EXISTS (
         SELECT 1 FROM client_subscription_lifecycle_events event
          WHERE event.transition_id = transition_row.transition_id
            AND event.event_type NOT IN (
              transition_row.primary_event_type,
              'client_subscription.entitlement_changed.v1'
            )
       )
       OR EXISTS (
         SELECT 1 FROM client_subscription_lifecycle_events event
          WHERE event.transition_id = transition_row.transition_id
            AND event.occurred_at IS DISTINCT FROM transition_row.occurred_at
       ) THEN
      RAISE EXCEPTION 'Subscription transition lifecycle output set is invalid'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM client_subscription_lifecycle_events event
       WHERE event.transition_id = transition_row.transition_id
    ) THEN
      RAISE EXCEPTION 'Applied subscription transition requires lifecycle output facts'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope = 'none' AND EXISTS (
      SELECT 1 FROM client_entitlement_transition_applications application
       WHERE application.transition_id = transition_row.transition_id
    ) THEN
      RAISE EXCEPTION 'Entitlement-none transition cannot produce entitlement effects'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope <> 'none' AND NOT EXISTS (
      SELECT 1 FROM client_entitlement_transition_applications application
       WHERE application.transition_id = transition_row.transition_id
         AND application.subscription_id = transition_row.subscription_id
         AND application.subscription_version = transition_row.subscription_version
         AND application.scope = transition_row.entitlement_scope
    ) THEN
      RAISE EXCEPTION 'Subscription transition requires its atomic entitlement application'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope = 'period' AND (
      SELECT count(*)
        FROM client_entitlement_transition_applications application
        JOIN client_entitlement_transition_effects effect
          ON effect.application_id = application.id
         AND effect.subscription_id = application.subscription_id
        JOIN client_entitlement_grants grant_row
          ON grant_row.id = effect.grant_id
         AND grant_row.subscription_id = effect.subscription_id
       WHERE application.transition_id = transition_row.transition_id
         AND grant_row.period_id = transition_row.period_id
         AND effect.after_state = transition_row.entitlement_state
    ) <> 1 OR transition_row.entitlement_scope = 'period' AND (
      SELECT count(*)
        FROM client_entitlement_transition_applications application
        JOIN client_entitlement_transition_effects effect
          ON effect.application_id = application.id
         AND effect.subscription_id = application.subscription_id
       WHERE application.transition_id = transition_row.transition_id
    ) <> 1 THEN
      RAISE EXCEPTION 'Period entitlement transition effect set is not exact'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope = 'subscription_all' AND EXISTS (
        SELECT 1 FROM client_entitlement_grants grant_row
         WHERE grant_row.subscription_id = transition_row.subscription_id
           AND grant_row.state = 'active'
    ) THEN
      RAISE EXCEPTION 'Subscription-all revocation must close every current or future grant'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.entitlement_scope = 'subscription_all' AND EXISTS (
      SELECT 1
        FROM client_entitlement_transition_applications application
        JOIN client_entitlement_transition_effects effect
          ON effect.application_id = application.id
         AND effect.subscription_id = application.subscription_id
        JOIN client_entitlement_grants grant_row
          ON grant_row.id = effect.grant_id
         AND grant_row.subscription_id = effect.subscription_id
       WHERE application.transition_id = transition_row.transition_id
         AND (
           effect.before_version IS NULL
           OR effect.before_state IS DISTINCT FROM 'active'
           OR effect.after_version <> effect.before_version + 1
           OR effect.after_state <> 'revoked'
           OR grant_row.state <> 'revoked'
           OR grant_row.version <> effect.after_version
           OR grant_row.source_transition_id <> transition_row.transition_id
           OR grant_row.source_subscription_version <> transition_row.subscription_version
         )
    ) THEN
      RAISE EXCEPTION 'Subscription-all revocation effect set is not exact'
        USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
    END IF;
    IF transition_row.subscription_version = (
      SELECT version FROM client_subscriptions WHERE id = transition_row.subscription_id
    ) THEN
      IF transition_row.slot_effect = 'release' AND EXISTS (
        SELECT 1 FROM client_subscription_slots release_slot
         WHERE release_slot.relationship_id = transition_row.relationship_id
           AND release_slot.product_id = (
             SELECT product_id FROM client_subscriptions WHERE id = transition_row.subscription_id
           )
           AND release_slot.current_subscription_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Released subscription transition must atomically clear its CAS slot'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
      IF transition_row.slot_effect = 'retain' AND NOT EXISTS (
        SELECT 1 FROM client_subscription_slots retained_slot
         WHERE retained_slot.relationship_id = transition_row.relationship_id
           AND retained_slot.product_id = (
             SELECT product_id FROM client_subscriptions WHERE id = transition_row.subscription_id
           )
           AND retained_slot.current_subscription_id = transition_row.subscription_id
      ) THEN
        RAISE EXCEPTION 'Retained subscription transition must keep its CAS slot pointer'
          USING ERRCODE = '23514', CONSTRAINT = 'client_subscription_graph_integrity';
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$client_subscription_graph_integrity$;
