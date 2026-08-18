ALTER TABLE "products" DROP CONSTRAINT "products_astro_diary_shape_check";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_astro_diary_shape_check" CHECK ("products"."astro_diary_reflection_cycles_per_period" is null or ("products"."type" = 'async' and "products"."payment_model" = 'once' and "products"."subscription_period" in ('week', 'month', 'year') and "products"."execution_mode" = 'async' and "products"."participant_mode" = 'solo' and "products"."duration_minutes" is null and "products"."duration_label" is null and "products"."sla_label" is null and "products"."package_session_count" is null and "products"."package_discount_percent" is null and "products"."trial_days" is null and "products"."group_size" is null));--> statement-breakpoint
ALTER TABLE "client_subscription_purchase_fulfillment_authorities" DROP CONSTRAINT "client_sub_purchase_fulfillment_shape_check";--> statement-breakpoint
ALTER TABLE "client_subscription_purchase_fulfillment_authorities" ADD CONSTRAINT "client_sub_purchase_fulfillment_shape_check" CHECK ("client_subscription_purchase_fulfillment_authorities"."registry_key" = 'async.once.async.solo'
        and "client_subscription_purchase_fulfillment_authorities"."registry_revision" >= 1);--> statement-breakpoint
INSERT INTO "finance_paid_product_fulfillment_decisions" (
  "supported",
  "registry_key",
  "registry_revision",
  "hold_anchor",
  "terminal_evidence_owner",
  "terminal_evidence_status",
  "terminal_evidence_contract_version",
  "cancellation_allocator_owner",
  "cancellation_allocator_port",
  "cancellation_allocator_policy_version"
) VALUES (
  true,
  'async.once.async.solo',
  1,
  'booking_completed',
  'booking',
  'completed',
  1,
  'booking',
  'BookingCancellationRefundDecisionPort',
  1
) ON CONFLICT ("registry_key", "registry_revision") DO NOTHING;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "finance_paid_product_fulfillment_decisions"
     WHERE "registry_key" = 'async.once.async.solo'
       AND "registry_revision" = 1
       AND "supported" = true
       AND "hold_anchor" = 'booking_completed'
       AND "terminal_evidence_owner" = 'booking'
       AND "terminal_evidence_status" = 'completed'
       AND "terminal_evidence_contract_version" = 1
       AND "cancellation_allocator_owner" = 'booking'
       AND "cancellation_allocator_port" = 'BookingCancellationRefundDecisionPort'
       AND "cancellation_allocator_policy_version" = 1
  ) THEN
    RAISE EXCEPTION 'AstroDiary one-time paid-period fulfillment authority is absent or conflicts'
      USING ERRCODE = '23514';
  END IF;
END;
$$;--> statement-breakpoint
DO $$
DECLARE
  function_definition text;
  updated_definition text;
BEGIN
  SELECT pg_get_functiondef('elevenhouse_assert_astro_diary_product_integrity()'::regprocedure)
    INTO function_definition;
  updated_definition := regexp_replace(
    function_definition,
    'product_row\.type IS DISTINCT FROM ''sub''\s+OR product_row\.payment_model IS DISTINCT FROM ''sub''\s+OR product_row\.execution_mode IS DISTINCT FROM ''async''',
    'product_row.type IS DISTINCT FROM ''async''
       OR product_row.payment_model IS DISTINCT FROM ''once''
       OR product_row.subscription_period NOT IN (''week'', ''month'', ''year'')
       OR product_row.execution_mode IS DISTINCT FROM ''async'''
  );
  IF updated_definition IS NOT DISTINCT FROM function_definition THEN
    RAISE EXCEPTION 'AstroDiary product integrity function did not contain the expected recurring shape'
      USING ERRCODE = '23514';
  END IF;
  EXECUTE updated_definition;
END;
$$;--> statement-breakpoint
DO $$
DECLARE
  function_definition text;
  updated_definition text;
BEGIN
  SELECT pg_get_functiondef('elevenhouse_assert_client_subscription_purchase_authority()'::regprocedure)
    INTO function_definition;
  updated_definition := regexp_replace(
    function_definition,
    'product_row\.type IS DISTINCT FROM ''sub''\s+OR product_row\.payment_model IS DISTINCT FROM ''sub''\s+OR product_row\.execution_mode IS DISTINCT FROM ''async''',
    'product_row.type IS DISTINCT FROM ''async''
     OR product_row.payment_model IS DISTINCT FROM ''once''
     OR product_row.execution_mode IS DISTINCT FROM ''async'''
  );
  IF updated_definition IS NOT DISTINCT FROM function_definition THEN
    RAISE EXCEPTION 'Client subscription purchase authority function did not contain the expected recurring shape'
      USING ERRCODE = '23514';
  END IF;
  EXECUTE updated_definition;
END;
$$;--> statement-breakpoint
DO $$
DECLARE
  function_definition text;
  updated_definition text;
BEGIN
  SELECT pg_get_functiondef('finance_issue_client_checkout_authorization()'::regprocedure)
    INTO function_definition;
  updated_definition := regexp_replace(
    function_definition,
    'IF NEW\.fulfillment_decision_id = ''sub\.sub\.async\.solo'' THEN',
    'IF NEW.fulfillment_decision_id IN (''async.once.async.solo'', ''sub.sub.async.solo'') THEN'
  );
  IF updated_definition IS NOT DISTINCT FROM function_definition THEN
    RAISE EXCEPTION 'Client checkout authorization function did not contain the expected legacy reserved key branch'
      USING ERRCODE = '23514';
  END IF;
  EXECUTE updated_definition;
END;
$$;
