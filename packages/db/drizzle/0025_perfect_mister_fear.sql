ALTER TABLE "flow_versions" DROP CONSTRAINT "flow_versions_capability_manifest_schema_check";--> statement-breakpoint
ALTER TABLE "flow_execution_attempts" DROP CONSTRAINT "flow_execution_attempts_trace_summary_schema_check";--> statement-breakpoint
ALTER TABLE "flow_execution_tokens" DROP CONSTRAINT "flow_execution_tokens_node_kind_check";--> statement-breakpoint
ALTER TABLE "flow_run_events" DROP CONSTRAINT "flow_run_events_summary_schema_check";--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "ai_calculation_id" uuid;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "ai_interpretation_id" uuid;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "ai_source_checksum" varchar(71);--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "ai_content_checksum" varchar(71);--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD COLUMN "ai_output_text" text;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_ai_interpretation_calculation_fk" FOREIGN KEY ("ai_interpretation_id","ai_calculation_id") REFERENCES "public"."calculation_interpretations"("id","calculation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_approvals_ai_interpretation_unique" ON "flow_approvals" USING btree ("ai_interpretation_id");--> statement-breakpoint
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
      AND jsonb_path_query_array(graph->'nodes', '$[*].kind') <@ '["booking_confirmed","manual_client","birth_data_available","natal_chart_request","natal_chart_ai_draft","astrologer_work_item","astrologer_approval","completed","suppressed","failed"]'::jsonb
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
      AND capability_manifest->'nodeExecutors' <@ '[{"kind":"birth_data_available","configSchemaVersion":1,"executorContractVersion":1},{"kind":"natal_chart_request","configSchemaVersion":1,"executorContractVersion":1},{"kind":"natal_chart_ai_draft","configSchemaVersion":1,"executorContractVersion":1},{"kind":"astrologer_work_item","configSchemaVersion":1,"executorContractVersion":1},{"kind":"astrologer_approval","configSchemaVersion":1,"executorContractVersion":1},{"kind":"completed","configSchemaVersion":1,"executorContractVersion":1},{"kind":"suppressed","configSchemaVersion":1,"executorContractVersion":1},{"kind":"failed","configSchemaVersion":1,"executorContractVersion":1}]'::jsonb
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
      AND capability_manifest->'requiredCapabilities' <@ '["bookings.events.booking_confirmed","clients.birth_data.read.service_preparation","products.read","charts.calculate.natal.booking_context","charts.interpret.natal.ai_draft"]'::jsonb
      AND jsonb_array_length(jsonb_path_query_array(
        capability_manifest->'requiredCapabilities',
        '$[*] ? (@ == "bookings.events.booking_confirmed")'
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
            IN ('booking_confirmed', 'manual_client')
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
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_ai_artifact_provenance_check" CHECK ((
        "flow_approvals"."ai_calculation_id" is null
        and "flow_approvals"."ai_interpretation_id" is null
        and "flow_approvals"."ai_source_checksum" is null
        and "flow_approvals"."ai_content_checksum" is null
        and "flow_approvals"."ai_output_text" is null
      ) or (
        "flow_approvals"."ai_calculation_id" is not null
        and "flow_approvals"."ai_interpretation_id" is not null
        and "flow_approvals"."ai_source_checksum" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_approvals"."ai_content_checksum" ~ '^sha256:[a-f0-9]{64}$'
        and length("flow_approvals"."ai_output_text") between 1 and 26000
      ));--> statement-breakpoint
ALTER TABLE "flow_execution_attempts" ADD CONSTRAINT "flow_execution_attempts_trace_summary_schema_check" CHECK ("flow_execution_attempts"."trace_summary" ?& array[
          'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
        ]::text[]
        and (
          (
            "flow_execution_attempts"."outcome" = 'advanced'
            and "flow_execution_attempts"."trace_summary" ?& array[
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[]
            and jsonb_typeof("flow_execution_attempts"."trace_summary"->'sourceHandle') = 'string'
            and jsonb_typeof("flow_execution_attempts"."trace_summary"->'selectedEdgeId') = 'string'
            and jsonb_typeof("flow_execution_attempts"."trace_summary"->'targetNodeId') = 'string'
            and jsonb_typeof("flow_execution_attempts"."trace_summary"->'targetNodeKind') = 'string'
            and "flow_execution_attempts"."trace_summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode',
              'sourceHandle', 'selectedEdgeId', 'targetNodeId', 'targetNodeKind'
            ]::text[] = '{}'::jsonb
          )
          or (
            "flow_execution_attempts"."outcome" <> 'advanced'
            and "flow_execution_attempts"."trace_summary" - array[
              'schemaVersion', 'outcome', 'nodeKind', 'reasonCode', 'resultCode'
            ]::text[] = '{}'::jsonb
          )
        )
        and jsonb_typeof("flow_execution_attempts"."trace_summary"->'schemaVersion') = 'string'
        and jsonb_typeof("flow_execution_attempts"."trace_summary"->'outcome') = 'string'
        and jsonb_typeof("flow_execution_attempts"."trace_summary"->'nodeKind') = 'string'
        and jsonb_typeof("flow_execution_attempts"."trace_summary"->'reasonCode') = 'string'
        and jsonb_typeof("flow_execution_attempts"."trace_summary"->'resultCode') = 'string'
        and "flow_execution_attempts"."trace_summary"->>'schemaVersion' = 'flow-runtime-trace.v1'
        and "flow_execution_attempts"."trace_summary"->>'nodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
        and "flow_execution_attempts"."trace_summary"->>'nodeKind' = split_part("flow_execution_attempts"."executor_key", ':', 1)
        and "flow_execution_attempts"."result_code" = "flow_execution_attempts"."trace_summary"->>'resultCode'
        and length("flow_execution_attempts"."trace_summary"->>'resultCode') between 1 and 160
        and "flow_execution_attempts"."trace_summary"->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        and (
          (
            "flow_execution_attempts"."outcome" = 'advanced'
            and "flow_execution_attempts"."trace_summary"->>'outcome' = 'advanced'
            and "flow_execution_attempts"."trace_summary"->>'reasonCode' = 'FLOW_EDGE_SELECTED'
            and "flow_execution_attempts"."trace_summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_execution_attempts"."trace_summary"->>'sourceHandle' in ('next', 'true', 'false', 'success', 'error', 'timeout', 'approved', 'rejected')
            and "flow_execution_attempts"."trace_summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
            and length("flow_execution_attempts"."trace_summary"->>'selectedEdgeId') between 1 and 160
            and "flow_execution_attempts"."trace_summary"->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length("flow_execution_attempts"."trace_summary"->>'targetNodeId') between 1 and 160
            and "flow_execution_attempts"."trace_summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
          )
          or
          (
            "flow_execution_attempts"."outcome" = 'waiting'
            and "flow_execution_attempts"."trace_summary"->>'nodeKind' = 'astrologer_work_item'
            and "flow_execution_attempts"."trace_summary"->>'outcome' = 'waiting'
            and "flow_execution_attempts"."trace_summary"->>'reasonCode' = 'FLOW_WORK_ITEM_CREATED'
            and "flow_execution_attempts"."trace_summary"->>'resultCode' = 'FLOW_WAITING_WORK_ITEM'
          )
          or
          (
            "flow_execution_attempts"."outcome" = 'waiting'
            and "flow_execution_attempts"."trace_summary"->>'nodeKind' = 'natal_chart_request'
            and "flow_execution_attempts"."trace_summary"->>'outcome' = 'waiting'
            and "flow_execution_attempts"."trace_summary"->>'reasonCode' = 'FLOW_CHART_CALCULATION_REQUESTED'
            and "flow_execution_attempts"."trace_summary"->>'resultCode' = 'FLOW_WAITING_SIGNAL'
          )
          or
          (
            "flow_execution_attempts"."outcome" = 'waiting'
            and "flow_execution_attempts"."trace_summary"->>'nodeKind' = 'astrologer_approval'
            and "flow_execution_attempts"."trace_summary"->>'outcome' = 'waiting'
            and "flow_execution_attempts"."trace_summary"->>'reasonCode' = 'FLOW_APPROVAL_CREATED'
            and "flow_execution_attempts"."trace_summary"->>'resultCode' = 'FLOW_WAITING_APPROVAL'
          )
          or
          (
            "flow_execution_attempts"."outcome" = 'completed'
            and "flow_execution_attempts"."trace_summary"->>'nodeKind' = 'completed'
            and "flow_execution_attempts"."trace_summary"->>'outcome' = 'terminal'
            and "flow_execution_attempts"."trace_summary"->>'reasonCode' = 'FLOW_GOAL_REACHED'
          )
          or (
            "flow_execution_attempts"."outcome" = 'lease_expired'
            and "flow_execution_attempts"."trace_summary"->>'outcome' = 'lease_expired'
            and "flow_execution_attempts"."trace_summary"->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
            and "flow_execution_attempts"."trace_summary"->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          )
          or (
            "flow_execution_attempts"."outcome" = 'canceled'
            and "flow_execution_attempts"."trace_summary"->>'outcome' = 'canceled'
            and "flow_execution_attempts"."trace_summary"->>'reasonCode' in (
              'FLOW_RUN_CANCELED_BY_OWNER', 'FLOW_BOOKING_CANCELED'
            )
            and "flow_execution_attempts"."trace_summary"->>'resultCode' = 'FLOW_RUN_CANCELED'
          )
          or (
            "flow_execution_attempts"."outcome" = 'retry_scheduled'
            and "flow_execution_attempts"."trace_summary"->>'outcome' = 'retry_scheduled'
            and "flow_execution_attempts"."trace_summary"->>'reasonCode' in ('FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE')
            and "flow_execution_attempts"."trace_summary"->>'resultCode' = 'FLOW_EXECUTION_RETRY_SCHEDULED'
          )
          or (
            "flow_execution_attempts"."outcome" = 'failed'
            and "flow_execution_attempts"."trace_summary"->>'outcome' = 'failed'
            and (
              (
                "flow_execution_attempts"."trace_summary"->>'reasonCode' in ('FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID', 'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH', 'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID', 'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE', 'FLOW_NODE_EXECUTION_REJECTED', 'FLOW_CHART_CALCULATION_FAILED')
                and "flow_execution_attempts"."trace_summary"->>'resultCode' = 'FLOW_EXECUTION_FAILED_TERMINAL'
              )
              or (
                "flow_execution_attempts"."trace_summary"->>'reasonCode' in ('FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE', 'FLOW_TOKEN_LEASE_EXPIRED')
                and "flow_execution_attempts"."trace_summary"->>'resultCode' = 'FLOW_EXECUTION_RETRY_EXHAUSTED'
              )
            )
          )
        ));--> statement-breakpoint
ALTER TABLE "flow_execution_tokens" ADD CONSTRAINT "flow_execution_tokens_node_kind_check" CHECK ("flow_execution_tokens"."node_kind" in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed'));--> statement-breakpoint
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
        and "flow_run_events"."summary"->>'eventKind' in ('booking_confirmed', 'manual_client')
        and "flow_run_events"."summary"->>'triggerNodeId' = "flow_run_events"."node_id"
        and length("flow_run_events"."summary"->>'triggerNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'triggerNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
        and "flow_run_events"."summary"->>'enrollmentPolicyKey' in ('once_per_occurrence')
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
        and "flow_run_events"."summary"->>'nodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
        and length("flow_run_events"."summary"->>'resultCode') between 1 and 160
        and "flow_run_events"."summary"->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        and (
          (
            "flow_run_events"."event_type" = 'token_advanced'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
                and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_approval'
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
            and "flow_run_events"."summary"->>'nodeKind' = 'natal_chart_request'
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_CHART_CALCULATION_COMPLETED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'sourceHandle' = 'next'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
            and length("flow_run_events"."summary"->>'selectedEdgeId') between 1 and 160
            and "flow_run_events"."summary"->>'selectedEdgeId' ~ '^[a-z0-9][a-z0-9_-]*$'
            and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
            and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
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
            and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_approval'
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
            and "flow_run_events"."summary"->>'nodeKind' = 'astrologer_approval'
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'reasonCode' = 'FLOW_APPROVAL_EXPIRED'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'sourceHandle' = 'timeout'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'natal_chart_ai_draft', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
                "flow_run_events"."summary"->>'nodeKind' = 'astrologer_approval'
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
            and "flow_run_events"."summary"->>'nodeKind' = 'completed'
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
      ));