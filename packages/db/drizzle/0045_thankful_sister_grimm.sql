CREATE TABLE "client_lifecycle_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	"cause_kind" text NOT NULL,
	"before_status" text,
	"after_status" text NOT NULL,
	"disposition" text NOT NULL,
	"actor_user_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_lifecycle_history_cause_check" CHECK ("client_lifecycle_history"."cause_kind" in ('relationship_created', 'captured_order', 'inbound_message', 'booking_started', 'booking_completed', 'inactivity_elapsed', 'manual_astrologer_action', 'manual_override', 'return_to_automatic')),
	CONSTRAINT "client_lifecycle_history_before_status_check" CHECK ("client_lifecycle_history"."before_status" is null or "client_lifecycle_history"."before_status" in ('new', 'active', 'waiting_for_client', 'in_service', 'inactive')),
	CONSTRAINT "client_lifecycle_history_after_status_check" CHECK ("client_lifecycle_history"."after_status" in ('new', 'active', 'waiting_for_client', 'in_service', 'inactive')),
	CONSTRAINT "client_lifecycle_history_disposition_check" CHECK ("client_lifecycle_history"."disposition" in ('applied', 'candidate_recorded', 'no_change')),
	CONSTRAINT "client_lifecycle_history_source_event_id_length_check" CHECK (length(trim("client_lifecycle_history"."source_event_id")) between 1 and 180)
);
--> statement-breakpoint
CREATE TABLE "client_lifecycle_states" (
	"relationship_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"mode" text DEFAULT 'automatic' NOT NULL,
	"latest_automatic_candidate_status" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_lifecycle_states_status_check" CHECK ("client_lifecycle_states"."status" in ('new', 'active', 'waiting_for_client', 'in_service', 'inactive')),
	CONSTRAINT "client_lifecycle_states_mode_check" CHECK ("client_lifecycle_states"."mode" in ('automatic', 'manual_override')),
	CONSTRAINT "client_lifecycle_states_candidate_status_check" CHECK ("client_lifecycle_states"."latest_automatic_candidate_status" is null or "client_lifecycle_states"."latest_automatic_candidate_status" in ('new', 'active', 'waiting_for_client', 'in_service', 'inactive')),
	CONSTRAINT "client_lifecycle_states_revision_check" CHECK ("client_lifecycle_states"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "flow_versions" DROP CONSTRAINT "flow_versions_capability_manifest_schema_check";--> statement-breakpoint
ALTER TABLE "client_lifecycle_history" ADD CONSTRAINT "client_lifecycle_history_relationship_id_client_astrologer_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."client_astrologer_relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_lifecycle_states" ADD CONSTRAINT "client_lifecycle_states_relationship_id_client_astrologer_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."client_astrologer_relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_lifecycle_history_relationship_source_unique" ON "client_lifecycle_history" USING btree ("relationship_id","source_event_id");--> statement-breakpoint
CREATE INDEX "client_lifecycle_history_relationship_occurred_idx" ON "client_lifecycle_history" USING btree ("relationship_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "client_lifecycle_states_mode_activity_idx" ON "client_lifecycle_states" USING btree ("mode","last_activity_at");--> statement-breakpoint
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
      AND jsonb_path_query_array(graph->'nodes', '$[*].kind') <@ '["booking_confirmed","manual_client","product_purchased","first_inbound_message","client_lifecycle_changed","birth_data_available","natal_chart_request","natal_chart_ai_draft","send_message","astrologer_work_item","astrologer_approval","completed","suppressed","failed"]'::jsonb
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
      AND capability_manifest->'requiredCapabilities' <@ '["bookings.events.booking_confirmed","finance.events.client_order_captured","messaging.events.first_inbound_message","clients.events.lifecycle_changed","clients.birth_data.read.service_preparation","products.read","charts.calculate.natal.booking_context","charts.interpret.natal.ai_draft","messaging.outbound.send.existing_thread"]'::jsonb
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "bookings.events.booking_confirmed")'
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
        '$[*] ? (@ == "clients.events.lifecycle_changed")'
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
            IN ('booking_confirmed', 'manual_client', 'product_purchased', 'first_inbound_message', 'client_lifecycle_changed')
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

) IS TRUE);