ALTER TABLE "flow_runtime_events" DROP CONSTRAINT "flow_runtime_events_normalized_shape_check";--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "flow_versions" DROP CONSTRAINT "flow_versions_capability_manifest_schema_check";--> statement-breakpoint
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
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*] ? (@.kind == "birth_data_available")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*] ? (@.kind == "natal_chart_request")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*] ? (@.kind == "natal_chart_ai_draft")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*] ? (@.kind == "send_message")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*] ? (@.kind == "astrologer_work_item")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*] ? (@.kind == "astrologer_approval")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*] ? (@.kind == "completed")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*] ? (@.kind == "suppressed")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'nodeExecutors', '$[*] ? (@.kind == "failed")')) <= 1
    ELSE FALSE
  END
          AND CASE
    WHEN jsonb_typeof(capability_manifest->'requiredCapabilities') = 'array' THEN
      jsonb_array_length(capability_manifest->'requiredCapabilities') <= 50
      AND capability_manifest->'requiredCapabilities' <@ '["bookings.events.booking_confirmed","clients.events.new_lead","products.events.free_product_received","finance.events.client_order_captured","messaging.events.first_inbound_message","astro.events.calendar","clients.events.lifecycle_changed","schedule.events.time","reviews.events.received","subscriptions.events.changed","clients.birth_data.read.service_preparation","products.read","charts.calculate.natal.booking_context","charts.interpret.natal.ai_draft","messaging.outbound.send.existing_thread"]'::jsonb
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "bookings.events.booking_confirmed")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "clients.events.new_lead")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "products.events.free_product_received")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "finance.events.client_order_captured")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "messaging.events.first_inbound_message")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "astro.events.calendar")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "clients.events.lifecycle_changed")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "schedule.events.time")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "reviews.events.received")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "subscriptions.events.changed")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "clients.birth_data.read.service_preparation")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "products.read")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "charts.calculate.natal.booking_context")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "charts.interpret.natal.ai_draft")')) <= 1
      AND jsonb_array_length(jsonb_path_query_array(capability_manifest->'requiredCapabilities', '$[*] ? (@ == "messaging.outbound.send.existing_thread")')) <= 1
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
          AND jsonb_typeof(capability_manifest->'triggerMatcher'->'configSchemaVersion') = 'number'
          AND capability_manifest->'triggerMatcher'->>'configSchemaVersion' = '1'
          AND jsonb_typeof(capability_manifest->'triggerMatcher'->'matcherContractVersion') = 'number'
          AND capability_manifest->'triggerMatcher'->>'matcherContractVersion' = '1'
          AND jsonb_typeof(capability_manifest->'triggerMatcher'->'eventSchemaVersion') = 'number'
          AND capability_manifest->'triggerMatcher'->>'eventSchemaVersion' = '1'
) IS TRUE);
--> statement-breakpoint
DO $migration$
DECLARE
  existing_definition text;
  updated_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO existing_definition
    FROM pg_constraint
   WHERE conrelid = 'flow_run_events'::regclass
     AND conname = 'flow_run_events_summary_schema_check';

  IF existing_definition IS NULL THEN
    RAISE EXCEPTION 'flow_run_events_summary_schema_check not found';
  END IF;

  updated_definition := replace(
    existing_definition,
    $$((summary ->> 'eventKind'::text) = ANY (ARRAY['booking_confirmed'::text, 'manual_client'::text, 'product_purchased'::text, 'first_inbound_message'::text, 'client_lifecycle_changed'::text]))$$,
    $$((summary ->> 'eventKind'::text) = ANY (ARRAY['booking_confirmed'::text, 'manual_client'::text, 'new_lead'::text, 'free_product_received'::text, 'product_purchased'::text, 'first_inbound_message'::text, 'astro_event'::text, 'client_lifecycle_changed'::text, 'schedule_time'::text, 'review_received'::text, 'subscription_event'::text]))$$
  );

  IF updated_definition = existing_definition THEN
    IF position('new_lead' in existing_definition) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'flow_run_events_summary_schema_check eventKind allowlist was not updated';
  END IF;

  ALTER TABLE "flow_run_events" DROP CONSTRAINT "flow_run_events_summary_schema_check";
  EXECUTE 'ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_summary_schema_check" ' || updated_definition;
END $migration$;
