CREATE TABLE "flow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source_revision" integer NOT NULL,
	"approval_mode" text NOT NULL,
	"graph_schema_version" text NOT NULL,
	"graph" jsonb NOT NULL,
	"presentation" jsonb,
	"capability_manifest" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "flow_versions_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "flow_versions_flow_id_id_unique" UNIQUE("flow_id","id"),
	CONSTRAINT "flow_versions_flow_id_id_owner_unique" UNIQUE("flow_id","id","owner_user_id"),
	CONSTRAINT "flow_versions_flow_id_id_owner_published_unique" UNIQUE("flow_id","id","owner_user_id","published_at"),
	CONSTRAINT "flow_versions_positive_version_check" CHECK ("flow_versions"."version" > 0),
	CONSTRAINT "flow_versions_source_revision_check" CHECK ("flow_versions"."source_revision" > 0),
	CONSTRAINT "flow_versions_approval_mode_check" CHECK ("flow_versions"."approval_mode" in ('draft_only', 'manual_approve', 'auto_internal', 'auto_send')),
	CONSTRAINT "flow_versions_graph_object_check" CHECK (jsonb_typeof("flow_versions"."graph") = 'object'),
	CONSTRAINT "flow_versions_presentation_object_check" CHECK ("flow_versions"."presentation" is null or jsonb_typeof("flow_versions"."presentation") = 'object'),
	CONSTRAINT "flow_versions_v2_metadata_check" CHECK ("flow_versions"."graph_schema_version" = 'flow-graph.v2'
          and "flow_versions"."graph"->>'schemaVersion' = 'flow-graph.v2'
          and jsonb_typeof("flow_versions"."capability_manifest") = 'object'),
	CONSTRAINT "flow_versions_capability_manifest_schema_check" CHECK ((
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
      AND jsonb_path_query_array(graph->'nodes', '$[*].kind') <@ '["booking_confirmed","manual_client","birth_data_available","natal_chart_request","astrologer_work_item","astrologer_approval","completed","suppressed","failed"]'::jsonb
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
      AND capability_manifest->'nodeExecutors' <@ '[{"kind":"birth_data_available","configSchemaVersion":1,"executorContractVersion":1},{"kind":"natal_chart_request","configSchemaVersion":1,"executorContractVersion":1},{"kind":"astrologer_work_item","configSchemaVersion":1,"executorContractVersion":1},{"kind":"astrologer_approval","configSchemaVersion":1,"executorContractVersion":1},{"kind":"completed","configSchemaVersion":1,"executorContractVersion":1},{"kind":"suppressed","configSchemaVersion":1,"executorContractVersion":1},{"kind":"failed","configSchemaVersion":1,"executorContractVersion":1}]'::jsonb
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
      AND capability_manifest->'requiredCapabilities' <@ '["bookings.events.booking_confirmed","clients.birth_data.read.service_preparation","products.read","charts.calculate.natal.booking_context"]'::jsonb
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

) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"origin" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"definition_state" text DEFAULT 'draft' NOT NULL,
	"approval_mode" text DEFAULT 'manual_approve' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"draft_base_version_id" uuid,
	"draft_graph" jsonb NOT NULL,
	"draft_presentation" jsonb,
	"published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "flows_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "flows_name_length_check" CHECK (length(trim("flows"."name")) between 1 and 180),
	CONSTRAINT "flows_status_check" CHECK ("flows"."status" in ('draft', 'published', 'active', 'paused', 'archived')),
	CONSTRAINT "flows_definition_state_check" CHECK ("flows"."definition_state" in ('draft', 'versioned', 'archived')),
	CONSTRAINT "flows_revision_check" CHECK ("flows"."revision" > 0),
	CONSTRAINT "flows_definition_lifecycle_check" CHECK ((
          "flows"."definition_state" = 'draft'
          and (
            (
              "flows"."published_version_id" is null
              and "flows"."published_at" is null
              and "flows"."draft_base_version_id" is null
            ) or (
              "flows"."published_version_id" is not null
              and "flows"."published_at" is not null
              and "flows"."draft_base_version_id" = "flows"."published_version_id"
            )
          )
        ) or (
          "flows"."definition_state" = 'versioned'
          and "flows"."published_version_id" is not null
          and "flows"."published_at" is not null
          and "flows"."draft_base_version_id" is null
        ) or (
          "flows"."definition_state" = 'archived'
          and (
            (
              "flows"."published_version_id" is null
              and "flows"."published_at" is null
              and "flows"."draft_base_version_id" is null
            ) or (
              "flows"."published_version_id" is not null
              and "flows"."published_at" is not null
              and (
                "flows"."draft_base_version_id" is null
                or "flows"."draft_base_version_id" = "flows"."published_version_id"
              )
            )
          )
        )),
	CONSTRAINT "flows_approval_mode_check" CHECK ("flows"."approval_mode" in ('draft_only', 'manual_approve', 'auto_internal', 'auto_send')),
	CONSTRAINT "flows_draft_graph_object_check" CHECK (jsonb_typeof("flows"."draft_graph") = 'object'),
	CONSTRAINT "flows_graph_origin_check" CHECK ("flows"."draft_graph"->>'schemaVersion' = 'flow-graph.v2'
          and jsonb_typeof("flows"."origin") = 'object'
          and "flows"."origin"->>'schemaVersion' = 'flow-definition-origin.v1'
          and "flows"."origin"->>'type' in ('blank', 'template')),
	CONSTRAINT "flows_draft_presentation_object_check" CHECK ("flows"."draft_presentation" is null or jsonb_typeof("flows"."draft_presentation") = 'object')
);
--> statement-breakpoint
CREATE TABLE "flow_definition_command_outcomes" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_definition_command_outcomes_response_check" CHECK ((
        "flow_definition_command_outcomes"."response_status" in (200, 201)
        or "flow_definition_command_outcomes"."response_status" between 400 and 499
      ) and jsonb_typeof("flow_definition_command_outcomes"."response_body") = 'object')
);
--> statement-breakpoint
CREATE TABLE "flow_definition_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_surface" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"route_template" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"command_scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"completed_at" timestamp with time zone,
	"replay_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_definition_commands_id_resource_owner_unique" UNIQUE("id","resource_id","owner_user_id"),
	CONSTRAINT "flow_definition_commands_scope_check" CHECK ("flow_definition_commands"."api_surface" = 'astrologer-api'
        and "flow_definition_commands"."command_scope" in ('flows.definition.create.v2', 'flows.definition.update-draft.v2', 'flows.definition.publish.v2', 'flows.definition.create-next-draft.v2')
        and (
          (
            "flow_definition_commands"."route_template" = '/flows'
            and "flow_definition_commands"."command_scope" = 'flows.definition.create.v2'
            and "flow_definition_commands"."resource_id" = "flow_definition_commands"."owner_user_id"
          )
          or ("flow_definition_commands"."route_template" = '/flows/:flowId/draft' and "flow_definition_commands"."command_scope" = 'flows.definition.update-draft.v2')
          or ("flow_definition_commands"."route_template" = '/flows/:flowId/publish' and "flow_definition_commands"."command_scope" = 'flows.definition.publish.v2')
          or ("flow_definition_commands"."route_template" = '/flows/:flowId/next-draft' and "flow_definition_commands"."command_scope" = 'flows.definition.create-next-draft.v2')
        )),
	CONSTRAINT "flow_definition_commands_key_check" CHECK (length("flow_definition_commands"."idempotency_key") between 8 and 128
        and "flow_definition_commands"."idempotency_key" ~ '^[A-Za-z0-9._:-]+$'),
	CONSTRAINT "flow_definition_commands_request_hash_check" CHECK ("flow_definition_commands"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "flow_definition_commands_state_check" CHECK ("flow_definition_commands"."state" in ('processing', 'succeeded', 'failed')),
	CONSTRAINT "flow_definition_commands_terminal_state_check" CHECK ((
        "flow_definition_commands"."state" = 'processing'
        and "flow_definition_commands"."completed_at" is null
      ) or (
        "flow_definition_commands"."state" in ('succeeded', 'failed')
        and "flow_definition_commands"."completed_at" is not null
      )),
	CONSTRAINT "flow_definition_commands_replay_window_check" CHECK ("flow_definition_commands"."replay_until" = "flow_definition_commands"."created_at" + interval '24 hours'),
	CONSTRAINT "flow_definition_commands_completion_check" CHECK ("flow_definition_commands"."completed_at" is null or "flow_definition_commands"."completed_at" >= "flow_definition_commands"."created_at")
);
--> statement-breakpoint
CREATE TABLE "flow_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_run_id" uuid NOT NULL,
	"flow_step_run_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"preview" text NOT NULL,
	"decision_note" text,
	"decided_by_user_id" uuid,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "flow_approvals_status_check" CHECK ("flow_approvals"."status" in ('pending', 'approved', 'rejected', 'snoozed', 'expired')),
	CONSTRAINT "flow_approvals_kind_check" CHECK ("flow_approvals"."kind" in ('message', 'ai_output', 'delivery', 'payment_offer', 'manual_task')),
	CONSTRAINT "flow_approvals_title_length_check" CHECK (length(trim("flow_approvals"."title")) between 1 and 180),
	CONSTRAINT "flow_approvals_preview_length_check" CHECK (length(trim("flow_approvals"."preview")) between 1 and 1000),
	CONSTRAINT "flow_approvals_decision_note_length_check" CHECK ("flow_approvals"."decision_note" is null or length(trim("flow_approvals"."decision_note")) between 1 and 1000),
	CONSTRAINT "flow_approvals_pending_decision_check" CHECK ("flow_approvals"."status" <> 'pending' or ("flow_approvals"."decided_at" is null and "flow_approvals"."decided_by_user_id" is null and "flow_approvals"."snoozed_until" is null)),
	CONSTRAINT "flow_approvals_decided_status_check" CHECK ("flow_approvals"."status" in ('pending', 'expired') or ("flow_approvals"."decided_at" is not null and "flow_approvals"."decided_by_user_id" is not null)),
	CONSTRAINT "flow_approvals_snoozed_until_check" CHECK ("flow_approvals"."status" <> 'snoozed' or "flow_approvals"."snoozed_until" is not null)
);
--> statement-breakpoint
CREATE TABLE "flow_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_run_id" uuid NOT NULL,
	"flow_step_run_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_request_payload" jsonb,
	"provider_response_payload" jsonb,
	"error_code" text,
	"error_message" text,
	"attempted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_delivery_attempts_status_check" CHECK ("flow_delivery_attempts"."status" in ('pending', 'sent', 'failed', 'unknown')),
	CONSTRAINT "flow_delivery_attempts_idempotency_key_length_check" CHECK (length(trim("flow_delivery_attempts"."idempotency_key")) between 1 and 240),
	CONSTRAINT "flow_delivery_attempts_number_check" CHECK ("flow_delivery_attempts"."attempt_number" > 0),
	CONSTRAINT "flow_delivery_attempts_provider_length_check" CHECK ("flow_delivery_attempts"."provider" is null or length(trim("flow_delivery_attempts"."provider")) between 1 and 120),
	CONSTRAINT "flow_delivery_attempts_request_payload_object_check" CHECK ("flow_delivery_attempts"."provider_request_payload" is null or jsonb_typeof("flow_delivery_attempts"."provider_request_payload") = 'object'),
	CONSTRAINT "flow_delivery_attempts_response_payload_object_check" CHECK ("flow_delivery_attempts"."provider_response_payload" is null or jsonb_typeof("flow_delivery_attempts"."provider_response_payload") = 'object'),
	CONSTRAINT "flow_delivery_attempts_error_code_length_check" CHECK ("flow_delivery_attempts"."error_code" is null or length(trim("flow_delivery_attempts"."error_code")) between 1 and 120),
	CONSTRAINT "flow_delivery_attempts_error_message_length_check" CHECK ("flow_delivery_attempts"."error_message" is null or length(trim("flow_delivery_attempts"."error_message")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "flow_execution_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_run_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"executor_key" text NOT NULL,
	"node_activation_sequence" bigint NOT NULL,
	"attempt_number" bigint NOT NULL,
	"fencing_token" bigint NOT NULL,
	"lease_owner" text NOT NULL,
	"control_policy_revision" integer,
	"policy_digest" varchar(71),
	"worker_session_id" uuid,
	"worker_registration_digest" varchar(71),
	"outcome" text NOT NULL,
	"result_code" text NOT NULL,
	"trace_summary" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_execution_attempts_id_run_owner_unique" UNIQUE("id","flow_run_id","owner_user_id"),
	CONSTRAINT "flow_execution_attempts_outcome_check" CHECK ("flow_execution_attempts"."outcome" in ('advanced', 'waiting', 'retry_scheduled', 'completed', 'failed', 'lease_expired', 'canceled')),
	CONSTRAINT "flow_execution_attempts_node_activation_sequence_check" CHECK ("flow_execution_attempts"."node_activation_sequence" > 0),
	CONSTRAINT "flow_execution_attempts_number_check" CHECK ("flow_execution_attempts"."attempt_number" between 1 and 3 and "flow_execution_attempts"."fencing_token" >= "flow_execution_attempts"."attempt_number"),
	CONSTRAINT "flow_execution_attempts_claim_authority_check" CHECK ((
        "flow_execution_attempts"."control_policy_revision" is null
        and "flow_execution_attempts"."policy_digest" is null
        and "flow_execution_attempts"."worker_session_id" is null
        and "flow_execution_attempts"."worker_registration_digest" is null
      ) or (
        "flow_execution_attempts"."control_policy_revision" > 0
        and "flow_execution_attempts"."policy_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_execution_attempts"."worker_session_id" is not null
        and "flow_execution_attempts"."worker_registration_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_execution_attempts"."lease_owner" = "flow_execution_attempts"."worker_session_id"::text
      )),
	CONSTRAINT "flow_execution_attempts_node_id_length_check" CHECK (length(trim("flow_execution_attempts"."node_id")) between 1 and 160),
	CONSTRAINT "flow_execution_attempts_executor_key_length_check" CHECK (length(trim("flow_execution_attempts"."executor_key")) between 1 and 180),
	CONSTRAINT "flow_execution_attempts_lease_owner_length_check" CHECK (length(trim("flow_execution_attempts"."lease_owner")) between 1 and 180),
	CONSTRAINT "flow_execution_attempts_result_code_length_check" CHECK (length(trim("flow_execution_attempts"."result_code")) between 1 and 160),
	CONSTRAINT "flow_execution_attempts_trace_summary_object_check" CHECK (jsonb_typeof("flow_execution_attempts"."trace_summary") = 'object'),
	CONSTRAINT "flow_execution_attempts_trace_summary_schema_check" CHECK ("flow_execution_attempts"."trace_summary" ?& array[
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
        and "flow_execution_attempts"."trace_summary"->>'nodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
            and "flow_execution_attempts"."trace_summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
        )),
	CONSTRAINT "flow_execution_attempts_time_order_check" CHECK ("flow_execution_attempts"."completed_at" >= "flow_execution_attempts"."started_at")
);
--> statement-breakpoint
CREATE TABLE "flow_execution_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_run_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"node_kind" text NOT NULL,
	"config_schema_version" integer NOT NULL,
	"executor_contract_version" integer NOT NULL,
	"executor_key" text NOT NULL,
	"state" text DEFAULT 'runnable' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"claim_control_policy_revision" integer,
	"claim_policy_digest" varchar(71),
	"claim_worker_session_id" uuid,
	"claim_worker_registration_digest" varchar(71),
	"node_activation_sequence" bigint DEFAULT 1 NOT NULL,
	"attempt_counter" bigint DEFAULT 0 NOT NULL,
	"fencing_token" bigint DEFAULT 0 NOT NULL,
	"retry_policy_key" text DEFAULT 'flow-execution-retry.v1' NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"retry_base_delay_ms" integer DEFAULT 1000 NOT NULL,
	"retry_max_delay_ms" integer DEFAULT 60000 NOT NULL,
	"failure_disposition" text,
	"failure_reason_code" text,
	"terminal_at" timestamp with time zone,
	"quarantined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_execution_tokens_id_run_owner_unique" UNIQUE("id","flow_run_id","owner_user_id"),
	CONSTRAINT "flow_execution_tokens_state_check" CHECK ("flow_execution_tokens"."state" in ('runnable', 'claimed', 'waiting_timer', 'waiting_signal', 'waiting_external', 'waiting_work_item', 'waiting_approval', 'retry_scheduled', 'completed', 'failed', 'canceled')),
	CONSTRAINT "flow_execution_tokens_node_id_length_check" CHECK (length(trim("flow_execution_tokens"."node_id")) between 1 and 160),
	CONSTRAINT "flow_execution_tokens_node_kind_length_check" CHECK (length(trim("flow_execution_tokens"."node_kind")) between 1 and 80),
	CONSTRAINT "flow_execution_tokens_node_kind_check" CHECK ("flow_execution_tokens"."node_kind" in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')),
	CONSTRAINT "flow_execution_tokens_executor_versions_check" CHECK ("flow_execution_tokens"."config_schema_version" > 0 and "flow_execution_tokens"."executor_contract_version" > 0),
	CONSTRAINT "flow_execution_tokens_executor_key_check" CHECK ("flow_execution_tokens"."executor_key" = "flow_execution_tokens"."node_kind" || ':' || "flow_execution_tokens"."config_schema_version"::text || ':' || "flow_execution_tokens"."executor_contract_version"::text),
	CONSTRAINT "flow_execution_tokens_lease_owner_length_check" CHECK ("flow_execution_tokens"."lease_owner" is null or length(trim("flow_execution_tokens"."lease_owner")) between 1 and 180),
	CONSTRAINT "flow_execution_tokens_node_activation_sequence_check" CHECK ("flow_execution_tokens"."node_activation_sequence" > 0),
	CONSTRAINT "flow_execution_tokens_lease_state_check" CHECK ((
        "flow_execution_tokens"."state" = 'claimed'
        and "flow_execution_tokens"."claimed_at" is not null
        and "flow_execution_tokens"."lease_owner" is not null
        and "flow_execution_tokens"."lease_expires_at" is not null
        and "flow_execution_tokens"."claimed_at" <= "flow_execution_tokens"."lease_expires_at"
        and "flow_execution_tokens"."claimed_at" <= "flow_execution_tokens"."updated_at"
      ) or (
        "flow_execution_tokens"."state" <> 'claimed'
        and "flow_execution_tokens"."claimed_at" is null
        and "flow_execution_tokens"."lease_owner" is null
        and "flow_execution_tokens"."lease_expires_at" is null
      )),
	CONSTRAINT "flow_execution_tokens_claim_authority_check" CHECK ((
        "flow_execution_tokens"."claim_control_policy_revision" is null
        and "flow_execution_tokens"."claim_policy_digest" is null
        and "flow_execution_tokens"."claim_worker_session_id" is null
        and "flow_execution_tokens"."claim_worker_registration_digest" is null
      ) or (
        "flow_execution_tokens"."claim_control_policy_revision" > 0
        and "flow_execution_tokens"."claim_policy_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_execution_tokens"."claim_worker_session_id" is not null
        and "flow_execution_tokens"."claim_worker_registration_digest" ~ '^sha256:[a-f0-9]{64}$'
        and ("flow_execution_tokens"."state" <> 'claimed'
          or "flow_execution_tokens"."lease_owner" = "flow_execution_tokens"."claim_worker_session_id"::text)
      )),
	CONSTRAINT "flow_execution_tokens_attempt_counter_check" CHECK ("flow_execution_tokens"."attempt_counter" between 0 and "flow_execution_tokens"."max_attempts"),
	CONSTRAINT "flow_execution_tokens_fencing_token_check" CHECK ("flow_execution_tokens"."fencing_token" >= "flow_execution_tokens"."attempt_counter"),
	CONSTRAINT "flow_execution_tokens_counter_state_check" CHECK (("flow_execution_tokens"."state" not in ('runnable', 'retry_scheduled')
          or "flow_execution_tokens"."attempt_counter" < "flow_execution_tokens"."max_attempts")
        and ("flow_execution_tokens"."state" not in ('claimed', 'retry_scheduled')
          or "flow_execution_tokens"."attempt_counter" > 0)),
	CONSTRAINT "flow_execution_tokens_retry_policy_check" CHECK ("flow_execution_tokens"."retry_policy_key" = 'flow-execution-retry.v1'
        and "flow_execution_tokens"."max_attempts" = 3
        and "flow_execution_tokens"."retry_base_delay_ms" = 1000
        and "flow_execution_tokens"."retry_max_delay_ms" = 60000),
	CONSTRAINT "flow_execution_tokens_failure_disposition_check" CHECK ("flow_execution_tokens"."failure_disposition" is null
        or "flow_execution_tokens"."failure_disposition" in ('retry_scheduled', 'failed_terminal', 'quarantined')),
	CONSTRAINT "flow_execution_tokens_failure_reason_check" CHECK ("flow_execution_tokens"."failure_reason_code" is null
        or "flow_execution_tokens"."failure_reason_code" in ('FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID', 'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH', 'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID', 'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE', 'FLOW_NODE_EXECUTION_REJECTED', 'FLOW_CHART_CALCULATION_FAILED', 'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE', 'FLOW_TOKEN_LEASE_EXPIRED')),
	CONSTRAINT "flow_execution_tokens_failure_state_check" CHECK ((
        "flow_execution_tokens"."state" = 'retry_scheduled'
        and "flow_execution_tokens"."failure_disposition" is not null
        and "flow_execution_tokens"."failure_disposition" = 'retry_scheduled'
        and "flow_execution_tokens"."failure_reason_code" is not null
        and "flow_execution_tokens"."failure_reason_code" in ('FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE', 'FLOW_TOKEN_LEASE_EXPIRED')
        and "flow_execution_tokens"."quarantined_at" is null
      ) or (
        "flow_execution_tokens"."state" = 'failed'
        and "flow_execution_tokens"."failure_disposition" is not null
        and "flow_execution_tokens"."failure_reason_code" is not null
        and (
          ("flow_execution_tokens"."failure_disposition" = 'quarantined'
            and "flow_execution_tokens"."failure_reason_code" in ('FLOW_PINNED_GRAPH_INVALID', 'FLOW_PINNED_CAPABILITY_MANIFEST_INVALID', 'FLOW_TOKEN_NODE_NOT_FOUND', 'FLOW_TOKEN_NODE_METADATA_MISMATCH', 'FLOW_TOKEN_EXECUTOR_MANIFEST_MISMATCH', 'FLOW_TOKEN_RUNTIME_STATE_INVALID', 'FLOW_RUNTIME_TRACE_INVALID', 'FLOW_NODE_EXECUTOR_UNAVAILABLE')
            and "flow_execution_tokens"."quarantined_at" is not null)
          or ("flow_execution_tokens"."failure_disposition" = 'failed_terminal'
            and "flow_execution_tokens"."failure_reason_code" in ('FLOW_NODE_EXECUTION_REJECTED', 'FLOW_CHART_CALCULATION_FAILED', 'FLOW_NODE_EXECUTION_RETRYABLE', 'FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE', 'FLOW_TOKEN_LEASE_EXPIRED')
            and "flow_execution_tokens"."quarantined_at" is null)
        )
      ) or (
        "flow_execution_tokens"."state" not in ('retry_scheduled', 'failed')
        and "flow_execution_tokens"."failure_disposition" is null
        and "flow_execution_tokens"."failure_reason_code" is null
        and "flow_execution_tokens"."quarantined_at" is null
      )),
	CONSTRAINT "flow_execution_tokens_terminal_state_check" CHECK ((
        "flow_execution_tokens"."state" in ('completed', 'failed', 'canceled')
        and "flow_execution_tokens"."terminal_at" is not null
      ) or (
        "flow_execution_tokens"."state" not in ('completed', 'failed', 'canceled')
        and "flow_execution_tokens"."terminal_at" is null
      )),
	CONSTRAINT "flow_execution_tokens_completed_node_check" CHECK ("flow_execution_tokens"."state" <> 'completed' or "flow_execution_tokens"."node_kind" = 'completed')
);
--> statement-breakpoint
CREATE TABLE "flow_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_run_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"event_type" text NOT NULL,
	"node_id" text,
	"attempt_id" uuid,
	"command_id" uuid,
	"booking_lifecycle_event_id" uuid,
	"summary" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_run_events_id_run_owner_unique" UNIQUE("id","flow_run_id","owner_user_id"),
	CONSTRAINT "flow_run_events_type_check" CHECK ("flow_run_events"."event_type" in ('run_enrolled', 'token_advanced', 'token_waiting', 'token_signaled', 'work_item_available', 'booking_rescheduled', 'token_retry_scheduled', 'token_lease_expired', 'run_completed', 'run_failed', 'run_suppressed', 'run_canceled')),
	CONSTRAINT "flow_run_events_sequence_check" CHECK ("flow_run_events"."sequence" > 0),
	CONSTRAINT "flow_run_events_booking_lifecycle_provenance_check" CHECK ((
        "flow_run_events"."event_type" = 'run_canceled'
        and ("flow_run_events"."command_id" is null) <> ("flow_run_events"."booking_lifecycle_event_id" is null)
      ) or (
        "flow_run_events"."event_type" = 'booking_rescheduled'
        and "flow_run_events"."attempt_id" is null
        and "flow_run_events"."command_id" is null
        and "flow_run_events"."booking_lifecycle_event_id" is not null
      ) or (
        "flow_run_events"."event_type" not in ('run_canceled', 'booking_rescheduled')
        and "flow_run_events"."booking_lifecycle_event_id" is null
      )),
	CONSTRAINT "flow_run_events_node_id_length_check" CHECK ("flow_run_events"."node_id" is null or length(trim("flow_run_events"."node_id")) between 1 and 160),
	CONSTRAINT "flow_run_events_summary_object_check" CHECK (jsonb_typeof("flow_run_events"."summary") = 'object'),
	CONSTRAINT "flow_run_events_summary_schema_check" CHECK ((
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
        and "flow_run_events"."summary"->>'eventKind' = 'booking_confirmed'
        and "flow_run_events"."summary"->>'triggerNodeId' = "flow_run_events"."node_id"
        and length("flow_run_events"."summary"->>'triggerNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'triggerNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
              'token_advanced', 'token_signaled', 'work_item_available', 'booking_rescheduled'
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
        and "flow_run_events"."summary"->>'nodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
        and length("flow_run_events"."summary"->>'resultCode') between 1 and 160
        and "flow_run_events"."summary"->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        and (
          (
            "flow_run_events"."event_type" = 'token_advanced'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
      ))
);
--> statement-breakpoint
CREATE TABLE "flow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"runtime_event_id" uuid NOT NULL,
	"activation_epoch_id" uuid,
	"trigger_node_id" text,
	"occurrence_key" text,
	"enrollment_policy_key" text,
	"enrollment_policy_revision" integer,
	"execution_authority_basis" text,
	"execution_authority_ref_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"current_node_id" text,
	"trace_sequence" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "flow_runs_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "flow_runs_id_version_owner_unique" UNIQUE("id","flow_version_id","owner_user_id"),
	CONSTRAINT "flow_runs_id_event_owner_unique" UNIQUE("id","runtime_event_id","owner_user_id"),
	CONSTRAINT "flow_runs_id_flow_event_owner_unique" UNIQUE("id","flow_id","runtime_event_id","owner_user_id"),
	CONSTRAINT "flow_runs_status_check" CHECK ("flow_runs"."status" in ('pending', 'running', 'waiting', 'approval_required', 'completed', 'skipped', 'failed_retryable', 'failed_terminal', 'suppressed', 'expired', 'canceled')),
	CONSTRAINT "flow_runs_snapshot_object_check" CHECK (jsonb_typeof("flow_runs"."snapshot") = 'object'),
	CONSTRAINT "flow_runs_trace_sequence_check" CHECK ("flow_runs"."trace_sequence" >= 0),
	CONSTRAINT "flow_runs_current_node_id_length_check" CHECK ("flow_runs"."current_node_id" is null or length(trim("flow_runs"."current_node_id")) between 1 and 160),
	CONSTRAINT "flow_runs_enrollment_shape_check" CHECK ((
        "flow_runs"."activation_epoch_id" is null
        and "flow_runs"."trigger_node_id" is null
        and "flow_runs"."occurrence_key" is null
        and "flow_runs"."enrollment_policy_key" is null
        and "flow_runs"."enrollment_policy_revision" is null
        and "flow_runs"."execution_authority_basis" is null
        and "flow_runs"."execution_authority_ref_id" is null
      ) or (
        "flow_runs"."activation_epoch_id" is not null
        and length(trim("flow_runs"."trigger_node_id")) between 1 and 160
        and "flow_runs"."trigger_node_id" ~ '^[a-z0-9][a-z0-9_-]*$'
        and length(trim("flow_runs"."occurrence_key")) between 1 and 180
        and "flow_runs"."enrollment_policy_key" in ('once_per_occurrence')
        and "flow_runs"."enrollment_policy_revision" = 1
        and "flow_runs"."execution_authority_basis" in ('current_entitlement', 'paid_order_obligation')
        and length(trim("flow_runs"."execution_authority_ref_id")) between 1 and 180
      ))
);
--> statement-breakpoint
CREATE TABLE "flow_runtime_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"event_kind" text,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"occurrence_key" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload_schema_version" integer,
	"payload_digest" varchar(71),
	"payload" jsonb NOT NULL,
	"classification" text,
	"redaction_version" integer,
	"retention_policy_id" text,
	"ingestion_outcome" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_runtime_events_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "flow_runtime_events_source_check" CHECK ("flow_runtime_events"."source" in ('crm', 'product', 'order', 'booking', 'message', 'chart', 'astro_calendar', 'manual')),
	CONSTRAINT "flow_runtime_events_subject_type_check" CHECK ("flow_runtime_events"."subject_type" in ('client', 'segment', 'order', 'booking', 'global_event', 'manual')),
	CONSTRAINT "flow_runtime_events_source_event_id_length_check" CHECK (length(trim("flow_runtime_events"."source_event_id")) between 1 and 180),
	CONSTRAINT "flow_runtime_events_dedupe_key_length_check" CHECK (length(trim("flow_runtime_events"."dedupe_key")) between 1 and 240),
	CONSTRAINT "flow_runtime_events_subject_id_length_check" CHECK (length(trim("flow_runtime_events"."subject_id")) between 1 and 180),
	CONSTRAINT "flow_runtime_events_payload_object_check" CHECK (jsonb_typeof("flow_runtime_events"."payload") = 'object'),
	CONSTRAINT "flow_runtime_events_payload_digest_check" CHECK ("flow_runtime_events"."payload_digest" is null or "flow_runtime_events"."payload_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "flow_runtime_events_normalized_shape_check" CHECK ((
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
        "flow_runtime_events"."event_kind" in ('booking_confirmed')
        and length(trim("flow_runtime_events"."occurrence_key")) between 1 and 180
        and "flow_runtime_events"."payload_schema_version" = 1
        and "flow_runtime_events"."payload_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_runtime_events"."classification" in ('personal')
        and "flow_runtime_events"."redaction_version" = 1
        and length(trim("flow_runtime_events"."retention_policy_id")) between 1 and 180
        and "flow_runtime_events"."ingestion_outcome" in ('enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed')
        and "flow_runtime_events"."processed_at" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "flow_step_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"output_snapshot" jsonb,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "flow_step_runs_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "flow_step_runs_id_run_owner_unique" UNIQUE("id","flow_run_id","owner_user_id"),
	CONSTRAINT "flow_step_runs_status_check" CHECK ("flow_step_runs"."status" in ('pending', 'running', 'waiting', 'approval_required', 'completed', 'skipped', 'failed_retryable', 'failed_terminal', 'suppressed', 'expired', 'canceled')),
	CONSTRAINT "flow_step_runs_node_id_length_check" CHECK (length(trim("flow_step_runs"."node_id")) between 1 and 160),
	CONSTRAINT "flow_step_runs_input_snapshot_object_check" CHECK (jsonb_typeof("flow_step_runs"."input_snapshot") = 'object'),
	CONSTRAINT "flow_step_runs_output_snapshot_object_check" CHECK ("flow_step_runs"."output_snapshot" is null or jsonb_typeof("flow_step_runs"."output_snapshot") = 'object'),
	CONSTRAINT "flow_step_runs_error_code_length_check" CHECK ("flow_step_runs"."error_code" is null or length(trim("flow_step_runs"."error_code")) between 1 and 120),
	CONSTRAINT "flow_step_runs_error_message_length_check" CHECK ("flow_step_runs"."error_message" is null or length(trim("flow_step_runs"."error_message")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "flow_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_id" uuid NOT NULL,
	"runtime_event_id" uuid NOT NULL,
	"flow_run_id" uuid,
	"reason" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_suppressions_reason_check" CHECK ("flow_suppressions"."reason" in ('FLOW_NOT_PUBLISHED', 'FLOW_NOT_ACTIVE', 'OWNER_RELATIONSHIP_REQUIRED', 'CHANNEL_CONSENT_REQUIRED', 'QUIET_HOURS_HOLD', 'FREQUENCY_CAP_HOLD', 'PLAN_LIMIT_REACHED', 'AUTO_SEND_DISABLED')),
	CONSTRAINT "flow_suppressions_details_object_check" CHECK (jsonb_typeof("flow_suppressions"."details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "flow_execution_signal_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_event_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "flow_execution_signal_inbox_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "flow_execution_signal_inbox_type_check" CHECK ("flow_execution_signal_inbox"."signal_type" in ('chart.calculation.terminal.v1')),
	CONSTRAINT "flow_execution_signal_inbox_outcome_check" CHECK ("flow_execution_signal_inbox"."outcome" in ('succeeded', 'failed')),
	CONSTRAINT "flow_execution_signal_inbox_clock_check" CHECK ("flow_execution_signal_inbox"."received_at" >= "flow_execution_signal_inbox"."occurred_at")
);
--> statement-breakpoint
CREATE TABLE "flow_execution_signal_waits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_run_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"node_activation_sequence" bigint NOT NULL,
	"node_id" text NOT NULL,
	"signal_type" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"success_handle" text NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"consumed_signal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "flow_execution_signal_waits_id_run_owner_unique" UNIQUE("id","flow_run_id","owner_user_id"),
	CONSTRAINT "flow_execution_signal_waits_type_check" CHECK ("flow_execution_signal_waits"."signal_type" in ('chart.calculation.terminal.v1')),
	CONSTRAINT "flow_execution_signal_waits_state_check" CHECK ("flow_execution_signal_waits"."state" in ('waiting', 'consumed', 'canceled')),
	CONSTRAINT "flow_execution_signal_waits_node_check" CHECK ("flow_execution_signal_waits"."node_activation_sequence" > 0
        and length(trim("flow_execution_signal_waits"."node_id")) between 1 and 160
        and "flow_execution_signal_waits"."node_id" ~ '^[a-z0-9][a-z0-9_-]*$'
        and "flow_execution_signal_waits"."success_handle" = 'next'),
	CONSTRAINT "flow_execution_signal_waits_lifecycle_check" CHECK ((
        "flow_execution_signal_waits"."state" = 'waiting'
        and "flow_execution_signal_waits"."consumed_signal_id" is null
        and "flow_execution_signal_waits"."consumed_at" is null
        and "flow_execution_signal_waits"."canceled_at" is null
      ) or (
        "flow_execution_signal_waits"."state" = 'consumed'
        and "flow_execution_signal_waits"."consumed_signal_id" is not null
        and "flow_execution_signal_waits"."consumed_at" is not null
        and "flow_execution_signal_waits"."canceled_at" is null
      ) or (
        "flow_execution_signal_waits"."state" = 'canceled'
        and "flow_execution_signal_waits"."consumed_signal_id" is null
        and "flow_execution_signal_waits"."consumed_at" is null
        and "flow_execution_signal_waits"."canceled_at" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "flow_runtime_command_outcomes" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_runtime_command_outcomes_response_check" CHECK ("flow_runtime_command_outcomes"."response_status" in (200, 404, 409)
        and jsonb_typeof("flow_runtime_command_outcomes"."response_body") = 'object')
);
--> statement-breakpoint
CREATE TABLE "flow_runtime_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_surface" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"route_template" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"flow_run_id" uuid,
	"command_scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"completed_at" timestamp with time zone,
	"replay_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_runtime_commands_id_resource_owner_unique" UNIQUE("id","resource_id","owner_user_id"),
	CONSTRAINT "flow_runtime_commands_id_run_owner_unique" UNIQUE("id","flow_run_id","owner_user_id"),
	CONSTRAINT "flow_runtime_commands_scope_check" CHECK ("flow_runtime_commands"."api_surface" = 'astrologer-api'
        and "flow_runtime_commands"."route_template" in ('/flow-runs/:runId/cancel', '/flow-work-items/:workItemId/start', '/flow-work-items/:workItemId/snooze', '/flow-work-items/:workItemId/complete')
        and "flow_runtime_commands"."command_scope" in ('flows.runtime.cancel.v1', 'flows.work-items.start.v1', 'flows.work-items.snooze.v1', 'flows.work-items.complete.v1')
        and (
          ("flow_runtime_commands"."route_template" = '/flow-runs/:runId/cancel'
            and "flow_runtime_commands"."command_scope" = 'flows.runtime.cancel.v1'
            and "flow_runtime_commands"."flow_run_id" = "flow_runtime_commands"."resource_id")
          or ("flow_runtime_commands"."route_template" = '/flow-work-items/:workItemId/start'
            and "flow_runtime_commands"."command_scope" = 'flows.work-items.start.v1')
          or ("flow_runtime_commands"."route_template" = '/flow-work-items/:workItemId/snooze'
            and "flow_runtime_commands"."command_scope" = 'flows.work-items.snooze.v1')
          or ("flow_runtime_commands"."route_template" = '/flow-work-items/:workItemId/complete'
            and "flow_runtime_commands"."command_scope" = 'flows.work-items.complete.v1')
        )),
	CONSTRAINT "flow_runtime_commands_key_check" CHECK (length("flow_runtime_commands"."idempotency_key") between 8 and 128
        and "flow_runtime_commands"."idempotency_key" ~ '^[A-Za-z0-9._:-]+$'),
	CONSTRAINT "flow_runtime_commands_request_hash_check" CHECK ("flow_runtime_commands"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "flow_runtime_commands_state_check" CHECK ("flow_runtime_commands"."state" in ('processing', 'succeeded', 'failed')),
	CONSTRAINT "flow_runtime_commands_terminal_state_check" CHECK ((
        "flow_runtime_commands"."state" = 'processing' and "flow_runtime_commands"."completed_at" is null
      ) or (
        "flow_runtime_commands"."state" in ('succeeded', 'failed') and "flow_runtime_commands"."completed_at" is not null
      )),
	CONSTRAINT "flow_runtime_commands_replay_window_check" CHECK ("flow_runtime_commands"."replay_until" = "flow_runtime_commands"."created_at" + interval '24 hours'),
	CONSTRAINT "flow_runtime_commands_completion_check" CHECK ("flow_runtime_commands"."completed_at" is null or "flow_runtime_commands"."completed_at" >= "flow_runtime_commands"."created_at")
);
--> statement-breakpoint
CREATE TABLE "flow_runtime_owner_subjects" (
	"owner_subject_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"erased_at" timestamp with time zone,
	CONSTRAINT "flow_runtime_owner_subjects_shape_check" CHECK ((
          "flow_runtime_owner_subjects"."state" = 'active'
          and "flow_runtime_owner_subjects"."owner_user_id" is not null
          and "flow_runtime_owner_subjects"."erased_at" is null
        ) or (
          "flow_runtime_owner_subjects"."state" = 'erased'
          and "flow_runtime_owner_subjects"."owner_user_id" is null
          and "flow_runtime_owner_subjects"."erased_at" is not null
          and "flow_runtime_owner_subjects"."erased_at" >= "flow_runtime_owner_subjects"."created_at"
        ))
);
--> statement-breakpoint
CREATE TABLE "flow_runtime_control_command_outcomes" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"result_kind" text NOT NULL,
	"current_revision" integer NOT NULL,
	"policy_revision" integer,
	"requested_policy_canonical_preimage" text NOT NULL,
	"requested_policy_digest" varchar(71) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_runtime_control_command_outcomes_shape_check" CHECK ("flow_runtime_control_command_outcomes"."current_revision" > 0
        and length("flow_runtime_control_command_outcomes"."requested_policy_canonical_preimage") between 1 and 300000
        and "flow_runtime_control_command_outcomes"."requested_policy_digest" ~ '^sha256:[a-f0-9]{64}$'
        and (
          ("flow_runtime_control_command_outcomes"."result_kind" = 'applied'
            and "flow_runtime_control_command_outcomes"."policy_revision" = "flow_runtime_control_command_outcomes"."current_revision")
          or ("flow_runtime_control_command_outcomes"."result_kind" = 'revision_conflict'
            and "flow_runtime_control_command_outcomes"."policy_revision" is null)
        ))
);
--> statement-breakpoint
CREATE TABLE "flow_runtime_control_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_version" text DEFAULT 'flow-runtime-control-replace-policy-command.v1' NOT NULL,
	"actor_subject_id" uuid NOT NULL,
	"command_scope" text DEFAULT 'flows.runtime-control.replace-policy.v1' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(71) NOT NULL,
	"expected_revision" integer NOT NULL,
	"target_revision" integer NOT NULL,
	"requested_policy_digest" varchar(71) NOT NULL,
	"reason" text NOT NULL,
	"state" text DEFAULT 'processing' NOT NULL,
	"completed_at" timestamp with time zone,
	"replay_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_runtime_control_commands_identity_check" CHECK ("flow_runtime_control_commands"."schema_version" = 'flow-runtime-control-replace-policy-command.v1'
        and "flow_runtime_control_commands"."command_scope" = 'flows.runtime-control.replace-policy.v1'
        and length("flow_runtime_control_commands"."idempotency_key") between 8 and 128
        and "flow_runtime_control_commands"."idempotency_key" ~ '^[A-Za-z0-9._:-]+$'),
	CONSTRAINT "flow_runtime_control_commands_revision_check" CHECK ("flow_runtime_control_commands"."expected_revision" > 0
        and "flow_runtime_control_commands"."target_revision" = "flow_runtime_control_commands"."expected_revision" + 1),
	CONSTRAINT "flow_runtime_control_commands_evidence_check" CHECK ("flow_runtime_control_commands"."request_hash" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_runtime_control_commands"."requested_policy_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "flow_runtime_control_commands_reason_check" CHECK (length(trim("flow_runtime_control_commands"."reason")) between 1 and 500
        and "flow_runtime_control_commands"."reason" = trim("flow_runtime_control_commands"."reason")
        and "flow_runtime_control_commands"."reason" !~ '[[:cntrl:]]'),
	CONSTRAINT "flow_runtime_control_commands_state_check" CHECK (("flow_runtime_control_commands"."state" = 'processing' and "flow_runtime_control_commands"."completed_at" is null)
        or ("flow_runtime_control_commands"."state" in ('succeeded', 'failed') and "flow_runtime_control_commands"."completed_at" is not null)),
	CONSTRAINT "flow_runtime_control_commands_time_check" CHECK ("flow_runtime_control_commands"."replay_until" = "flow_runtime_control_commands"."created_at" + interval '24 hours'
        and "flow_runtime_control_commands"."updated_at" >= "flow_runtime_control_commands"."created_at"
        and ("flow_runtime_control_commands"."completed_at" is null
          or ("flow_runtime_control_commands"."completed_at" >= "flow_runtime_control_commands"."created_at"
            and "flow_runtime_control_commands"."completed_at" = "flow_runtime_control_commands"."updated_at")))
);
--> statement-breakpoint
CREATE TABLE "flow_runtime_control_authority" (
	"authority_key" varchar(32) PRIMARY KEY NOT NULL,
	"current_policy_revision" integer NOT NULL,
	"control_revision" integer NOT NULL,
	"last_command_id" uuid,
	"change_source" text NOT NULL,
	"updated_by_actor_subject_id" uuid,
	"reason" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_runtime_control_authority_shape_check" CHECK ("flow_runtime_control_authority"."authority_key" = 'primary'
        and "flow_runtime_control_authority"."current_policy_revision" > 0
        and "flow_runtime_control_authority"."control_revision" = "flow_runtime_control_authority"."current_policy_revision"
        and length(trim("flow_runtime_control_authority"."reason")) between 1 and 500
        and "flow_runtime_control_authority"."reason" = trim("flow_runtime_control_authority"."reason")
        and "flow_runtime_control_authority"."reason" !~ '[[:cntrl:]]'),
	CONSTRAINT "flow_runtime_control_authority_source_check" CHECK (("flow_runtime_control_authority"."control_revision" = 1 and "flow_runtime_control_authority"."change_source" = 'bootstrap'
          and "flow_runtime_control_authority"."updated_by_actor_subject_id" is null and "flow_runtime_control_authority"."last_command_id" is null)
        or ("flow_runtime_control_authority"."control_revision" > 1 and "flow_runtime_control_authority"."change_source" = 'admin'
          and "flow_runtime_control_authority"."updated_by_actor_subject_id" is not null and "flow_runtime_control_authority"."last_command_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "flow_runtime_rollout_policy_versions" (
	"revision" integer PRIMARY KEY NOT NULL,
	"supersedes_revision" integer,
	"command_id" uuid,
	"schema_version" text DEFAULT 'flow-runtime-rollout-policy.v2' NOT NULL,
	"mode" text NOT NULL,
	"canary_owner_subject_ids" uuid[] DEFAULT array[]::uuid[] NOT NULL,
	"allowed_requirement_keys" text[] DEFAULT array[]::text[] NOT NULL,
	"enrollment_global_kill_switch" boolean DEFAULT true NOT NULL,
	"claim_global_kill_switch" boolean DEFAULT true NOT NULL,
	"external_dispatch_global_kill_switch" boolean DEFAULT true NOT NULL,
	"enrollment_killed_owner_subject_ids" uuid[] DEFAULT array[]::uuid[] NOT NULL,
	"claim_killed_owner_subject_ids" uuid[] DEFAULT array[]::uuid[] NOT NULL,
	"external_dispatch_killed_owner_subject_ids" uuid[] DEFAULT array[]::uuid[] NOT NULL,
	"enrollment_killed_capability_keys" text[] DEFAULT array[]::text[] NOT NULL,
	"claim_killed_capability_keys" text[] DEFAULT array[]::text[] NOT NULL,
	"external_dispatch_killed_capability_keys" text[] DEFAULT array[]::text[] NOT NULL,
	"readiness_lease_ttl_ms" integer DEFAULT 30000 NOT NULL,
	"token_lease_duration_ms" integer DEFAULT 30000 NOT NULL,
	"canonical_preimage" text NOT NULL,
	"policy_digest" varchar(71) NOT NULL,
	"change_source" text NOT NULL,
	"created_by_actor_subject_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_runtime_rollout_policy_versions_schema_check" CHECK ("flow_runtime_rollout_policy_versions"."schema_version" = 'flow-runtime-rollout-policy.v2' and "flow_runtime_rollout_policy_versions"."revision" > 0),
	CONSTRAINT "flow_runtime_rollout_policy_versions_history_check" CHECK (("flow_runtime_rollout_policy_versions"."revision" = 1 and "flow_runtime_rollout_policy_versions"."supersedes_revision" is null)
        or ("flow_runtime_rollout_policy_versions"."revision" > 1 and "flow_runtime_rollout_policy_versions"."supersedes_revision" = "flow_runtime_rollout_policy_versions"."revision" - 1)),
	CONSTRAINT "flow_runtime_rollout_policy_versions_shape_check" CHECK ("flow_runtime_rollout_policy_versions"."mode" in ('definition_only', 'canary', 'enabled')
        and cardinality("flow_runtime_rollout_policy_versions"."canary_owner_subject_ids") between 0 and 100
        and array_position("flow_runtime_rollout_policy_versions"."canary_owner_subject_ids", null) is null
        and (("flow_runtime_rollout_policy_versions"."mode" = 'canary' and cardinality("flow_runtime_rollout_policy_versions"."canary_owner_subject_ids") between 1 and 100)
          or ("flow_runtime_rollout_policy_versions"."mode" in ('definition_only', 'enabled')
            and cardinality("flow_runtime_rollout_policy_versions"."canary_owner_subject_ids") = 0))),
	CONSTRAINT "flow_runtime_rollout_policy_versions_requirements_check" CHECK (cardinality("flow_runtime_rollout_policy_versions"."allowed_requirement_keys") between 0 and 256
        and array_position("flow_runtime_rollout_policy_versions"."allowed_requirement_keys", null) is null
        and (cardinality("flow_runtime_rollout_policy_versions"."allowed_requirement_keys") = 0
          or array_to_string("flow_runtime_rollout_policy_versions"."allowed_requirement_keys", E'
')
            ~ '^[a-z0-9][a-z0-9._:-]*(
[a-z0-9][a-z0-9._:-]*)*$')
        and ("flow_runtime_rollout_policy_versions"."mode" = 'definition_only'
          or cardinality("flow_runtime_rollout_policy_versions"."allowed_requirement_keys") between 1 and 256)),
	CONSTRAINT "flow_runtime_rollout_policy_versions_kill_scope_check" CHECK (cardinality("flow_runtime_rollout_policy_versions"."enrollment_killed_owner_subject_ids") between 0 and 100
        and cardinality("flow_runtime_rollout_policy_versions"."claim_killed_owner_subject_ids") between 0 and 100
        and cardinality("flow_runtime_rollout_policy_versions"."external_dispatch_killed_owner_subject_ids") between 0 and 100
        and array_position("flow_runtime_rollout_policy_versions"."enrollment_killed_owner_subject_ids", null) is null
        and array_position("flow_runtime_rollout_policy_versions"."claim_killed_owner_subject_ids", null) is null
        and array_position("flow_runtime_rollout_policy_versions"."external_dispatch_killed_owner_subject_ids", null) is null
        and cardinality("flow_runtime_rollout_policy_versions"."enrollment_killed_capability_keys") between 0 and 256
        and cardinality("flow_runtime_rollout_policy_versions"."claim_killed_capability_keys") between 0 and 256
        and cardinality("flow_runtime_rollout_policy_versions"."external_dispatch_killed_capability_keys") between 0 and 256
        and array_position("flow_runtime_rollout_policy_versions"."enrollment_killed_capability_keys", null) is null
        and array_position("flow_runtime_rollout_policy_versions"."claim_killed_capability_keys", null) is null
        and array_position("flow_runtime_rollout_policy_versions"."external_dispatch_killed_capability_keys", null) is null
        and (cardinality("flow_runtime_rollout_policy_versions"."enrollment_killed_capability_keys") = 0
          or array_to_string("flow_runtime_rollout_policy_versions"."enrollment_killed_capability_keys", E'
')
            ~ '^[a-z0-9][a-z0-9._:-]*(
[a-z0-9][a-z0-9._:-]*)*$')
        and (cardinality("flow_runtime_rollout_policy_versions"."claim_killed_capability_keys") = 0
          or array_to_string("flow_runtime_rollout_policy_versions"."claim_killed_capability_keys", E'
')
            ~ '^[a-z0-9][a-z0-9._:-]*(
[a-z0-9][a-z0-9._:-]*)*$')
        and (cardinality("flow_runtime_rollout_policy_versions"."external_dispatch_killed_capability_keys") = 0
          or array_to_string("flow_runtime_rollout_policy_versions"."external_dispatch_killed_capability_keys", E'
')
            ~ '^[a-z0-9][a-z0-9._:-]*(
[a-z0-9][a-z0-9._:-]*)*$')),
	CONSTRAINT "flow_runtime_rollout_policy_versions_lease_check" CHECK ("flow_runtime_rollout_policy_versions"."readiness_lease_ttl_ms" between 5000 and 60000
        and "flow_runtime_rollout_policy_versions"."token_lease_duration_ms" between 5000 and 300000),
	CONSTRAINT "flow_runtime_rollout_policy_versions_digest_check" CHECK (length("flow_runtime_rollout_policy_versions"."canonical_preimage") between 1 and 300000
        and "flow_runtime_rollout_policy_versions"."policy_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "flow_runtime_rollout_policy_versions_source_check" CHECK (("flow_runtime_rollout_policy_versions"."revision" = 1 and "flow_runtime_rollout_policy_versions"."change_source" = 'bootstrap'
          and "flow_runtime_rollout_policy_versions"."created_by_actor_subject_id" is null and "flow_runtime_rollout_policy_versions"."command_id" is null)
        or ("flow_runtime_rollout_policy_versions"."revision" > 1 and "flow_runtime_rollout_policy_versions"."change_source" = 'admin'
          and "flow_runtime_rollout_policy_versions"."created_by_actor_subject_id" is not null and "flow_runtime_rollout_policy_versions"."command_id" is not null)),
	CONSTRAINT "flow_runtime_rollout_policy_versions_reason_check" CHECK (length(trim("flow_runtime_rollout_policy_versions"."reason")) between 1 and 500
        and "flow_runtime_rollout_policy_versions"."reason" = trim("flow_runtime_rollout_policy_versions"."reason")
        and "flow_runtime_rollout_policy_versions"."reason" !~ '[[:cntrl:]]')
);
--> statement-breakpoint
CREATE TABLE "flow_worker_readiness_leases" (
	"instance_id" varchar(180) PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"state" text DEFAULT 'ready' NOT NULL,
	"policy_revision" integer NOT NULL,
	"heartbeat_sequence" integer DEFAULT 1 NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_until" timestamp with time zone NOT NULL,
	"draining_at" timestamp with time zone,
	CONSTRAINT "flow_worker_readiness_leases_identity_check" CHECK (length(trim("flow_worker_readiness_leases"."instance_id")) between 1 and 180
        and "flow_worker_readiness_leases"."instance_id" = trim("flow_worker_readiness_leases"."instance_id")
        and "flow_worker_readiness_leases"."instance_id" ~ '^[A-Za-z0-9._:-]+$'
        and "flow_worker_readiness_leases"."policy_revision" > 0
        and "flow_worker_readiness_leases"."heartbeat_sequence" > 0),
	CONSTRAINT "flow_worker_readiness_leases_time_check" CHECK ("flow_worker_readiness_leases"."state" in ('ready', 'draining')
        and (("flow_worker_readiness_leases"."state" = 'ready'
            and "flow_worker_readiness_leases"."draining_at" is null
            and "flow_worker_readiness_leases"."ready_until" > "flow_worker_readiness_leases"."heartbeat_at"
            and "flow_worker_readiness_leases"."ready_until" <= "flow_worker_readiness_leases"."heartbeat_at" + interval '60 seconds')
          or ("flow_worker_readiness_leases"."state" = 'draining'
            and "flow_worker_readiness_leases"."draining_at" is not null
            and "flow_worker_readiness_leases"."ready_until" = "flow_worker_readiness_leases"."draining_at"
            and "flow_worker_readiness_leases"."heartbeat_at" = "flow_worker_readiness_leases"."draining_at")))
);
--> statement-breakpoint
CREATE TABLE "flow_worker_registration_tombstones" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"schema_version" text DEFAULT 'flow-worker-registration-tombstone.v1' NOT NULL,
	"registration_digest" varchar(71) NOT NULL,
	"retirement_reason" text NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	CONSTRAINT "flow_worker_registration_tombstones_shape_check" CHECK ("flow_worker_registration_tombstones"."schema_version" = 'flow-worker-registration-tombstone.v1'
        and "flow_worker_registration_tombstones"."registration_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_worker_registration_tombstones"."retirement_reason" in ('explicit_drain', 'replaced', 'stale_expired')
        and "flow_worker_registration_tombstones"."purge_after" = "flow_worker_registration_tombstones"."retired_at" + interval '30 days')
);
--> statement-breakpoint
CREATE TABLE "flow_worker_registrations" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"instance_id" varchar(180) NOT NULL,
	"roles" text[] NOT NULL,
	"max_runtime_mode" text NOT NULL,
	"max_canary_owner_subject_ids" uuid[] DEFAULT array[]::uuid[] NOT NULL,
	"requirement_keys" text[] NOT NULL,
	"deployment_id" varchar(180) NOT NULL,
	"build_id" varchar(180) NOT NULL,
	"protocol_version" varchar(80) DEFAULT 'flow-worker-runtime.v2' NOT NULL,
	"registration_digest" varchar(71) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_worker_registrations_identity_check" CHECK (length(trim("flow_worker_registrations"."instance_id")) between 1 and 180
        and "flow_worker_registrations"."instance_id" = trim("flow_worker_registrations"."instance_id")
        and "flow_worker_registrations"."instance_id" ~ '^[A-Za-z0-9._:-]+$'
        and length(trim("flow_worker_registrations"."deployment_id")) between 1 and 180
        and "flow_worker_registrations"."deployment_id" = trim("flow_worker_registrations"."deployment_id")
        and "flow_worker_registrations"."deployment_id" ~ '^[A-Za-z0-9._:-]+$'
        and length(trim("flow_worker_registrations"."build_id")) between 1 and 180
        and "flow_worker_registrations"."build_id" = trim("flow_worker_registrations"."build_id")
        and "flow_worker_registrations"."build_id" ~ '^[A-Za-z0-9._:-]+$'
        and "flow_worker_registrations"."protocol_version" = 'flow-worker-runtime.v2'),
	CONSTRAINT "flow_worker_registrations_roles_check" CHECK (cardinality("flow_worker_registrations"."roles") between 1 and 3
        and array_position("flow_worker_registrations"."roles", null) is null
        and "flow_worker_registrations"."roles" <@ array['enrollment', 'executor', 'external_dispatcher']::text[]),
	CONSTRAINT "flow_worker_registrations_scope_check" CHECK ("flow_worker_registrations"."max_runtime_mode" in ('definition_only', 'canary', 'enabled')
        and cardinality("flow_worker_registrations"."max_canary_owner_subject_ids") between 0 and 100
        and array_position("flow_worker_registrations"."max_canary_owner_subject_ids", null) is null
        and (("flow_worker_registrations"."max_runtime_mode" = 'canary'
            and cardinality("flow_worker_registrations"."max_canary_owner_subject_ids") between 1 and 100)
          or ("flow_worker_registrations"."max_runtime_mode" in ('definition_only', 'enabled')
            and cardinality("flow_worker_registrations"."max_canary_owner_subject_ids") = 0))),
	CONSTRAINT "flow_worker_registrations_requirements_check" CHECK (cardinality("flow_worker_registrations"."requirement_keys") between 1 and 256
        and array_position("flow_worker_registrations"."requirement_keys", null) is null
        and array_to_string("flow_worker_registrations"."requirement_keys", E'
')
          ~ '^[a-z0-9][a-z0-9._:-]*(
[a-z0-9][a-z0-9._:-]*)*$'),
	CONSTRAINT "flow_worker_registrations_digest_check" CHECK ("flow_worker_registrations"."registration_digest" ~ '^sha256:[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "flow_activation_epochs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"owner_subject_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"manifest_digest" varchar(71) NOT NULL,
	"rollout_policy_revision" integer NOT NULL,
	"activated_by_actor_subject_id" uuid NOT NULL,
	"activate_command_id" uuid NOT NULL,
	"close_reason" text,
	"closed_by_actor_subject_id" uuid,
	"close_command_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_activation_epochs_id_flow_version_unique" UNIQUE("id","flow_id","flow_version_id"),
	CONSTRAINT "flow_activation_epochs_shape_check" CHECK ("flow_activation_epochs"."sequence" > 0
        and "flow_activation_epochs"."manifest_digest" ~ '^sha256:[a-f0-9]{64}$'
        and "flow_activation_epochs"."rollout_policy_revision" > 0
        and "flow_activation_epochs"."created_at" = "flow_activation_epochs"."effective_from"
        and (("flow_activation_epochs"."effective_to" is null
            and "flow_activation_epochs"."close_reason" is null
            and "flow_activation_epochs"."closed_by_actor_subject_id" is null
            and "flow_activation_epochs"."close_command_id" is null)
          or ("flow_activation_epochs"."effective_to" > "flow_activation_epochs"."effective_from"
            and "flow_activation_epochs"."close_reason" in ('pause_enrollment', 'version_switch')
            and "flow_activation_epochs"."closed_by_actor_subject_id" is not null
            and "flow_activation_epochs"."close_command_id" is not null
            and "flow_activation_epochs"."close_command_id" <> "flow_activation_epochs"."activate_command_id")))
);
--> statement-breakpoint
CREATE TABLE "flow_automation_quota_authorities" (
	"owner_subject_id" uuid PRIMARY KEY NOT NULL,
	"active_allocations" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_automation_quota_authorities_shape_check" CHECK ("flow_automation_quota_authorities"."active_allocations" >= 0
        and "flow_automation_quota_authorities"."revision" > 0
        and "flow_automation_quota_authorities"."updated_at" >= "flow_automation_quota_authorities"."created_at")
);
--> statement-breakpoint
CREATE TABLE "flow_enrollment_command_outcomes" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_enrollment_command_outcomes_response_check" CHECK ("flow_enrollment_command_outcomes"."response_status" in (200, 400, 404, 409)
        and jsonb_typeof("flow_enrollment_command_outcomes"."response_body") = 'object'
        and octet_length("flow_enrollment_command_outcomes"."response_body"::text) between 2 and 65536)
);
--> statement-breakpoint
CREATE TABLE "flow_enrollment_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_surface" text DEFAULT 'astrologer-api' NOT NULL,
	"actor_subject_id" uuid NOT NULL,
	"owner_subject_id" uuid NOT NULL,
	"route_template" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"command_scope" text NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(71) NOT NULL,
	"request_schema_version" text NOT NULL,
	"target_version_id" uuid,
	"expected_definition_revision" integer,
	"expected_enrollment_revision" integer NOT NULL,
	"expected_active_version_id" uuid,
	"expected_activation_epoch_id" uuid,
	"state" text DEFAULT 'processing' NOT NULL,
	"completed_at" timestamp with time zone,
	"replay_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_enrollment_commands_identity_check" CHECK ("flow_enrollment_commands"."api_surface" = 'astrologer-api'
        and (("flow_enrollment_commands"."command_scope" = 'flows.enrollment.activate.v1'
            and "flow_enrollment_commands"."route_template" = '/flows/:flowId/activate')
          or ("flow_enrollment_commands"."command_scope" = 'flows.enrollment.pause.v1'
            and "flow_enrollment_commands"."route_template" = '/flows/:flowId/pause-enrollment'))),
	CONSTRAINT "flow_enrollment_commands_key_check" CHECK (length("flow_enrollment_commands"."idempotency_key") between 8 and 128
        and "flow_enrollment_commands"."idempotency_key" ~ '^[A-Za-z0-9._:-]+$'),
	CONSTRAINT "flow_enrollment_commands_request_hash_check" CHECK ("flow_enrollment_commands"."request_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "flow_enrollment_commands_request_shape_check" CHECK (("flow_enrollment_commands"."command_scope" = 'flows.enrollment.activate.v1'
          and "flow_enrollment_commands"."request_schema_version" = 'flow-activation-command.v1'
          and "flow_enrollment_commands"."target_version_id" is not null
          and "flow_enrollment_commands"."expected_definition_revision" is not null
          and "flow_enrollment_commands"."expected_definition_revision" > 0
          and "flow_enrollment_commands"."expected_enrollment_revision" >= 0
          and "flow_enrollment_commands"."expected_activation_epoch_id" is null)
        or ("flow_enrollment_commands"."command_scope" = 'flows.enrollment.pause.v1'
          and "flow_enrollment_commands"."request_schema_version" = 'flow-enrollment-pause-command.v1'
          and "flow_enrollment_commands"."target_version_id" is null
          and "flow_enrollment_commands"."expected_definition_revision" is null
          and "flow_enrollment_commands"."expected_enrollment_revision" >= 0
          and "flow_enrollment_commands"."expected_active_version_id" is not null
          and "flow_enrollment_commands"."expected_activation_epoch_id" is not null)),
	CONSTRAINT "flow_enrollment_commands_state_check" CHECK (("flow_enrollment_commands"."state" = 'processing' and "flow_enrollment_commands"."completed_at" is null)
        or ("flow_enrollment_commands"."state" in ('succeeded', 'failed') and "flow_enrollment_commands"."completed_at" is not null)),
	CONSTRAINT "flow_enrollment_commands_time_check" CHECK ("flow_enrollment_commands"."replay_until" = "flow_enrollment_commands"."created_at" + interval '24 hours'
        and "flow_enrollment_commands"."updated_at" >= "flow_enrollment_commands"."created_at"
        and ("flow_enrollment_commands"."completed_at" is null
          or ("flow_enrollment_commands"."completed_at" >= "flow_enrollment_commands"."created_at"
            and "flow_enrollment_commands"."completed_at" = "flow_enrollment_commands"."updated_at")))
);
--> statement-breakpoint
CREATE TABLE "flow_enrollment_controls" (
	"flow_id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"owner_subject_id" uuid NOT NULL,
	"state" text DEFAULT 'inactive' NOT NULL,
	"enrollment_revision" integer DEFAULT 0 NOT NULL,
	"active_version_id" uuid,
	"active_activation_epoch_id" uuid,
	"active_since" timestamp with time zone,
	"last_paused_at" timestamp with time zone,
	"last_command_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_enrollment_controls_state_check" CHECK (("flow_enrollment_controls"."state" = 'inactive'
          and "flow_enrollment_controls"."enrollment_revision" = 0
          and "flow_enrollment_controls"."active_version_id" is null
          and "flow_enrollment_controls"."active_activation_epoch_id" is null
          and "flow_enrollment_controls"."active_since" is null
          and "flow_enrollment_controls"."last_paused_at" is null
          and "flow_enrollment_controls"."last_command_id" is null)
        or ("flow_enrollment_controls"."state" = 'active'
          and "flow_enrollment_controls"."enrollment_revision" > 0
          and "flow_enrollment_controls"."active_version_id" is not null
          and "flow_enrollment_controls"."active_activation_epoch_id" is not null
          and "flow_enrollment_controls"."active_since" is not null
          and "flow_enrollment_controls"."last_command_id" is not null
          and ("flow_enrollment_controls"."last_paused_at" is null or "flow_enrollment_controls"."last_paused_at" < "flow_enrollment_controls"."active_since"))
        or ("flow_enrollment_controls"."state" = 'paused'
          and "flow_enrollment_controls"."enrollment_revision" > 0
          and "flow_enrollment_controls"."active_version_id" is null
          and "flow_enrollment_controls"."active_activation_epoch_id" is null
          and "flow_enrollment_controls"."active_since" is null
          and "flow_enrollment_controls"."last_paused_at" is not null
          and "flow_enrollment_controls"."last_command_id" is not null)),
	CONSTRAINT "flow_enrollment_controls_time_check" CHECK ("flow_enrollment_controls"."updated_at" >= "flow_enrollment_controls"."created_at")
);
--> statement-breakpoint
CREATE TABLE "flow_work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_run_id" uuid NOT NULL,
	"flow_version_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"node_activation_sequence" bigint NOT NULL,
	"node_id" text NOT NULL,
	"completion_handle" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"task_kind" text NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"assignee_user_id" uuid NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_policy_kind" text NOT NULL,
	"due_lead_time_minutes" integer,
	"due_booking_lifecycle_revision" integer,
	"due_at" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snoozed_until" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"result_summary" text,
	"last_command_id" uuid,
	"last_run_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"expired_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "flow_work_items_id_run_owner_unique" UNIQUE("id","flow_run_id","owner_user_id"),
	CONSTRAINT "flow_work_items_status_check" CHECK ("flow_work_items"."status" in ('pending', 'in_progress', 'snoozed', 'completed', 'expired', 'canceled')),
	CONSTRAINT "flow_work_items_task_kind_check" CHECK ("flow_work_items"."task_kind" in ('consultation_preparation', 'birth_data_collection')),
	CONSTRAINT "flow_work_items_priority_check" CHECK ("flow_work_items"."priority" in ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "flow_work_items_due_policy_check" CHECK ((
        "flow_work_items"."due_policy_kind" = 'none'
        and "flow_work_items"."due_lead_time_minutes" is null
        and "flow_work_items"."due_booking_lifecycle_revision" is null
        and "flow_work_items"."due_at" is null
      ) or (
        "flow_work_items"."due_policy_kind" = 'before_booking_start'
        and "flow_work_items"."due_lead_time_minutes" between 0 and 525600
        and "flow_work_items"."due_booking_lifecycle_revision" > 0
        and "flow_work_items"."due_at" is not null
      )),
	CONSTRAINT "flow_work_items_node_check" CHECK ("flow_work_items"."node_activation_sequence" > 0
        and length(trim("flow_work_items"."node_id")) between 1 and 160
        and "flow_work_items"."node_id" ~ '^[a-z0-9][a-z0-9_-]*$'
        and "flow_work_items"."completion_handle" = 'success'),
	CONSTRAINT "flow_work_items_assignment_check" CHECK ("flow_work_items"."assignee_user_id" = "flow_work_items"."owner_user_id"),
	CONSTRAINT "flow_work_items_revision_check" CHECK ("flow_work_items"."revision" > 0),
	CONSTRAINT "flow_work_items_provenance_revision_check" CHECK ((
        "flow_work_items"."revision" = 1
        and "flow_work_items"."status" = 'pending'
        and "flow_work_items"."last_command_id" is null
        and "flow_work_items"."last_run_event_id" is null
      ) or (
        "flow_work_items"."revision" > 1
        and ("flow_work_items"."last_command_id" is null) <> ("flow_work_items"."last_run_event_id" is null)
      )),
	CONSTRAINT "flow_work_items_content_check" CHECK (length(trim("flow_work_items"."title")) between 1 and 180
        and ("flow_work_items"."instructions" is null
          or length(trim("flow_work_items"."instructions")) between 1 and 4000)
        and ("flow_work_items"."result_summary" is null
          or length(trim("flow_work_items"."result_summary")) between 1 and 1000)
        and ("flow_work_items"."status" = 'completed' or "flow_work_items"."result_summary" is null)),
	CONSTRAINT "flow_work_items_lifecycle_check" CHECK ((
        "flow_work_items"."status" = 'pending'
        and "flow_work_items"."snoozed_until" is null
        and "flow_work_items"."completed_at" is null
        and "flow_work_items"."completed_by_user_id" is null
        and "flow_work_items"."expired_at" is null
        and "flow_work_items"."canceled_at" is null
      ) or (
        "flow_work_items"."status" = 'in_progress'
        and "flow_work_items"."started_at" is not null
        and "flow_work_items"."snoozed_until" is null
        and "flow_work_items"."completed_at" is null
        and "flow_work_items"."completed_by_user_id" is null
        and "flow_work_items"."expired_at" is null
        and "flow_work_items"."canceled_at" is null
      ) or (
        "flow_work_items"."status" = 'snoozed'
        and "flow_work_items"."snoozed_until" is not null
        and "flow_work_items"."available_at" = "flow_work_items"."snoozed_until"
        and "flow_work_items"."completed_at" is null
        and "flow_work_items"."completed_by_user_id" is null
        and "flow_work_items"."expired_at" is null
        and "flow_work_items"."canceled_at" is null
      ) or (
        "flow_work_items"."status" = 'completed'
        and "flow_work_items"."started_at" is not null
        and "flow_work_items"."completed_at" is not null
        and "flow_work_items"."snoozed_until" is null
        and "flow_work_items"."expired_at" is null
        and "flow_work_items"."canceled_at" is null
      ) or (
        "flow_work_items"."status" = 'expired'
        and "flow_work_items"."expired_at" is not null
        and "flow_work_items"."snoozed_until" is null
        and "flow_work_items"."completed_at" is null
        and "flow_work_items"."completed_by_user_id" is null
        and "flow_work_items"."canceled_at" is null
      ) or (
        "flow_work_items"."status" = 'canceled'
        and "flow_work_items"."canceled_at" is not null
        and "flow_work_items"."snoozed_until" is null
        and "flow_work_items"."completed_at" is null
        and "flow_work_items"."completed_by_user_id" is null
        and "flow_work_items"."expired_at" is null
      )),
	CONSTRAINT "flow_work_items_time_order_check" CHECK ("flow_work_items"."updated_at" >= "flow_work_items"."created_at"
        and "flow_work_items"."available_at" >= "flow_work_items"."created_at"
        and ("flow_work_items"."started_at" is null or "flow_work_items"."started_at" >= "flow_work_items"."created_at")
        and ("flow_work_items"."snoozed_until" is null or "flow_work_items"."snoozed_until" >= "flow_work_items"."updated_at")
        and ("flow_work_items"."completed_at" is null or "flow_work_items"."completed_at" >= "flow_work_items"."started_at")
        and ("flow_work_items"."expired_at" is null or "flow_work_items"."expired_at" >= "flow_work_items"."created_at")
        and ("flow_work_items"."canceled_at" is null or "flow_work_items"."canceled_at" >= "flow_work_items"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "flow_birth_profile_recheck_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_outbox_event_id" uuid NOT NULL,
	"birth_data_history_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"flow_run_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"birth_data_revision" integer NOT NULL,
	"outcome" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_birth_profile_recheck_receipts_source_run_unique" UNIQUE("source_outbox_event_id","flow_run_id"),
	CONSTRAINT "flow_birth_profile_recheck_receipts_revision_check" CHECK ("flow_birth_profile_recheck_receipts"."birth_data_revision" > 0),
	CONSTRAINT "flow_birth_profile_recheck_receipts_outcome_check" CHECK ("flow_birth_profile_recheck_receipts"."outcome" in ('ready', 'not_ready', 'stale'))
);
--> statement-breakpoint
CREATE TABLE "flow_booking_lifecycle_heads" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"applied_revision" integer NOT NULL,
	"state" text NOT NULL,
	"current_start_at" timestamp with time zone,
	"current_end_at" timestamp with time zone,
	"current_time_zone" text,
	"last_lifecycle_event_id" uuid NOT NULL,
	"last_canonical_digest" varchar(71) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_booking_lifecycle_heads_booking_owner_unique" UNIQUE("booking_id","owner_user_id"),
	CONSTRAINT "flow_booking_lifecycle_heads_revision_check" CHECK ("flow_booking_lifecycle_heads"."applied_revision" > 0),
	CONSTRAINT "flow_booking_lifecycle_heads_state_check" CHECK ("flow_booking_lifecycle_heads"."state" in ('confirmed', 'completed', 'cancelled')),
	CONSTRAINT "flow_booking_lifecycle_heads_state_schedule_check" CHECK ((
        "flow_booking_lifecycle_heads"."state" in ('confirmed', 'completed')
        and "flow_booking_lifecycle_heads"."current_start_at" is not null
        and "flow_booking_lifecycle_heads"."current_end_at" is not null
        and "flow_booking_lifecycle_heads"."current_start_at" < "flow_booking_lifecycle_heads"."current_end_at"
        and length(trim("flow_booking_lifecycle_heads"."current_time_zone")) between 1 and 100
      ) or (
        "flow_booking_lifecycle_heads"."state" = 'cancelled'
        and "flow_booking_lifecycle_heads"."current_start_at" is null
        and "flow_booking_lifecycle_heads"."current_end_at" is null
        and "flow_booking_lifecycle_heads"."current_time_zone" is null
      )),
	CONSTRAINT "flow_booking_lifecycle_heads_digest_check" CHECK ("flow_booking_lifecycle_heads"."last_canonical_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "flow_booking_lifecycle_heads_time_order_check" CHECK ("flow_booking_lifecycle_heads"."updated_at" >= "flow_booking_lifecycle_heads"."created_at")
);
--> statement-breakpoint
CREATE TABLE "flow_booking_lifecycle_receipts" (
	"lifecycle_event_id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"event_kind" text NOT NULL,
	"canonical_digest" varchar(71) NOT NULL,
	"outcome" text NOT NULL,
	"flow_runtime_event_id" uuid,
	"affected_run_count" integer DEFAULT 0 NOT NULL,
	"affected_work_item_count" integer DEFAULT 0 NOT NULL,
	"preserved_completed_work_item_count" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_booking_lifecycle_receipts_booking_revision_unique" UNIQUE("booking_id","revision"),
	CONSTRAINT "flow_booking_lifecycle_receipts_revision_check" CHECK ("flow_booking_lifecycle_receipts"."revision" > 0),
	CONSTRAINT "flow_booking_lifecycle_receipts_event_kind_check" CHECK ("flow_booking_lifecycle_receipts"."event_kind" in ('confirmed', 'rescheduled', 'completed', 'cancelled')),
	CONSTRAINT "flow_booking_lifecycle_receipts_outcome_check" CHECK ("flow_booking_lifecycle_receipts"."outcome" in ('enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed', 'completed', 'canceled', 'rescheduled')),
	CONSTRAINT "flow_booking_lifecycle_receipts_digest_check" CHECK ("flow_booking_lifecycle_receipts"."canonical_digest" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "flow_booking_lifecycle_receipts_counts_check" CHECK ("flow_booking_lifecycle_receipts"."affected_run_count" >= 0
        and "flow_booking_lifecycle_receipts"."affected_work_item_count" >= 0
        and "flow_booking_lifecycle_receipts"."preserved_completed_work_item_count" >= 0),
	CONSTRAINT "flow_booking_lifecycle_receipts_shape_check" CHECK ((
        "flow_booking_lifecycle_receipts"."event_kind" = 'confirmed'
        and "flow_booking_lifecycle_receipts"."outcome" in ('enrolled', 'no_match', 'late_unmatched', 'subject_ineligible', 'suppressed')
        and "flow_booking_lifecycle_receipts"."flow_runtime_event_id" is not null
        and "flow_booking_lifecycle_receipts"."affected_work_item_count" = 0
        and "flow_booking_lifecycle_receipts"."preserved_completed_work_item_count" = 0
      ) or (
        "flow_booking_lifecycle_receipts"."event_kind" = 'rescheduled'
        and "flow_booking_lifecycle_receipts"."outcome" = 'rescheduled'
        and "flow_booking_lifecycle_receipts"."flow_runtime_event_id" is null
      ) or (
        "flow_booking_lifecycle_receipts"."event_kind" = 'completed'
        and "flow_booking_lifecycle_receipts"."outcome" = 'completed'
        and "flow_booking_lifecycle_receipts"."flow_runtime_event_id" is null
        and "flow_booking_lifecycle_receipts"."affected_run_count" = 0
        and "flow_booking_lifecycle_receipts"."affected_work_item_count" = 0
        and "flow_booking_lifecycle_receipts"."preserved_completed_work_item_count" = 0
      ) or (
        "flow_booking_lifecycle_receipts"."event_kind" = 'cancelled'
        and "flow_booking_lifecycle_receipts"."outcome" = 'canceled'
        and "flow_booking_lifecycle_receipts"."flow_runtime_event_id" is null
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "flow_versions_flow_version_unique" ON "flow_versions" USING btree ("flow_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_versions_flow_source_revision_unique" ON "flow_versions" USING btree ("flow_id","source_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_definition_commands_scope_key_unique" ON "flow_definition_commands" USING btree ("api_surface","actor_user_id","owner_user_id","route_template","resource_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_delivery_attempts_owner_idempotency_unique" ON "flow_delivery_attempts" USING btree ("owner_user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_delivery_attempts_step_attempt_unique" ON "flow_delivery_attempts" USING btree ("flow_step_run_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_execution_attempts_token_fence_unique" ON "flow_execution_attempts" USING btree ("token_id","fencing_token");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_execution_attempts_token_activation_attempt_unique" ON "flow_execution_attempts" USING btree ("token_id","node_activation_sequence","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_execution_tokens_run_unique" ON "flow_execution_tokens" USING btree ("flow_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_run_events_run_sequence_unique" ON "flow_run_events" USING btree ("flow_run_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_run_events_attempt_unique" ON "flow_run_events" USING btree ("attempt_id") WHERE "flow_run_events"."attempt_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_run_events_command_unique" ON "flow_run_events" USING btree ("command_id") WHERE "flow_run_events"."command_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_run_events_booking_lifecycle_run_unique" ON "flow_run_events" USING btree ("booking_lifecycle_event_id","flow_run_id") WHERE "flow_run_events"."booking_lifecycle_event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runs_owner_flow_event_unique" ON "flow_runs" USING btree ("owner_user_id","flow_id","runtime_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runs_owner_stable_enrollment_unique" ON "flow_runs" USING btree ("owner_user_id","flow_id","trigger_node_id","enrollment_policy_key","occurrence_key") WHERE "flow_runs"."activation_epoch_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runtime_events_owner_dedupe_unique" ON "flow_runtime_events" USING btree ("owner_user_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runtime_events_source_identity_unique" ON "flow_runtime_events" USING btree ("source","source_event_id") WHERE "flow_runtime_events"."event_kind" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_suppressions_owner_flow_event_reason_unique" ON "flow_suppressions" USING btree ("owner_user_id","flow_id","runtime_event_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_execution_signal_inbox_source_event_unique" ON "flow_execution_signal_inbox" USING btree ("source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_execution_signal_inbox_owner_identity_unique" ON "flow_execution_signal_inbox" USING btree ("owner_user_id","signal_type","correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_execution_signal_waits_token_activation_unique" ON "flow_execution_signal_waits" USING btree ("token_id","node_activation_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_execution_signal_waits_consumed_signal_unique" ON "flow_execution_signal_waits" USING btree ("consumed_signal_id") WHERE "flow_execution_signal_waits"."consumed_signal_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runtime_commands_scope_key_unique" ON "flow_runtime_commands" USING btree ("api_surface","actor_user_id","owner_user_id","route_template","resource_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runtime_owner_subjects_user_unique" ON "flow_runtime_owner_subjects" USING btree ("owner_user_id") WHERE "flow_runtime_owner_subjects"."owner_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runtime_control_commands_scope_key_unique" ON "flow_runtime_control_commands" USING btree ("command_scope","actor_subject_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_runtime_rollout_policy_versions_command_unique" ON "flow_runtime_rollout_policy_versions" USING btree ("command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_worker_readiness_leases_session_unique" ON "flow_worker_readiness_leases" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_activation_epochs_flow_sequence_unique" ON "flow_activation_epochs" USING btree ("flow_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_activation_epochs_one_open_flow_unique" ON "flow_activation_epochs" USING btree ("flow_id") WHERE "flow_activation_epochs"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_activation_epochs_activate_command_unique" ON "flow_activation_epochs" USING btree ("activate_command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_activation_epochs_close_command_unique" ON "flow_activation_epochs" USING btree ("close_command_id") WHERE "flow_activation_epochs"."close_command_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "flow_enrollment_commands_scope_actor_key_unique" ON "flow_enrollment_commands" USING btree ("command_scope","actor_subject_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "flow_work_items_token_activation_unique" ON "flow_work_items" USING btree ("token_id","node_activation_sequence");--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_flow_owner_fk" FOREIGN KEY ("flow_id","owner_user_id") REFERENCES "public"."flows"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_published_version_owner_fk" FOREIGN KEY ("id","published_version_id","owner_user_id","published_at") REFERENCES "public"."flow_versions"("flow_id","id","owner_user_id","published_at") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_draft_base_version_owner_fk" FOREIGN KEY ("id","draft_base_version_id","owner_user_id") REFERENCES "public"."flow_versions"("flow_id","id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_definition_command_outcomes" ADD CONSTRAINT "flow_definition_command_outcomes_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."flow_definition_commands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_definition_commands" ADD CONSTRAINT "flow_definition_commands_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_definition_commands" ADD CONSTRAINT "flow_definition_commands_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_run_owner_fk" FOREIGN KEY ("flow_run_id","owner_user_id") REFERENCES "public"."flow_runs"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_approvals" ADD CONSTRAINT "flow_approvals_step_run_owner_fk" FOREIGN KEY ("flow_step_run_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_step_runs"("id","flow_run_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_delivery_attempts" ADD CONSTRAINT "flow_delivery_attempts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_delivery_attempts" ADD CONSTRAINT "flow_delivery_attempts_run_owner_fk" FOREIGN KEY ("flow_run_id","owner_user_id") REFERENCES "public"."flow_runs"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_delivery_attempts" ADD CONSTRAINT "flow_delivery_attempts_step_run_owner_fk" FOREIGN KEY ("flow_step_run_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_step_runs"("id","flow_run_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_attempts" ADD CONSTRAINT "flow_execution_attempts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_attempts" ADD CONSTRAINT "flow_execution_attempts_token_run_owner_fk" FOREIGN KEY ("token_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_execution_tokens"("id","flow_run_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_attempts" ADD CONSTRAINT "flow_execution_attempts_run_version_owner_fk" FOREIGN KEY ("flow_run_id","flow_version_id","owner_user_id") REFERENCES "public"."flow_runs"("id","flow_version_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_attempts" ADD CONSTRAINT "flow_execution_attempts_claim_policy_fk" FOREIGN KEY ("control_policy_revision") REFERENCES "public"."flow_runtime_rollout_policy_versions"("revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_tokens" ADD CONSTRAINT "flow_execution_tokens_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_tokens" ADD CONSTRAINT "flow_execution_tokens_run_version_owner_fk" FOREIGN KEY ("flow_run_id","flow_version_id","owner_user_id") REFERENCES "public"."flow_runs"("id","flow_version_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_tokens" ADD CONSTRAINT "flow_execution_tokens_claim_policy_fk" FOREIGN KEY ("claim_control_policy_revision") REFERENCES "public"."flow_runtime_rollout_policy_versions"("revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_run_owner_fk" FOREIGN KEY ("flow_run_id","owner_user_id") REFERENCES "public"."flow_runs"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_attempt_run_owner_fk" FOREIGN KEY ("attempt_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_execution_attempts"("id","flow_run_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_command_run_owner_fk" FOREIGN KEY ("command_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_runtime_commands"("id","flow_run_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_booking_lifecycle_event_owner_fk" FOREIGN KEY ("booking_lifecycle_event_id","owner_user_id") REFERENCES "public"."booking_lifecycle_events"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flow_owner_fk" FOREIGN KEY ("flow_id","owner_user_id") REFERENCES "public"."flows"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flow_version_owner_fk" FOREIGN KEY ("flow_id","flow_version_id","owner_user_id") REFERENCES "public"."flow_versions"("flow_id","id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_runtime_event_owner_fk" FOREIGN KEY ("runtime_event_id","owner_user_id") REFERENCES "public"."flow_runtime_events"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_activation_epoch_fk" FOREIGN KEY ("activation_epoch_id","flow_id","flow_version_id") REFERENCES "public"."flow_activation_epochs"("id","flow_id","flow_version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_events" ADD CONSTRAINT "flow_runtime_events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_step_runs" ADD CONSTRAINT "flow_step_runs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_step_runs" ADD CONSTRAINT "flow_step_runs_run_owner_fk" FOREIGN KEY ("flow_run_id","owner_user_id") REFERENCES "public"."flow_runs"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_suppressions" ADD CONSTRAINT "flow_suppressions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_suppressions" ADD CONSTRAINT "flow_suppressions_flow_owner_fk" FOREIGN KEY ("flow_id","owner_user_id") REFERENCES "public"."flows"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_suppressions" ADD CONSTRAINT "flow_suppressions_runtime_event_owner_fk" FOREIGN KEY ("runtime_event_id","owner_user_id") REFERENCES "public"."flow_runtime_events"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_suppressions" ADD CONSTRAINT "flow_suppressions_run_event_owner_fk" FOREIGN KEY ("flow_run_id","flow_id","runtime_event_id","owner_user_id") REFERENCES "public"."flow_runs"("id","flow_id","runtime_event_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_signal_inbox" ADD CONSTRAINT "flow_execution_signal_inbox_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_signal_waits" ADD CONSTRAINT "flow_execution_signal_waits_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_signal_waits" ADD CONSTRAINT "flow_execution_signal_waits_run_version_owner_fk" FOREIGN KEY ("flow_run_id","flow_version_id","owner_user_id") REFERENCES "public"."flow_runs"("id","flow_version_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_signal_waits" ADD CONSTRAINT "flow_execution_signal_waits_token_run_owner_fk" FOREIGN KEY ("token_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_execution_tokens"("id","flow_run_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_signal_waits" ADD CONSTRAINT "flow_execution_signal_waits_consumed_signal_owner_fk" FOREIGN KEY ("consumed_signal_id","owner_user_id") REFERENCES "public"."flow_execution_signal_inbox"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_command_outcomes" ADD CONSTRAINT "flow_runtime_command_outcomes_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."flow_runtime_commands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_commands" ADD CONSTRAINT "flow_runtime_commands_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_commands" ADD CONSTRAINT "flow_runtime_commands_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_owner_subjects" ADD CONSTRAINT "flow_runtime_owner_subjects_user_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_control_command_outcomes" ADD CONSTRAINT "flow_runtime_control_command_outcomes_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."flow_runtime_control_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_control_commands" ADD CONSTRAINT "flow_runtime_control_commands_actor_fk" FOREIGN KEY ("actor_subject_id") REFERENCES "public"."audit_actor_subjects"("actor_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_control_authority" ADD CONSTRAINT "flow_runtime_control_authority_policy_fk" FOREIGN KEY ("current_policy_revision") REFERENCES "public"."flow_runtime_rollout_policy_versions"("revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_control_authority" ADD CONSTRAINT "flow_runtime_control_authority_actor_fk" FOREIGN KEY ("updated_by_actor_subject_id") REFERENCES "public"."audit_actor_subjects"("actor_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_control_authority" ADD CONSTRAINT "flow_runtime_control_authority_command_fk" FOREIGN KEY ("last_command_id") REFERENCES "public"."flow_runtime_control_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_rollout_policy_versions" ADD CONSTRAINT "flow_runtime_rollout_policy_versions_supersedes_fk" FOREIGN KEY ("supersedes_revision") REFERENCES "public"."flow_runtime_rollout_policy_versions"("revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_rollout_policy_versions" ADD CONSTRAINT "flow_runtime_rollout_policy_versions_actor_fk" FOREIGN KEY ("created_by_actor_subject_id") REFERENCES "public"."audit_actor_subjects"("actor_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_runtime_rollout_policy_versions" ADD CONSTRAINT "flow_runtime_rollout_policy_versions_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."flow_runtime_control_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_worker_readiness_leases" ADD CONSTRAINT "flow_worker_readiness_leases_registration_fk" FOREIGN KEY ("session_id") REFERENCES "public"."flow_worker_registrations"("session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_worker_readiness_leases" ADD CONSTRAINT "flow_worker_readiness_leases_policy_fk" FOREIGN KEY ("policy_revision") REFERENCES "public"."flow_runtime_rollout_policy_versions"("revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_activation_epochs" ADD CONSTRAINT "flow_activation_epochs_version_fk" FOREIGN KEY ("flow_id","flow_version_id") REFERENCES "public"."flow_versions"("flow_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_activation_epochs" ADD CONSTRAINT "flow_activation_epochs_owner_subject_fk" FOREIGN KEY ("owner_subject_id") REFERENCES "public"."flow_runtime_owner_subjects"("owner_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_activation_epochs" ADD CONSTRAINT "flow_activation_epochs_policy_fk" FOREIGN KEY ("rollout_policy_revision") REFERENCES "public"."flow_runtime_rollout_policy_versions"("revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_activation_epochs" ADD CONSTRAINT "flow_activation_epochs_activated_actor_fk" FOREIGN KEY ("activated_by_actor_subject_id") REFERENCES "public"."audit_actor_subjects"("actor_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_activation_epochs" ADD CONSTRAINT "flow_activation_epochs_activate_command_fk" FOREIGN KEY ("activate_command_id") REFERENCES "public"."flow_enrollment_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_activation_epochs" ADD CONSTRAINT "flow_activation_epochs_closed_actor_fk" FOREIGN KEY ("closed_by_actor_subject_id") REFERENCES "public"."audit_actor_subjects"("actor_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_activation_epochs" ADD CONSTRAINT "flow_activation_epochs_close_command_fk" FOREIGN KEY ("close_command_id") REFERENCES "public"."flow_enrollment_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_automation_quota_authorities" ADD CONSTRAINT "flow_automation_quota_authorities_owner_subject_fk" FOREIGN KEY ("owner_subject_id") REFERENCES "public"."flow_runtime_owner_subjects"("owner_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollment_command_outcomes" ADD CONSTRAINT "flow_enrollment_command_outcomes_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."flow_enrollment_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollment_commands" ADD CONSTRAINT "flow_enrollment_commands_actor_subject_fk" FOREIGN KEY ("actor_subject_id") REFERENCES "public"."audit_actor_subjects"("actor_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollment_commands" ADD CONSTRAINT "flow_enrollment_commands_owner_subject_fk" FOREIGN KEY ("owner_subject_id") REFERENCES "public"."flow_runtime_owner_subjects"("owner_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollment_controls" ADD CONSTRAINT "flow_enrollment_controls_flow_owner_fk" FOREIGN KEY ("flow_id","owner_user_id") REFERENCES "public"."flows"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollment_controls" ADD CONSTRAINT "flow_enrollment_controls_owner_subject_fk" FOREIGN KEY ("owner_subject_id") REFERENCES "public"."flow_runtime_owner_subjects"("owner_subject_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollment_controls" ADD CONSTRAINT "flow_enrollment_controls_active_epoch_fk" FOREIGN KEY ("active_activation_epoch_id","flow_id","active_version_id") REFERENCES "public"."flow_activation_epochs"("id","flow_id","flow_version_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_enrollment_controls" ADD CONSTRAINT "flow_enrollment_controls_last_command_fk" FOREIGN KEY ("last_command_id") REFERENCES "public"."flow_enrollment_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_work_items" ADD CONSTRAINT "flow_work_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_work_items" ADD CONSTRAINT "flow_work_items_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_work_items" ADD CONSTRAINT "flow_work_items_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_work_items" ADD CONSTRAINT "flow_work_items_run_version_owner_fk" FOREIGN KEY ("flow_run_id","flow_version_id","owner_user_id") REFERENCES "public"."flow_runs"("id","flow_version_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_work_items" ADD CONSTRAINT "flow_work_items_token_run_owner_fk" FOREIGN KEY ("token_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_execution_tokens"("id","flow_run_id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_work_items" ADD CONSTRAINT "flow_work_items_last_command_run_owner_fk" FOREIGN KEY ("last_command_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_runtime_commands"("id","flow_run_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_work_items" ADD CONSTRAINT "flow_work_items_last_run_event_run_owner_fk" FOREIGN KEY ("last_run_event_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_run_events"("id","flow_run_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_birth_profile_recheck_receipts" ADD CONSTRAINT "flow_birth_profile_recheck_receipts_outbox_event_fk" FOREIGN KEY ("source_outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_birth_profile_recheck_receipts" ADD CONSTRAINT "flow_birth_profile_recheck_receipts_history_fk" FOREIGN KEY ("birth_data_history_id") REFERENCES "public"."client_birth_data_history"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_birth_profile_recheck_receipts" ADD CONSTRAINT "flow_birth_profile_recheck_receipts_run_owner_fk" FOREIGN KEY ("flow_run_id","owner_user_id") REFERENCES "public"."flow_runs"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_birth_profile_recheck_receipts" ADD CONSTRAINT "flow_birth_profile_recheck_receipts_work_item_run_owner_fk" FOREIGN KEY ("work_item_id","flow_run_id","owner_user_id") REFERENCES "public"."flow_work_items"("id","flow_run_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_booking_lifecycle_heads" ADD CONSTRAINT "flow_booking_lifecycle_heads_booking_owner_fk" FOREIGN KEY ("booking_id","owner_user_id") REFERENCES "public"."bookings"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_booking_lifecycle_heads" ADD CONSTRAINT "flow_booking_lifecycle_heads_event_booking_owner_fk" FOREIGN KEY ("last_lifecycle_event_id","booking_id","owner_user_id") REFERENCES "public"."booking_lifecycle_events"("id","booking_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_booking_lifecycle_receipts" ADD CONSTRAINT "flow_booking_lifecycle_receipts_event_booking_owner_fk" FOREIGN KEY ("lifecycle_event_id","booking_id","owner_user_id") REFERENCES "public"."booking_lifecycle_events"("id","booking_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_booking_lifecycle_receipts" ADD CONSTRAINT "flow_booking_lifecycle_receipts_runtime_event_owner_fk" FOREIGN KEY ("flow_runtime_event_id","owner_user_id") REFERENCES "public"."flow_runtime_events"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_versions_owner_published_idx" ON "flow_versions" USING btree ("owner_user_id","published_at");--> statement-breakpoint
CREATE INDEX "flows_owner_status_updated_idx" ON "flows" USING btree ("owner_user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "flows_owner_definition_state_updated_idx" ON "flows" USING btree ("owner_user_id","definition_state","updated_at","id");--> statement-breakpoint
CREATE INDEX "flows_owner_name_idx" ON "flows" USING btree ("owner_user_id","name");--> statement-breakpoint
CREATE INDEX "flow_definition_command_outcomes_created_idx" ON "flow_definition_command_outcomes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "flow_definition_commands_replay_until_idx" ON "flow_definition_commands" USING btree ("replay_until");--> statement-breakpoint
CREATE INDEX "flow_definition_commands_owner_resource_created_idx" ON "flow_definition_commands" USING btree ("owner_user_id","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "flow_approvals_owner_status_created_idx" ON "flow_approvals" USING btree ("owner_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "flow_approvals_run_created_idx" ON "flow_approvals" USING btree ("flow_run_id","created_at");--> statement-breakpoint
CREATE INDEX "flow_delivery_attempts_owner_status_created_idx" ON "flow_delivery_attempts" USING btree ("owner_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "flow_execution_attempts_owner_run_completed_idx" ON "flow_execution_attempts" USING btree ("owner_user_id","flow_run_id","completed_at","id");--> statement-breakpoint
CREATE INDEX "flow_execution_tokens_owner_run_idx" ON "flow_execution_tokens" USING btree ("owner_user_id","flow_run_id");--> statement-breakpoint
CREATE INDEX "flow_execution_tokens_runnable_idx" ON "flow_execution_tokens" USING btree ("state","available_at","created_at","id");--> statement-breakpoint
CREATE INDEX "flow_execution_tokens_expired_lease_idx" ON "flow_execution_tokens" USING btree ("state","lease_expires_at","id");--> statement-breakpoint
CREATE INDEX "flow_execution_tokens_quarantined_idx" ON "flow_execution_tokens" USING btree ("failure_disposition","quarantined_at","id");--> statement-breakpoint
CREATE INDEX "flow_run_events_owner_occurred_idx" ON "flow_run_events" USING btree ("owner_user_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "flow_runs_owner_status_updated_idx" ON "flow_runs" USING btree ("owner_user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "flow_runs_flow_created_idx" ON "flow_runs" USING btree ("flow_id","created_at","id");--> statement-breakpoint
CREATE INDEX "flow_runs_runtime_event_idx" ON "flow_runs" USING btree ("runtime_event_id");--> statement-breakpoint
CREATE INDEX "flow_runtime_events_owner_occurred_idx" ON "flow_runtime_events" USING btree ("owner_user_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "flow_step_runs_owner_run_created_idx" ON "flow_step_runs" USING btree ("owner_user_id","flow_run_id","created_at");--> statement-breakpoint
CREATE INDEX "flow_suppressions_owner_created_idx" ON "flow_suppressions" USING btree ("owner_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "flow_suppressions_runtime_event_idx" ON "flow_suppressions" USING btree ("runtime_event_id");--> statement-breakpoint
CREATE INDEX "flow_execution_signal_inbox_pending_idx" ON "flow_execution_signal_inbox" USING btree ("owner_user_id","signal_type","correlation_id","received_at");--> statement-breakpoint
CREATE INDEX "flow_execution_signal_waits_match_idx" ON "flow_execution_signal_waits" USING btree ("owner_user_id","signal_type","correlation_id","state");--> statement-breakpoint
CREATE INDEX "flow_runtime_command_outcomes_created_idx" ON "flow_runtime_command_outcomes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "flow_runtime_commands_replay_until_idx" ON "flow_runtime_commands" USING btree ("replay_until");--> statement-breakpoint
CREATE INDEX "flow_runtime_commands_owner_resource_created_idx" ON "flow_runtime_commands" USING btree ("owner_user_id","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "flow_runtime_owner_subjects_state_created_idx" ON "flow_runtime_owner_subjects" USING btree ("state","created_at","owner_subject_id");--> statement-breakpoint
CREATE INDEX "flow_runtime_control_command_outcomes_created_idx" ON "flow_runtime_control_command_outcomes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "flow_runtime_control_commands_replay_until_idx" ON "flow_runtime_control_commands" USING btree ("replay_until");--> statement-breakpoint
CREATE INDEX "flow_runtime_control_commands_target_created_idx" ON "flow_runtime_control_commands" USING btree ("target_revision","created_at","id");--> statement-breakpoint
CREATE INDEX "flow_runtime_rollout_policy_versions_mode_created_idx" ON "flow_runtime_rollout_policy_versions" USING btree ("mode","created_at","revision");--> statement-breakpoint
CREATE INDEX "flow_worker_readiness_leases_ready_idx" ON "flow_worker_readiness_leases" USING btree ("state","policy_revision","ready_until","instance_id");--> statement-breakpoint
CREATE INDEX "flow_worker_registration_tombstones_purge_idx" ON "flow_worker_registration_tombstones" USING btree ("purge_after","session_id");--> statement-breakpoint
CREATE INDEX "flow_worker_registrations_instance_started_idx" ON "flow_worker_registrations" USING btree ("instance_id","started_at");--> statement-breakpoint
CREATE INDEX "flow_activation_epochs_flow_effective_idx" ON "flow_activation_epochs" USING btree ("flow_id","effective_from","id");--> statement-breakpoint
CREATE INDEX "flow_automation_quota_authorities_updated_idx" ON "flow_automation_quota_authorities" USING btree ("updated_at","owner_subject_id");--> statement-breakpoint
CREATE INDEX "flow_enrollment_command_outcomes_created_idx" ON "flow_enrollment_command_outcomes" USING btree ("created_at","command_id");--> statement-breakpoint
CREATE INDEX "flow_enrollment_commands_replay_until_idx" ON "flow_enrollment_commands" USING btree ("replay_until","id");--> statement-breakpoint
CREATE INDEX "flow_enrollment_commands_owner_resource_created_idx" ON "flow_enrollment_commands" USING btree ("owner_subject_id","resource_id","created_at","id");--> statement-breakpoint
CREATE INDEX "flow_enrollment_controls_owner_state_updated_idx" ON "flow_enrollment_controls" USING btree ("owner_user_id","state","updated_at","flow_id");--> statement-breakpoint
CREATE INDEX "flow_work_items_owner_status_available_idx" ON "flow_work_items" USING btree ("owner_user_id","status","available_at","created_at","id");--> statement-breakpoint
CREATE INDEX "flow_work_items_run_created_idx" ON "flow_work_items" USING btree ("flow_run_id","created_at","id");--> statement-breakpoint
CREATE INDEX "flow_birth_profile_recheck_receipts_history_idx" ON "flow_birth_profile_recheck_receipts" USING btree ("birth_data_history_id","processed_at","id");--> statement-breakpoint
CREATE INDEX "flow_booking_lifecycle_heads_owner_state_idx" ON "flow_booking_lifecycle_heads" USING btree ("owner_user_id","state","updated_at","booking_id");--> statement-breakpoint
CREATE INDEX "flow_booking_lifecycle_receipts_owner_processed_idx" ON "flow_booking_lifecycle_receipts" USING btree ("owner_user_id","processed_at","lifecycle_event_id");
--> statement-breakpoint
-- ElevenHouse Flows integrity objects: begin
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_version_guard$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'flow_versions rows are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_versions_immutable_update';
  END IF;

  IF EXISTS (SELECT 1 FROM flows WHERE id = OLD.flow_id)
     AND EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_user_id) THEN
    RAISE EXCEPTION 'flow_versions rows can only be deleted with their aggregate'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_versions_delete_with_aggregate_only';
  END IF;

  RETURN OLD;
END;
$flow_version_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_versions_immutable_update"
BEFORE UPDATE ON flow_versions
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_version_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_versions_delete_with_aggregate_only"
BEFORE DELETE ON flow_versions
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_version_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_publication_pointer()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_pointer_guard$
DECLARE
  checked_flow_id uuid;
  aggregate_row flows%ROWTYPE;
  latest_version_row flow_versions%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'flows' THEN
    checked_flow_id := COALESCE(NEW.id, OLD.id);
  ELSE
    checked_flow_id := COALESCE(NEW.flow_id, OLD.flow_id);
  END IF;

  SELECT * INTO aggregate_row
    FROM flows
   WHERE id = checked_flow_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO latest_version_row
    FROM flow_versions
   WHERE flow_id = checked_flow_id
   ORDER BY version DESC
   LIMIT 1;

  IF NOT FOUND THEN
    IF aggregate_row.published_version_id IS NOT NULL
       OR aggregate_row.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'flow publication pointer exists without an immutable version'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_publication_pointer_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF aggregate_row.published_version_id IS DISTINCT FROM latest_version_row.id
     OR aggregate_row.published_at IS DISTINCT FROM latest_version_row.published_at THEN
    RAISE EXCEPTION 'flow publication pointer must identify the latest immutable version'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_publication_pointer_consistency';
  END IF;

  RETURN NULL;
END;
$flow_pointer_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_publication_pointer_consistency"
AFTER INSERT OR UPDATE ON flows
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_publication_pointer();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_version_pointer_consistency"
AFTER INSERT OR DELETE ON flow_versions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_publication_pointer();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_definition_command_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_command_guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_user_id) THEN
      RAISE EXCEPTION 'flow definition command tombstones are retained for the owner lifetime'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_definition_commands_immutable_identity';
    END IF;
    RETURN OLD;
  END IF;

  IF ROW(
      OLD.id,
      OLD.api_surface,
      OLD.actor_user_id,
      OLD.owner_user_id,
      OLD.route_template,
      OLD.resource_id,
      OLD.command_scope,
      OLD.idempotency_key,
      OLD.request_hash,
      OLD.replay_until,
      OLD.created_at
    ) IS DISTINCT FROM ROW(
      NEW.id,
      NEW.api_surface,
      NEW.actor_user_id,
      NEW.owner_user_id,
      NEW.route_template,
      NEW.resource_id,
      NEW.command_scope,
      NEW.idempotency_key,
      NEW.request_hash,
      NEW.replay_until,
      NEW.created_at
    ) THEN
    RAISE EXCEPTION 'flow definition command identity is immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_definition_commands_immutable_identity';
  END IF;

  IF OLD.state <> 'processing'
     OR NEW.state NOT IN ('succeeded', 'failed')
     OR OLD.completed_at IS NOT NULL
     OR NEW.completed_at IS NULL
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'flow definition command permits one processing-to-terminal transition'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_definition_commands_immutable_identity';
  END IF;

  RETURN NEW;
END;
$flow_command_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_definition_commands_immutable_identity"
BEFORE UPDATE OR DELETE ON flow_definition_commands
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_definition_command_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_definition_outcome_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_outcome_guard$
DECLARE
  command_replay_until timestamp with time zone;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'flow definition command outcomes are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_definition_command_outcomes_retention';
  END IF;

  SELECT replay_until INTO command_replay_until
    FROM flow_definition_commands
   WHERE id = OLD.command_id;
  IF FOUND AND transaction_timestamp() < command_replay_until THEN
    RAISE EXCEPTION 'flow definition command outcome is retained through its replay window'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_definition_command_outcomes_retention';
  END IF;

  RETURN OLD;
END;
$flow_outcome_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_definition_command_outcomes_retention"
BEFORE UPDATE OR DELETE ON flow_definition_command_outcomes
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_definition_outcome_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_definition_command_outcome()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_command_outcome_guard$
DECLARE
  checked_command_id uuid;
  command_row flow_definition_commands%ROWTYPE;
  outcome_row flow_definition_command_outcomes%ROWTYPE;
  has_outcome boolean;
BEGIN
  IF TG_TABLE_NAME = 'flow_definition_commands' THEN
    checked_command_id := COALESCE(NEW.id, OLD.id);
  ELSE
    checked_command_id := COALESCE(NEW.command_id, OLD.command_id);
  END IF;

  SELECT * INTO command_row
    FROM flow_definition_commands
   WHERE id = checked_command_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO outcome_row
    FROM flow_definition_command_outcomes
   WHERE command_id = checked_command_id;
  has_outcome := FOUND;

  IF command_row.state = 'processing' THEN
    IF has_outcome THEN
      RAISE EXCEPTION 'processing flow definition command cannot have an outcome'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_definition_command_outcome_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF NOT has_outcome THEN
    IF transaction_timestamp() < command_row.replay_until THEN
      RAISE EXCEPTION 'terminal flow definition command requires a replay outcome'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_definition_command_outcome_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF outcome_row.created_at < command_row.created_at
     OR outcome_row.created_at > command_row.replay_until
     OR outcome_row.created_at IS DISTINCT FROM command_row.completed_at
     OR (command_row.state = 'succeeded' AND outcome_row.response_status NOT IN (200, 201))
     OR (command_row.state = 'failed' AND outcome_row.response_status NOT BETWEEN 400 AND 499) THEN
    RAISE EXCEPTION 'flow definition command state and outcome do not agree'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_definition_command_outcome_consistency';
  END IF;

  RETURN NULL;
END;
$flow_command_outcome_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_definition_command_outcome_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_definition_commands
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_definition_command_outcome();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_definition_outcome_command_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_definition_command_outcomes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_definition_command_outcome();
--> statement-breakpoint

--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_run_enrollment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_run_enrollment_guard$
BEGIN
  IF ROW(
    OLD.id, OLD.owner_user_id, OLD.flow_id, OLD.flow_version_id,
    OLD.runtime_event_id, OLD.activation_epoch_id, OLD.trigger_node_id,
    OLD.occurrence_key, OLD.enrollment_policy_key, OLD.enrollment_policy_revision,
    OLD.execution_authority_basis, OLD.execution_authority_ref_id,
    OLD.snapshot, OLD.created_at
  ) IS DISTINCT FROM ROW(
    NEW.id, NEW.owner_user_id, NEW.flow_id, NEW.flow_version_id,
    NEW.runtime_event_id, NEW.activation_epoch_id, NEW.trigger_node_id,
    NEW.occurrence_key, NEW.enrollment_policy_key, NEW.enrollment_policy_revision,
    NEW.execution_authority_basis, NEW.execution_authority_ref_id,
    NEW.snapshot, NEW.created_at
  ) THEN
    RAISE EXCEPTION 'Flow run enrollment identity and snapshot are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runs_enrollment_immutable';
  END IF;
  IF NEW.trace_sequence < OLD.trace_sequence OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Flow run trace and update time are monotonic'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runs_enrollment_immutable';
  END IF;
  RETURN NEW;
END;
$flow_run_enrollment_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_runs_enrollment_immutable"
BEFORE UPDATE ON flow_runs
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_run_enrollment_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_runtime_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_runtime_event_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'flow runtime events are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_events_immutable';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'flow runtime events are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_events_immutable';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_user_id) THEN
    RAISE EXCEPTION 'flow runtime events are retained for the owner lifetime'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_events_immutable';
  END IF;

  RETURN OLD;
END;
$flow_runtime_event_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_runtime_events_immutable"
BEFORE UPDATE OR DELETE ON flow_runtime_events
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_runtime_event_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_runtime_events_truncate_guard"
BEFORE TRUNCATE ON flow_runtime_events
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_runtime_event_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_runtime_command_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_runtime_command_guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_user_id) THEN
      RAISE EXCEPTION 'flow runtime command tombstones are retained for the owner lifetime'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_commands_immutable_identity';
    END IF;
    RETURN OLD;
  END IF;

  IF ROW(
      OLD.id,
      OLD.api_surface,
      OLD.actor_user_id,
      OLD.owner_user_id,
      OLD.route_template,
      OLD.resource_id,
      OLD.flow_run_id,
      OLD.command_scope,
      OLD.idempotency_key,
      OLD.request_hash,
      OLD.replay_until,
      OLD.created_at
    ) IS DISTINCT FROM ROW(
      NEW.id,
      NEW.api_surface,
      NEW.actor_user_id,
      NEW.owner_user_id,
      NEW.route_template,
      NEW.resource_id,
      NEW.flow_run_id,
      NEW.command_scope,
      NEW.idempotency_key,
      NEW.request_hash,
      NEW.replay_until,
      NEW.created_at
    ) THEN
    RAISE EXCEPTION 'flow runtime command identity is immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_commands_immutable_identity';
  END IF;

  IF OLD.state <> 'processing'
     OR NEW.state NOT IN ('succeeded', 'failed')
     OR OLD.completed_at IS NOT NULL
     OR NEW.completed_at IS NULL
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'flow runtime command permits one processing-to-terminal transition'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_commands_immutable_identity';
  END IF;

  RETURN NEW;
END;
$flow_runtime_command_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_runtime_commands_immutable_identity"
BEFORE UPDATE OR DELETE ON flow_runtime_commands
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_runtime_command_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_runtime_outcome_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_runtime_outcome_guard$
DECLARE
  command_replay_until timestamp with time zone;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'flow runtime command outcomes are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_command_outcomes_retention';
  END IF;

  SELECT replay_until INTO command_replay_until
    FROM flow_runtime_commands
   WHERE id = OLD.command_id;
  IF FOUND AND transaction_timestamp() < command_replay_until THEN
    RAISE EXCEPTION 'flow runtime command outcome is retained through its replay window'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_runtime_command_outcomes_retention';
  END IF;

  RETURN OLD;
END;
$flow_runtime_outcome_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_runtime_command_outcomes_retention"
BEFORE UPDATE OR DELETE ON flow_runtime_command_outcomes
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_runtime_outcome_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_runtime_command_outcome()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_runtime_command_outcome_guard$
DECLARE
  checked_command_id uuid;
  command_row flow_runtime_commands%ROWTYPE;
  outcome_row flow_runtime_command_outcomes%ROWTYPE;
  has_outcome boolean;
BEGIN
  IF TG_TABLE_NAME = 'flow_runtime_commands' THEN
    checked_command_id := COALESCE(NEW.id, OLD.id);
  ELSE
    checked_command_id := COALESCE(NEW.command_id, OLD.command_id);
  END IF;

  SELECT * INTO command_row
    FROM flow_runtime_commands
   WHERE id = checked_command_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO outcome_row
    FROM flow_runtime_command_outcomes
   WHERE command_id = checked_command_id;
  has_outcome := FOUND;

  IF command_row.state = 'processing' THEN
    IF has_outcome THEN
      RAISE EXCEPTION 'processing flow runtime command cannot have an outcome'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_runtime_command_outcome_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF NOT has_outcome THEN
    IF transaction_timestamp() < command_row.replay_until THEN
      RAISE EXCEPTION 'terminal flow runtime command requires a replay outcome'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_runtime_command_outcome_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF outcome_row.created_at < command_row.created_at
     OR outcome_row.created_at > command_row.replay_until
     OR outcome_row.created_at IS DISTINCT FROM command_row.completed_at
     OR (command_row.state = 'succeeded' AND outcome_row.response_status <> 200)
     OR (command_row.state = 'failed' AND outcome_row.response_status NOT IN (404, 409)) THEN
    RAISE EXCEPTION 'flow runtime command state and outcome do not agree'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_runtime_command_outcome_consistency';
  END IF;

  RETURN NULL;
END;
$flow_runtime_command_outcome_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_runtime_command_outcome_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_runtime_commands
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_runtime_command_outcome();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_runtime_outcome_command_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_runtime_command_outcomes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_runtime_command_outcome();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_runtime_command_event()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_runtime_command_event_guard$
DECLARE
  matching_event_count bigint;
  semantic_replay_event_count bigint := 0;
BEGIN
  SELECT count(*) INTO matching_event_count
    FROM flow_run_events event
   WHERE event.command_id = NEW.id
     AND event.owner_user_id = NEW.owner_user_id
     AND event.flow_run_id = NEW.flow_run_id
     AND (
       (
         NEW.command_scope = 'flows.runtime.cancel.v1'
         AND event.event_type = 'run_canceled'
         AND event.summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
       ) OR (
         NEW.command_scope = 'flows.work-items.complete.v1'
         AND event.event_type = 'token_advanced'
         AND event.summary->>'reasonCode' = 'FLOW_WORK_ITEM_COMPLETED'
       )
     );

  IF NEW.command_scope = 'flows.runtime.cancel.v1'
     AND matching_event_count = 0 THEN
    SELECT count(*) INTO semantic_replay_event_count
      FROM flow_runs run
      JOIN flow_execution_tokens token
        ON token.flow_run_id = run.id
       AND token.owner_user_id = run.owner_user_id
      JOIN flow_run_events event
        ON event.flow_run_id = run.id
       AND event.owner_user_id = run.owner_user_id
       AND event.sequence = run.trace_sequence
      JOIN flow_runtime_commands source_command
        ON source_command.id = event.command_id
       AND source_command.flow_run_id = run.id
       AND source_command.owner_user_id = run.owner_user_id
      JOIN flow_runtime_command_outcomes current_outcome
        ON current_outcome.command_id = NEW.id
     WHERE run.id = NEW.flow_run_id
       AND run.owner_user_id = NEW.owner_user_id
       AND run.status = 'canceled'
       AND token.state = 'canceled'
       AND event.event_type = 'run_canceled'
       AND event.summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
       AND source_command.api_surface = 'astrologer-api'
       AND source_command.route_template = '/flow-runs/:runId/cancel'
       AND source_command.resource_id = run.id
       AND source_command.command_scope = 'flows.runtime.cancel.v1'
       AND source_command.state = 'succeeded'
       AND current_outcome.response_status = 200
       AND current_outcome.response_body->'run'->>'id' = run.id::text
       AND current_outcome.response_body->'run'->>'status' = 'canceled';
  END IF;

  IF matching_event_count <> 1 AND semantic_replay_event_count <> 1 THEN
    RAISE EXCEPTION 'succeeded flow command requires exactly one durable event'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_runtime_command_event_consistency';
  END IF;

  RETURN NULL;
END;
$flow_runtime_command_event_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_runtime_command_event_consistency"
AFTER INSERT OR UPDATE ON flow_runtime_commands
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  NEW.state = 'succeeded'
  AND NEW.command_scope IN ('flows.runtime.cancel.v1', 'flows.work-items.complete.v1')
)
EXECUTE FUNCTION elevenhouse_assert_flow_runtime_command_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_run_event_command()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_run_event_command_guard$
DECLARE
  command_row flow_runtime_commands%ROWTYPE;
  lifecycle_event_row booking_lifecycle_events%ROWTYPE;
BEGIN
  IF NEW.booking_lifecycle_event_id IS NOT NULL THEN
    SELECT * INTO lifecycle_event_row
      FROM booking_lifecycle_events
     WHERE id = NEW.booking_lifecycle_event_id;
    IF NOT FOUND
       OR NEW.command_id IS NOT NULL
       OR lifecycle_event_row.owner_user_id IS DISTINCT FROM NEW.owner_user_id
       OR NOT EXISTS (
         SELECT 1
           FROM flow_runs run
           JOIN flow_runtime_events runtime_event
             ON runtime_event.id = run.runtime_event_id
            AND runtime_event.owner_user_id = run.owner_user_id
          WHERE run.id = NEW.flow_run_id
            AND run.owner_user_id = NEW.owner_user_id
            AND runtime_event.source = 'booking'
            AND runtime_event.subject_type = 'booking'
            AND runtime_event.subject_id = lifecycle_event_row.booking_id::text
       ) THEN
      RAISE EXCEPTION 'system run event requires its canonical Booking lifecycle event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
    END IF;

    IF NEW.event_type = 'run_canceled' THEN
      IF NEW.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BOOKING_CANCELED'
         OR lifecycle_event_row.event_kind IS DISTINCT FROM 'cancelled'
         OR (
           NEW.attempt_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
               FROM flow_execution_attempts attempt
              WHERE attempt.id = NEW.attempt_id
                AND attempt.owner_user_id = NEW.owner_user_id
                AND attempt.flow_run_id = NEW.flow_run_id
                AND attempt.node_id = NEW.node_id
                AND attempt.outcome = 'canceled'
                AND attempt.result_code = 'FLOW_RUN_CANCELED'
                AND attempt.trace_summary->>'reasonCode' = 'FLOW_BOOKING_CANCELED'
           )
         ) THEN
        RAISE EXCEPTION 'system cancellation event requires its canonical Booking lifecycle event'
          USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
      END IF;
    ELSIF NEW.event_type = 'booking_rescheduled' THEN
      IF NEW.attempt_id IS NOT NULL
         OR lifecycle_event_row.event_kind IS DISTINCT FROM 'rescheduled'
         OR NEW.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BOOKING_RESCHEDULED'
         OR NEW.summary->>'resultCode' IS DISTINCT FROM 'FLOW_BOOKING_SCHEDULE_UPDATED'
         OR NEW.summary->>'bookingId' IS DISTINCT FROM lifecycle_event_row.booking_id::text
         OR (NEW.summary->>'bookingLifecycleRevision')::integer
              IS DISTINCT FROM lifecycle_event_row.revision
         OR (NEW.summary->>'previousStartAt')::timestamptz
              IS DISTINCT FROM lifecycle_event_row.before_start_at
         OR (NEW.summary->>'previousEndAt')::timestamptz
              IS DISTINCT FROM lifecycle_event_row.before_end_at
         OR NEW.summary->>'previousTimeZone'
              IS DISTINCT FROM lifecycle_event_row.before_time_zone
         OR (NEW.summary->>'currentStartAt')::timestamptz
              IS DISTINCT FROM lifecycle_event_row.after_start_at
         OR (NEW.summary->>'currentEndAt')::timestamptz
              IS DISTINCT FROM lifecycle_event_row.after_end_at
         OR NEW.summary->>'currentTimeZone'
              IS DISTINCT FROM lifecycle_event_row.after_time_zone
         OR NOT EXISTS (
           SELECT 1
             FROM flow_execution_tokens token
            WHERE token.flow_run_id = NEW.flow_run_id
              AND token.owner_user_id = NEW.owner_user_id
              AND token.node_id = NEW.node_id
              AND token.node_kind = NEW.summary->>'nodeKind'
         ) THEN
        RAISE EXCEPTION 'schedule adjustment event requires its canonical Booking reschedule'
          USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
      END IF;
    ELSE
      RAISE EXCEPTION 'Booking lifecycle provenance is not supported for this run event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.command_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO command_row
    FROM flow_runtime_commands
   WHERE id = NEW.command_id;
  IF NEW.event_type = 'run_canceled' AND (
       NOT FOUND
       OR command_row.api_surface <> 'astrologer-api'
       OR command_row.owner_user_id <> NEW.owner_user_id
       OR command_row.flow_run_id <> NEW.flow_run_id
       OR command_row.route_template <> '/flow-runs/:runId/cancel'
       OR command_row.resource_id <> NEW.flow_run_id
       OR command_row.command_scope <> 'flows.runtime.cancel.v1'
       OR command_row.state <> 'succeeded'
     ) THEN
    RAISE EXCEPTION 'cancellation event requires a succeeded runtime command'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
  END IF;

  IF NEW.event_type = 'token_advanced'
     AND NEW.summary->>'reasonCode' = 'FLOW_WORK_ITEM_COMPLETED'
     AND (
       NOT FOUND
       OR command_row.api_surface <> 'astrologer-api'
       OR command_row.owner_user_id <> NEW.owner_user_id
       OR command_row.flow_run_id <> NEW.flow_run_id
       OR command_row.route_template <> '/flow-work-items/:workItemId/complete'
       OR command_row.command_scope <> 'flows.work-items.complete.v1'
       OR command_row.state <> 'succeeded'
       OR NOT EXISTS (
         SELECT 1 FROM flow_work_items
          WHERE id = command_row.resource_id
            AND owner_user_id = NEW.owner_user_id
            AND flow_run_id = NEW.flow_run_id
            AND node_id = NEW.node_id
            AND last_command_id = command_row.id
            AND status = 'completed'
       )
     ) THEN
    RAISE EXCEPTION 'work-item completion event requires its succeeded runtime command'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
  END IF;

  IF NEW.event_type NOT IN ('run_canceled', 'token_advanced')
     OR (
       NEW.event_type = 'token_advanced'
       AND NEW.summary->>'reasonCode' <> 'FLOW_WORK_ITEM_COMPLETED'
     ) THEN
    RAISE EXCEPTION 'flow run event has an unsupported command provenance'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_run_event_command_consistency';
  END IF;

  RETURN NULL;
END;
$flow_run_event_command_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_run_event_command_consistency"
AFTER INSERT OR UPDATE ON flow_run_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_run_event_command();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_execution_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_execution_history_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    IF TG_TABLE_NAME = 'flow_execution_attempts' THEN
      RAISE EXCEPTION 'flow execution attempts are immutable'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_execution_attempts_immutable';
    END IF;
    RAISE EXCEPTION 'flow run events are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_run_events_immutable';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'flow_execution_attempts' THEN
      RAISE EXCEPTION 'flow execution attempts are immutable'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_execution_attempts_immutable';
    END IF;
    RAISE EXCEPTION 'flow run events are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_run_events_immutable';
  END IF;

  IF EXISTS (SELECT 1 FROM flow_runs WHERE id = OLD.flow_run_id)
     AND EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_user_id) THEN
    IF TG_TABLE_NAME = 'flow_execution_attempts' THEN
      RAISE EXCEPTION 'flow execution attempts can only be deleted with their run'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_execution_attempts_immutable';
    END IF;
    RAISE EXCEPTION 'flow run events can only be deleted with their run'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_run_events_immutable';
  END IF;

  RETURN OLD;
END;
$flow_execution_history_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_execution_attempts_immutable"
BEFORE UPDATE OR DELETE ON flow_execution_attempts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_execution_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_execution_attempts_truncate_guard"
BEFORE TRUNCATE ON flow_execution_attempts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_execution_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_run_events_immutable"
BEFORE UPDATE OR DELETE ON flow_run_events
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_execution_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_run_events_truncate_guard"
BEFORE TRUNCATE ON flow_run_events
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_execution_history_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_booking_lifecycle_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_booking_lifecycle_receipt_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Flow Booking lifecycle receipts cannot be truncated'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_receipts_immutable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Flow Booking lifecycle receipts are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_receipts_immutable';
  END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE id = OLD.booking_id) THEN
    RAISE EXCEPTION 'Flow Booking lifecycle receipts are retained for the Booking lifetime'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_receipts_immutable';
  END IF;
  RETURN OLD;
END;
$flow_booking_lifecycle_receipt_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_booking_lifecycle_receipts_immutable"
BEFORE UPDATE OR DELETE ON flow_booking_lifecycle_receipts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_booking_lifecycle_receipt_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_booking_lifecycle_receipts_truncate_guard"
BEFORE TRUNCATE ON flow_booking_lifecycle_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_booking_lifecycle_receipt_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_booking_lifecycle_head_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_booking_lifecycle_head_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Flow Booking lifecycle heads cannot be truncated'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_heads_transition_guard';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM bookings WHERE id = OLD.booking_id) THEN
      RAISE EXCEPTION 'Flow Booking lifecycle head is retained for the Booking lifetime'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_heads_transition_guard';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.applied_revision <> 1 OR NEW.state <> 'confirmed' THEN
      RAISE EXCEPTION 'Flow Booking lifecycle head must begin with confirmation revision one'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_heads_transition_guard';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.booking_id <> NEW.booking_id
     OR OLD.owner_user_id <> NEW.owner_user_id
     OR OLD.created_at <> NEW.created_at
     OR NEW.applied_revision <> OLD.applied_revision + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Flow Booking lifecycle head permits one contiguous revision transition'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_booking_lifecycle_heads_transition_guard';
  END IF;
  RETURN NEW;
END;
$flow_booking_lifecycle_head_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_booking_lifecycle_heads_transition_guard"
BEFORE INSERT OR UPDATE OR DELETE ON flow_booking_lifecycle_heads
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_booking_lifecycle_head_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_booking_lifecycle_heads_truncate_guard"
BEFORE TRUNCATE ON flow_booking_lifecycle_heads
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_booking_lifecycle_head_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_booking_lifecycle_source()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_booking_lifecycle_source_guard$
DECLARE
  source_event booking_lifecycle_events%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'flow_booking_lifecycle_heads' THEN
    SELECT * INTO source_event
      FROM booking_lifecycle_events
     WHERE id = NEW.last_lifecycle_event_id
       AND booking_id = NEW.booking_id
       AND owner_user_id = NEW.owner_user_id
       AND revision = NEW.applied_revision;
    IF NOT FOUND
       OR source_event.canonical_digest IS DISTINCT FROM NEW.last_canonical_digest
       OR (
         NEW.state in ('confirmed', 'completed')
         AND (
           (
             source_event.event_kind IN ('confirmed', 'rescheduled')
             AND (
               source_event.after_start_at IS DISTINCT FROM NEW.current_start_at
               OR source_event.after_end_at IS DISTINCT FROM NEW.current_end_at
               OR source_event.after_time_zone IS DISTINCT FROM NEW.current_time_zone
             )
           ) OR (
             source_event.event_kind = 'completed'
             AND (
               source_event.before_start_at IS DISTINCT FROM NEW.current_start_at
               OR source_event.before_end_at IS DISTINCT FROM NEW.current_end_at
               OR source_event.before_time_zone IS DISTINCT FROM NEW.current_time_zone
             )
           ) OR source_event.event_kind NOT IN ('confirmed', 'rescheduled', 'completed')
         )
       )
       OR (NEW.state = 'cancelled' AND source_event.event_kind <> 'cancelled')
       OR NOT EXISTS (
         SELECT 1
           FROM flow_booking_lifecycle_receipts receipt
          WHERE receipt.lifecycle_event_id = NEW.last_lifecycle_event_id
            AND receipt.booking_id = NEW.booking_id
            AND receipt.owner_user_id = NEW.owner_user_id
            AND receipt.revision = NEW.applied_revision
            AND receipt.canonical_digest = NEW.last_canonical_digest
       ) THEN
      RAISE EXCEPTION 'Flow Booking lifecycle head does not match its canonical event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_booking_lifecycle_source_consistency';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO source_event
    FROM booking_lifecycle_events
   WHERE id = NEW.lifecycle_event_id
     AND booking_id = NEW.booking_id
     AND owner_user_id = NEW.owner_user_id
     AND revision = NEW.revision;
  IF NOT FOUND
     OR source_event.event_kind IS DISTINCT FROM NEW.event_kind
     OR source_event.canonical_digest IS DISTINCT FROM NEW.canonical_digest
     OR (
       NEW.event_kind = 'confirmed'
       AND (
         NOT EXISTS (
           SELECT 1
             FROM flow_runtime_events runtime_event
             JOIN bookings booking
               ON booking.id = NEW.booking_id
              AND booking.owner_user_id = NEW.owner_user_id
            WHERE runtime_event.id = NEW.flow_runtime_event_id
              AND runtime_event.owner_user_id = NEW.owner_user_id
              AND runtime_event.source = 'booking'
              AND runtime_event.source_event_id = NEW.lifecycle_event_id::text
              AND runtime_event.dedupe_key = 'booking-confirmed:' || NEW.booking_id::text
              AND runtime_event.event_kind = 'booking_confirmed'
              AND runtime_event.subject_type = 'booking'
              AND runtime_event.subject_id = NEW.booking_id::text
              AND runtime_event.occurrence_key = NEW.booking_id::text
              AND runtime_event.occurred_at IS NOT DISTINCT FROM source_event.occurred_at
              AND runtime_event.payload_schema_version = 1
              AND runtime_event.payload->>'bookingId' = NEW.booking_id::text
              AND runtime_event.payload->>'clientUserId' = booking.client_user_id::text
              AND runtime_event.payload->>'productId' = booking.product_id::text
              AND jsonb_typeof(runtime_event.payload->'startAt') = 'string'
              AND (runtime_event.payload->>'startAt')::timestamptz
                    IS NOT DISTINCT FROM source_event.after_start_at
              AND jsonb_typeof(runtime_event.payload->'endAt') = 'string'
              AND (runtime_event.payload->>'endAt')::timestamptz
                    IS NOT DISTINCT FROM source_event.after_end_at
              AND runtime_event.payload->>'lifecycleEventId' = NEW.lifecycle_event_id::text
              AND runtime_event.payload->>'lifecycleRevision' = NEW.revision::text
              AND runtime_event.payload - ARRAY[
                'bookingId',
                'clientUserId',
                'productId',
                'startAt',
                'endAt',
                'lifecycleEventId',
                'lifecycleRevision'
              ]::text[] = '{}'::jsonb
              AND runtime_event.classification = 'personal'
              AND runtime_event.redaction_version = 1
              AND runtime_event.retention_policy_id = 'flows.booking-confirmed.v1'
              AND runtime_event.ingestion_outcome = NEW.outcome
              AND runtime_event.processed_at IS NOT NULL
         )
         OR (SELECT count(*)::integer
               FROM flow_runs run
              WHERE run.runtime_event_id = NEW.flow_runtime_event_id
                AND run.owner_user_id = NEW.owner_user_id)
            IS DISTINCT FROM NEW.affected_run_count
       )
     )
     OR (
       NEW.event_kind = 'rescheduled'
       AND (
         (SELECT count(*)::integer
            FROM flow_run_events event
           WHERE event.booking_lifecycle_event_id = NEW.lifecycle_event_id
             AND event.owner_user_id = NEW.owner_user_id
             AND event.event_type = 'booking_rescheduled')
           IS DISTINCT FROM NEW.affected_run_count
         OR (SELECT count(*)::integer
               FROM flow_work_items item
               JOIN flow_run_events event
                 ON event.id = item.last_run_event_id
                AND event.flow_run_id = item.flow_run_id
                AND event.owner_user_id = item.owner_user_id
              WHERE event.booking_lifecycle_event_id = NEW.lifecycle_event_id
                AND event.event_type = 'booking_rescheduled')
              IS DISTINCT FROM NEW.affected_work_item_count
         OR (SELECT count(*)::integer
               FROM flow_work_items item
               JOIN flow_runs run ON run.id = item.flow_run_id
               JOIN flow_runtime_events runtime_event ON runtime_event.id = run.runtime_event_id
              WHERE item.owner_user_id = NEW.owner_user_id
                AND item.status = 'completed'
                AND runtime_event.source = 'booking'
                AND runtime_event.subject_type = 'booking'
                AND runtime_event.subject_id = NEW.booking_id::text)
              IS DISTINCT FROM NEW.preserved_completed_work_item_count
       )
     )
     OR (
       NEW.event_kind = 'completed'
       AND (
         NEW.outcome <> 'completed'
         OR NEW.flow_runtime_event_id IS NOT NULL
         OR NEW.affected_run_count <> 0
         OR NEW.affected_work_item_count <> 0
         OR NEW.preserved_completed_work_item_count <> 0
       )
     )
     OR (
       NEW.event_kind = 'cancelled'
       AND (
         (SELECT count(*)::integer
            FROM flow_run_events event
           WHERE event.booking_lifecycle_event_id = NEW.lifecycle_event_id
             AND event.owner_user_id = NEW.owner_user_id
             AND event.event_type = 'run_canceled')
           IS DISTINCT FROM NEW.affected_run_count
         OR (SELECT count(*)::integer
               FROM flow_work_items item
               JOIN flow_run_events event
                 ON event.id = item.last_run_event_id
                AND event.flow_run_id = item.flow_run_id
                AND event.owner_user_id = item.owner_user_id
              WHERE event.booking_lifecycle_event_id = NEW.lifecycle_event_id
                AND event.event_type = 'run_canceled')
              IS DISTINCT FROM NEW.affected_work_item_count
         OR (SELECT count(*)::integer
               FROM flow_work_items item
               JOIN flow_runs run ON run.id = item.flow_run_id
               JOIN flow_runtime_events runtime_event ON runtime_event.id = run.runtime_event_id
              WHERE item.owner_user_id = NEW.owner_user_id
                AND item.status = 'completed'
                AND runtime_event.source = 'booking'
                AND runtime_event.subject_type = 'booking'
                AND runtime_event.subject_id = NEW.booking_id::text)
              IS DISTINCT FROM NEW.preserved_completed_work_item_count
       )
     )
     OR NOT EXISTS (
       SELECT 1
         FROM flow_booking_lifecycle_heads head
        WHERE head.booking_id = NEW.booking_id
          AND head.owner_user_id = NEW.owner_user_id
          AND head.applied_revision >= NEW.revision
     ) THEN
    RAISE EXCEPTION 'Flow Booking lifecycle receipt does not match its canonical event'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_booking_lifecycle_source_consistency';
  END IF;
  RETURN NULL;
END;
$flow_booking_lifecycle_source_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_booking_lifecycle_heads_source_consistency"
AFTER INSERT OR UPDATE ON flow_booking_lifecycle_heads
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_booking_lifecycle_source();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_booking_lifecycle_receipts_source_consistency"
AFTER INSERT ON flow_booking_lifecycle_receipts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_booking_lifecycle_source();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_work_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_work_item_guard$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'flow work items cannot be truncated'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM flow_runs
       WHERE id = OLD.flow_run_id
         AND owner_user_id = OLD.owner_user_id
    ) THEN
      RAISE EXCEPTION 'flow work items can only be deleted with their run'
        USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';
    END IF;
    RETURN OLD;
  END IF;

  IF ROW(
      OLD.id, OLD.owner_user_id, OLD.flow_run_id, OLD.flow_version_id,
      OLD.token_id, OLD.node_activation_sequence, OLD.node_id,
      OLD.completion_handle, OLD.task_kind, OLD.title, OLD.instructions,
      OLD.assignee_user_id, OLD.priority, OLD.due_policy_kind,
      OLD.due_lead_time_minutes, OLD.created_at
    ) IS DISTINCT FROM ROW(
      NEW.id, NEW.owner_user_id, NEW.flow_run_id, NEW.flow_version_id,
      NEW.token_id, NEW.node_activation_sequence, NEW.node_id,
      NEW.completion_handle, NEW.task_kind, NEW.title, NEW.instructions,
      NEW.assignee_user_id, NEW.priority, NEW.due_policy_kind,
      NEW.due_lead_time_minutes, NEW.created_at
    ) THEN
    RAISE EXCEPTION 'flow work-item identity and pinned configuration are immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';
  END IF;

  IF OLD.status IN ('completed', 'expired', 'canceled')
     OR NEW.revision <> OLD.revision + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'flow work item permits one provenance-backed lifecycle transition'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';
  END IF;

  IF NEW.last_command_id IS NOT NULL
     AND NEW.last_command_id IS DISTINCT FROM OLD.last_command_id
     AND NEW.last_run_event_id IS NULL
     AND NEW.due_at IS NOT DISTINCT FROM OLD.due_at
     AND NEW.due_booking_lifecycle_revision
           IS NOT DISTINCT FROM OLD.due_booking_lifecycle_revision
     AND (
       (OLD.status = 'pending' AND NEW.status IN ('in_progress', 'snoozed', 'expired', 'canceled'))
       OR (OLD.status = 'in_progress' AND NEW.status IN ('snoozed', 'completed', 'expired', 'canceled'))
       OR (OLD.status = 'snoozed' AND NEW.status IN ('snoozed', 'expired', 'canceled'))
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'snoozed'
     AND NEW.status = 'pending'
     AND NEW.last_command_id IS NULL
     AND NEW.last_run_event_id IS NOT NULL
     AND NEW.last_run_event_id IS DISTINCT FROM OLD.last_run_event_id
     AND NEW.due_at IS NOT DISTINCT FROM OLD.due_at
     AND NEW.due_booking_lifecycle_revision
           IS NOT DISTINCT FROM OLD.due_booking_lifecycle_revision
     AND (
       SELECT count(*) = 1
         FROM flow_run_events event
        WHERE event.id = NEW.last_run_event_id
          AND event.owner_user_id = NEW.owner_user_id
          AND event.flow_run_id = NEW.flow_run_id
          AND event.event_type = 'work_item_available'
          AND event.node_id = NEW.node_id
          AND event.attempt_id IS NULL
          AND event.command_id IS NULL
          AND event.occurred_at IS NOT DISTINCT FROM NEW.updated_at
          AND event.summary->>'schemaVersion' = 'flow-runtime-trace.v1'
          AND event.summary->>'outcome' = 'available'
          AND event.summary->>'nodeKind' = 'astrologer_work_item'
          AND event.summary->>'reasonCode' = 'FLOW_WORK_ITEM_SNOOZE_ELAPSED'
          AND event.summary->>'resultCode' = 'FLOW_WORK_ITEM_AVAILABLE'
          AND event.summary->>'workItemId' = NEW.id::text
          AND (event.summary->>'fromRevision')::integer = OLD.revision
          AND (event.summary->>'toRevision')::integer = NEW.revision
          AND (event.summary->>'scheduledFor')::timestamptz
                IS NOT DISTINCT FROM OLD.snoozed_until
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending', 'in_progress', 'snoozed')
     AND NEW.status = 'completed'
     AND NEW.completed_by_user_id IS NULL
     AND NEW.last_command_id IS NULL
     AND NEW.last_run_event_id IS NOT NULL
     AND NEW.last_run_event_id IS DISTINCT FROM OLD.last_run_event_id
     AND NEW.due_at IS NOT DISTINCT FROM OLD.due_at
     AND NEW.due_booking_lifecycle_revision
           IS NOT DISTINCT FROM OLD.due_booking_lifecycle_revision
     AND NEW.started_at IS NOT NULL
     AND NEW.completed_at IS NOT NULL
     AND NEW.completed_at IS NOT DISTINCT FROM NEW.updated_at
     AND (
       SELECT count(*) = 1
         FROM flow_run_events event
        WHERE event.id = NEW.last_run_event_id
          AND event.owner_user_id = NEW.owner_user_id
          AND event.flow_run_id = NEW.flow_run_id
          AND event.event_type = 'token_advanced'
          AND event.node_id = NEW.node_id
          AND event.attempt_id IS NULL
          AND event.command_id IS NULL
          AND event.occurred_at IS NOT DISTINCT FROM NEW.updated_at
          AND event.summary->>'schemaVersion' = 'flow-runtime-trace.v1'
          AND event.summary->>'outcome' = 'advanced'
          AND event.summary->>'nodeKind' = 'astrologer_work_item'
          AND event.summary->>'reasonCode' = 'FLOW_BIRTH_PROFILE_RECHECK_READY'
          AND event.summary->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
          AND event.summary->>'sourceHandle' = 'success'
          AND event.summary->>'workItemId' = NEW.id::text
          AND (event.summary->>'fromRevision')::integer = OLD.revision
          AND (event.summary->>'toRevision')::integer = NEW.revision
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending', 'in_progress', 'snoozed')
     AND NEW.status = 'canceled'
     AND NEW.last_command_id IS NULL
     AND NEW.last_run_event_id IS NOT NULL
     AND NEW.last_run_event_id IS DISTINCT FROM OLD.last_run_event_id
     AND NEW.due_at IS NOT DISTINCT FROM OLD.due_at
     AND NEW.due_booking_lifecycle_revision
           IS NOT DISTINCT FROM OLD.due_booking_lifecycle_revision
     AND (
       SELECT count(*) = 1
         FROM flow_run_events event
        WHERE event.id = NEW.last_run_event_id
          AND event.owner_user_id = NEW.owner_user_id
          AND event.flow_run_id = NEW.flow_run_id
          AND event.event_type = 'run_canceled'
          AND event.node_id = NEW.node_id
          AND event.command_id IS NULL
          AND event.booking_lifecycle_event_id IS NOT NULL
          AND event.occurred_at IS NOT DISTINCT FROM NEW.updated_at
          AND event.occurred_at IS NOT DISTINCT FROM NEW.canceled_at
          AND event.summary->>'schemaVersion' = 'flow-runtime-trace.v1'
          AND event.summary->>'outcome' = 'canceled'
          AND event.summary->>'nodeKind' = 'astrologer_work_item'
          AND event.summary->>'reasonCode' = 'FLOW_BOOKING_CANCELED'
          AND event.summary->>'resultCode' = 'FLOW_RUN_CANCELED'
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('pending', 'in_progress', 'snoozed')
     AND NEW.status IN ('pending', 'in_progress', 'snoozed')
     AND OLD.due_policy_kind = 'before_booking_start'
     AND OLD.due_booking_lifecycle_revision IS NOT NULL
     AND NEW.due_booking_lifecycle_revision = OLD.due_booking_lifecycle_revision + 1
     AND NEW.last_command_id IS NULL
     AND NEW.last_run_event_id IS NOT NULL
     AND NEW.last_run_event_id IS DISTINCT FROM OLD.last_run_event_id
     AND ROW(
       NEW.result_summary, NEW.started_at, NEW.completed_at,
       NEW.completed_by_user_id, NEW.expired_at, NEW.canceled_at
     ) IS NOT DISTINCT FROM ROW(
       OLD.result_summary, OLD.started_at, OLD.completed_at,
       OLD.completed_by_user_id, OLD.expired_at, OLD.canceled_at
     )
     AND (
       (
         NEW.status = OLD.status
         AND NEW.available_at IS NOT DISTINCT FROM OLD.available_at
         AND NEW.snoozed_until IS NOT DISTINCT FROM OLD.snoozed_until
       ) OR (
         OLD.status = 'snoozed'
         AND NEW.status = 'snoozed'
         AND NEW.snoozed_until IS NOT NULL
         AND NEW.snoozed_until = NEW.due_at
         AND NEW.available_at = NEW.snoozed_until
         AND NEW.snoozed_until < OLD.snoozed_until
       ) OR (
         OLD.status = 'snoozed'
         AND NEW.status = 'pending'
         AND NEW.snoozed_until IS NULL
         AND NEW.available_at = NEW.updated_at
         AND LEAST(OLD.snoozed_until, NEW.due_at) <= NEW.updated_at
       )
     )
     AND (
       SELECT count(*) = 1
         FROM flow_run_events event
        WHERE event.id = NEW.last_run_event_id
          AND event.owner_user_id = NEW.owner_user_id
          AND event.flow_run_id = NEW.flow_run_id
          AND event.event_type = 'booking_rescheduled'
          AND event.node_id = NEW.node_id
          AND event.attempt_id IS NULL
          AND event.command_id IS NULL
          AND event.booking_lifecycle_event_id IS NOT NULL
          AND event.occurred_at IS NOT DISTINCT FROM NEW.updated_at
          AND event.summary->>'schemaVersion' = 'flow-runtime-trace.v1'
          AND event.summary->>'outcome' = 'rescheduled'
          AND event.summary->>'nodeKind' = 'astrologer_work_item'
          AND event.summary->>'reasonCode' = 'FLOW_BOOKING_RESCHEDULED'
          AND event.summary->>'resultCode' = 'FLOW_BOOKING_SCHEDULE_UPDATED'
          AND event.summary->>'workItemId' = NEW.id::text
          AND (event.summary->>'bookingLifecycleRevision')::integer =
                NEW.due_booking_lifecycle_revision
          AND (event.summary->>'fromRevision')::integer = OLD.revision
          AND (event.summary->>'toRevision')::integer = NEW.revision
          AND event.summary->>'previousWorkItemStatus' = OLD.status
          AND event.summary->>'currentWorkItemStatus' = NEW.status
          AND (event.summary->>'previousDueAt')::timestamptz
                IS NOT DISTINCT FROM OLD.due_at
          AND (event.summary->>'currentDueAt')::timestamptz
                IS NOT DISTINCT FROM NEW.due_at
          AND (event.summary->>'previousSnoozedUntil')::timestamptz
                IS NOT DISTINCT FROM OLD.snoozed_until
          AND (event.summary->>'currentSnoozedUntil')::timestamptz
                IS NOT DISTINCT FROM NEW.snoozed_until
          AND event.summary->>'snoozeAdjustment' = CASE
            WHEN OLD.status = 'snoozed' AND NEW.status = 'pending' THEN 'woken'
            WHEN OLD.snoozed_until IS DISTINCT FROM NEW.snoozed_until THEN 'shortened'
            ELSE 'unchanged'
          END
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'flow work item permits one provenance-backed lifecycle transition'
    USING ERRCODE = '55000', CONSTRAINT = 'flow_work_items_transition_guard';

END;
$flow_work_item_guard$;
--> statement-breakpoint
CREATE TRIGGER "flow_work_items_transition_guard"
BEFORE UPDATE OR DELETE ON flow_work_items
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_work_item_mutation();
--> statement-breakpoint
CREATE TRIGGER "flow_work_items_truncate_guard"
BEFORE TRUNCATE ON flow_work_items
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_work_item_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_work_item_command()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_work_item_command_guard$
DECLARE
  checked_command_id uuid;
  checked_run_event_id uuid;
  command_row flow_runtime_commands%ROWTYPE;
  work_item_row flow_work_items%ROWTYPE;
  outcome_row flow_runtime_command_outcomes%ROWTYPE;
  event_row flow_run_events%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'flow_run_events' THEN
    IF TG_OP <> 'INSERT'
       OR NOT (
         NEW.event_type = 'work_item_available'
         OR NEW.event_type = 'booking_rescheduled'
         OR (NEW.event_type = 'run_canceled' AND NEW.booking_lifecycle_event_id IS NOT NULL)
         OR (
           NEW.event_type = 'token_advanced'
           AND NEW.command_id IS NULL
           AND NEW.summary->>'reasonCode' = 'FLOW_BIRTH_PROFILE_RECHECK_READY'
         )
       ) THEN
      RETURN NULL;
    END IF;
    checked_run_event_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'flow_work_items' THEN
    IF TG_OP <> 'DELETE' AND NEW.last_run_event_id IS NOT NULL THEN
      checked_run_event_id := NEW.last_run_event_id;
    ELSIF TG_OP = 'DELETE' THEN
      checked_command_id := OLD.last_command_id;
    ELSE
      checked_command_id := NEW.last_command_id;
    END IF;
    IF checked_command_id IS NULL THEN
      IF checked_run_event_id IS NULL THEN
        RETURN NULL;
      END IF;
    END IF;
  ELSE
    checked_command_id := COALESCE(NEW.id, OLD.id);
  END IF;

  IF checked_run_event_id IS NOT NULL THEN
    SELECT * INTO event_row
      FROM flow_run_events
     WHERE id = checked_run_event_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'work-item service transition requires its durable run event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    END IF;

    SELECT * INTO work_item_row
      FROM flow_work_items
     WHERE last_run_event_id = checked_run_event_id;
    IF NOT FOUND THEN
      IF event_row.event_type = 'booking_rescheduled'
         AND event_row.booking_lifecycle_event_id IS NOT NULL
         AND event_row.summary->'workItemId' = 'null'::jsonb
         AND NOT EXISTS (
           SELECT 1
             FROM flow_work_items item
            WHERE item.owner_user_id = event_row.owner_user_id
              AND item.flow_run_id = event_row.flow_run_id
              AND item.status IN ('pending', 'in_progress', 'snoozed')
              AND item.due_policy_kind = 'before_booking_start'
         ) THEN
        RETURN NULL;
      ELSIF event_row.event_type = 'run_canceled'
         AND event_row.booking_lifecycle_event_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM flow_work_items item
            WHERE item.owner_user_id = event_row.owner_user_id
              AND item.flow_run_id = event_row.flow_run_id
              AND item.status IN ('pending', 'in_progress', 'snoozed')
         ) THEN
        RETURN NULL;
      END IF;
      RAISE EXCEPTION 'work-item service transition requires matching item provenance'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    END IF;

    IF work_item_row.owner_user_id IS DISTINCT FROM event_row.owner_user_id
       OR work_item_row.flow_run_id IS DISTINCT FROM event_row.flow_run_id
       OR work_item_row.node_id IS DISTINCT FROM event_row.node_id
       OR work_item_row.last_command_id IS NOT NULL
       OR event_row.occurred_at IS DISTINCT FROM work_item_row.updated_at
       OR event_row.summary->>'schemaVersion' IS DISTINCT FROM 'flow-runtime-trace.v1' THEN
      RAISE EXCEPTION 'flow work item and service event provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    END IF;

    IF event_row.event_type = 'work_item_available' AND (
         work_item_row.status IS DISTINCT FROM 'pending'
         OR event_row.attempt_id IS NOT NULL
         OR event_row.command_id IS NOT NULL
         OR event_row.booking_lifecycle_event_id IS NOT NULL
         OR event_row.summary->>'outcome' IS DISTINCT FROM 'available'
         OR event_row.summary->>'nodeKind' IS DISTINCT FROM 'astrologer_work_item'
         OR event_row.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_WORK_ITEM_SNOOZE_ELAPSED'
         OR event_row.summary->>'resultCode' IS DISTINCT FROM 'FLOW_WORK_ITEM_AVAILABLE'
         OR event_row.summary->>'workItemId' IS DISTINCT FROM work_item_row.id::text
         OR (event_row.summary->>'fromRevision')::integer
              IS DISTINCT FROM work_item_row.revision - 1
         OR (event_row.summary->>'toRevision')::integer
              IS DISTINCT FROM work_item_row.revision
         OR (event_row.summary->>'scheduledFor')::timestamptz > event_row.occurred_at
       ) THEN
      RAISE EXCEPTION 'flow work item and service event provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    ELSIF event_row.event_type = 'run_canceled' AND (
         work_item_row.status IS DISTINCT FROM 'canceled'
         OR work_item_row.canceled_at IS DISTINCT FROM event_row.occurred_at
         OR event_row.command_id IS NOT NULL
         OR event_row.booking_lifecycle_event_id IS NULL
         OR event_row.summary->>'outcome' IS DISTINCT FROM 'canceled'
         OR event_row.summary->>'nodeKind' IS DISTINCT FROM 'astrologer_work_item'
         OR event_row.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BOOKING_CANCELED'
         OR event_row.summary->>'resultCode' IS DISTINCT FROM 'FLOW_RUN_CANCELED'
       ) THEN
      RAISE EXCEPTION 'flow work item and service event provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    ELSIF event_row.event_type = 'booking_rescheduled' AND (
         work_item_row.status NOT IN ('pending', 'in_progress', 'snoozed')
         OR work_item_row.due_policy_kind IS DISTINCT FROM 'before_booking_start'
         OR work_item_row.due_booking_lifecycle_revision IS NULL
         OR event_row.attempt_id IS NOT NULL
         OR event_row.command_id IS NOT NULL
         OR event_row.booking_lifecycle_event_id IS NULL
         OR event_row.summary->>'outcome' IS DISTINCT FROM 'rescheduled'
         OR event_row.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BOOKING_RESCHEDULED'
         OR event_row.summary->>'resultCode' IS DISTINCT FROM 'FLOW_BOOKING_SCHEDULE_UPDATED'
         OR event_row.summary->>'workItemId' IS DISTINCT FROM work_item_row.id::text
         OR (event_row.summary->>'bookingLifecycleRevision')::integer
              IS DISTINCT FROM work_item_row.due_booking_lifecycle_revision
         OR (event_row.summary->>'fromRevision')::integer
              IS DISTINCT FROM work_item_row.revision - 1
         OR (event_row.summary->>'toRevision')::integer
              IS DISTINCT FROM work_item_row.revision
         OR event_row.summary->>'currentWorkItemStatus'
              IS DISTINCT FROM work_item_row.status
         OR (event_row.summary->>'currentDueAt')::timestamptz
              IS DISTINCT FROM work_item_row.due_at
         OR (event_row.summary->>'currentSnoozedUntil')::timestamptz
              IS DISTINCT FROM work_item_row.snoozed_until
       ) THEN
      RAISE EXCEPTION 'flow work item and Booking reschedule provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    ELSIF event_row.event_type = 'token_advanced' AND (
         work_item_row.status IS DISTINCT FROM 'completed'
         OR work_item_row.completed_by_user_id IS NOT NULL
         OR work_item_row.completed_at IS DISTINCT FROM event_row.occurred_at
         OR event_row.attempt_id IS NOT NULL
         OR event_row.command_id IS NOT NULL
         OR event_row.summary->>'outcome' IS DISTINCT FROM 'advanced'
         OR event_row.summary->>'nodeKind' IS DISTINCT FROM 'astrologer_work_item'
         OR event_row.summary->>'reasonCode' IS DISTINCT FROM 'FLOW_BIRTH_PROFILE_RECHECK_READY'
         OR event_row.summary->>'resultCode' IS DISTINCT FROM 'FLOW_TOKEN_ADVANCED'
         OR event_row.summary->>'sourceHandle' IS DISTINCT FROM 'success'
         OR event_row.summary->>'workItemId' IS DISTINCT FROM work_item_row.id::text
         OR (event_row.summary->>'fromRevision')::integer
              IS DISTINCT FROM work_item_row.revision - 1
         OR (event_row.summary->>'toRevision')::integer
              IS DISTINCT FROM work_item_row.revision
       ) THEN
      RAISE EXCEPTION 'flow work item and birth-profile recheck provenance do not agree'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    ELSIF event_row.event_type NOT IN (
      'work_item_available', 'run_canceled', 'booking_rescheduled', 'token_advanced'
    ) THEN
      RAISE EXCEPTION 'work-item service transition requires a supported durable run event'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_event_consistency';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO command_row
    FROM flow_runtime_commands
   WHERE id = checked_command_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF command_row.command_scope NOT IN (
    'flows.runtime.cancel.v1',
    'flows.work-items.start.v1',
    'flows.work-items.snooze.v1',
    'flows.work-items.complete.v1'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO work_item_row
    FROM flow_work_items
   WHERE last_command_id = checked_command_id;

  IF command_row.state = 'failed' THEN
    IF FOUND THEN
      RAISE EXCEPTION 'failed flow command cannot own a work-item transition'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_command_consistency';
    END IF;
    RETURN NULL;
  END IF;

  IF command_row.state <> 'succeeded' OR NOT FOUND THEN
    IF command_row.command_scope LIKE 'flows.work-items.%' OR FOUND THEN
      RAISE EXCEPTION 'successful work-item transition requires a succeeded command'
        USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_command_consistency';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO outcome_row
    FROM flow_runtime_command_outcomes
   WHERE command_id = checked_command_id;
  IF NOT FOUND
     OR outcome_row.response_status IS DISTINCT FROM 200
     OR command_row.api_surface IS DISTINCT FROM 'astrologer-api'
     OR command_row.owner_user_id IS DISTINCT FROM work_item_row.owner_user_id
     OR command_row.flow_run_id IS DISTINCT FROM work_item_row.flow_run_id
     OR (
       command_row.command_scope <> 'flows.runtime.cancel.v1'
       AND (
         outcome_row.response_body->'workItem'->>'id' IS DISTINCT FROM work_item_row.id::text
         OR outcome_row.response_body->'workItem'->>'flowRunId' IS DISTINCT FROM work_item_row.flow_run_id::text
         OR outcome_row.response_body->'workItem'->>'status' IS DISTINCT FROM work_item_row.status
         OR outcome_row.response_body->'workItem'->>'revision' IS DISTINCT FROM work_item_row.revision::text
       )
     )
     OR (
       command_row.command_scope = 'flows.runtime.cancel.v1'
       AND (
         command_row.route_template IS DISTINCT FROM '/flow-runs/:runId/cancel'
         OR command_row.resource_id IS DISTINCT FROM work_item_row.flow_run_id
         OR work_item_row.status IS DISTINCT FROM 'canceled'
         OR outcome_row.response_body->'run'->>'id' IS DISTINCT FROM work_item_row.flow_run_id::text
         OR outcome_row.response_body->'run'->>'status' IS DISTINCT FROM 'canceled'
       )
     )
     OR (
       command_row.command_scope = 'flows.work-items.start.v1'
       AND (
         command_row.route_template IS DISTINCT FROM '/flow-work-items/:workItemId/start'
         OR command_row.resource_id IS DISTINCT FROM work_item_row.id
         OR work_item_row.status IS DISTINCT FROM 'in_progress'
       )
     )
     OR (
       command_row.command_scope = 'flows.work-items.snooze.v1'
       AND (
         command_row.route_template IS DISTINCT FROM '/flow-work-items/:workItemId/snooze'
         OR command_row.resource_id IS DISTINCT FROM work_item_row.id
         OR work_item_row.status IS DISTINCT FROM 'snoozed'
       )
     )
     OR (
       command_row.command_scope = 'flows.work-items.complete.v1'
       AND (
         command_row.route_template IS DISTINCT FROM '/flow-work-items/:workItemId/complete'
         OR command_row.resource_id IS DISTINCT FROM work_item_row.id
         OR work_item_row.status IS DISTINCT FROM 'completed'
         OR work_item_row.completed_by_user_id IS DISTINCT FROM command_row.actor_user_id
       )
     ) THEN
    RAISE EXCEPTION 'flow work item and command provenance do not agree'
      USING ERRCODE = '23514', CONSTRAINT = 'flow_work_items_command_consistency';
  END IF;

  RETURN NULL;
END;
$flow_work_item_command_guard$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_work_items_command_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_work_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_work_item_command();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_runtime_commands_work_item_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_runtime_commands
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_work_item_command();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "flow_run_events_work_item_consistency"
AFTER INSERT ON flow_run_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_work_item_command();
--> statement-breakpoint
create or replace function flow_prepare_enrollment_command()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  new.state := 'processing';
  new.completed_at := null;
  new.created_at := transaction_timestamp();
  new.updated_at := new.created_at;
  new.replay_until := new.created_at + interval '24 hours';
  return new;
end;
$$;

create trigger flow_enrollment_commands_prepare
before insert on flow_enrollment_commands
for each row execute function flow_prepare_enrollment_command();


create or replace function flow_guard_enrollment_command_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.state <> 'processing'
     or new.id <> old.id
     or new.api_surface <> old.api_surface
     or new.actor_subject_id <> old.actor_subject_id
     or new.owner_subject_id <> old.owner_subject_id
     or new.route_template <> old.route_template
     or new.resource_id <> old.resource_id
     or new.command_scope <> old.command_scope
     or new.idempotency_key <> old.idempotency_key
     or new.request_hash <> old.request_hash
     or new.request_schema_version <> old.request_schema_version
     or new.target_version_id is distinct from old.target_version_id
     or new.expected_definition_revision is distinct from old.expected_definition_revision
     or new.expected_enrollment_revision <> old.expected_enrollment_revision
     or new.expected_active_version_id is distinct from old.expected_active_version_id
     or new.expected_activation_epoch_id is distinct from old.expected_activation_epoch_id
     or new.replay_until <> old.replay_until
     or new.created_at <> old.created_at
     or new.state not in ('succeeded', 'failed')
     or new.completed_at is not null
     or new.updated_at <> old.updated_at then
    raise exception 'flow enrollment command transition is invalid' using errcode = '55000';
  end if;
  new.completed_at := clock_timestamp();
  new.updated_at := new.completed_at;
  return new;
end;
$$;


create trigger flow_enrollment_commands_transition_guard
before update on flow_enrollment_commands
for each row execute function flow_guard_enrollment_command_transition();

create or replace function flow_reject_enrollment_command_removal()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'flow enrollment command tombstones cannot be removed' using errcode = '55000';
end;
$$;

create trigger flow_enrollment_commands_reject_delete
before delete on flow_enrollment_commands
for each row execute function flow_reject_enrollment_command_removal();

create trigger flow_enrollment_commands_reject_truncate
before truncate on flow_enrollment_commands
for each statement execute function flow_reject_enrollment_command_removal();

create or replace function flow_guard_enrollment_outcome_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  retention_deadline timestamptz;
begin
  if tg_op = 'DELETE' then
    select replay_until into retention_deadline
      from flow_enrollment_commands where id = old.command_id;
    if retention_deadline <= clock_timestamp() then
      return old;
    end if;
  end if;
  raise exception 'flow enrollment outcomes are immutable' using errcode = '55000';
end;
$$;

create trigger flow_enrollment_command_outcomes_guard
before update or delete on flow_enrollment_command_outcomes
for each row execute function flow_guard_enrollment_outcome_mutation();

create trigger flow_enrollment_command_outcomes_reject_truncate
before truncate on flow_enrollment_command_outcomes
for each statement execute function flow_guard_enrollment_outcome_mutation();

create or replace function flow_assert_enrollment_command_outcome()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  checked_command_id uuid;
  command_row flow_enrollment_commands%rowtype;
  outcome_row flow_enrollment_command_outcomes%rowtype;
  has_outcome boolean;
begin
  if tg_table_name = 'flow_enrollment_commands' then
    checked_command_id := coalesce(new.id, old.id);
  else
    checked_command_id := coalesce(new.command_id, old.command_id);
  end if;
  select * into command_row from flow_enrollment_commands where id = checked_command_id;
  if not found then
    return null;
  end if;
  select * into outcome_row
    from flow_enrollment_command_outcomes where command_id = checked_command_id;
  has_outcome := found;

  if command_row.state = 'processing' then
    raise exception 'flow enrollment command state and outcome are inconsistent'
      using errcode = '23514';
  end if;
  if not has_outcome then
    if clock_timestamp() < command_row.replay_until then
      raise exception 'flow enrollment command state and outcome are inconsistent'
        using errcode = '23514';
    end if;
    return null;
  end if;
  if outcome_row.created_at is distinct from command_row.completed_at
     or (command_row.state = 'succeeded' and outcome_row.response_status <> 200)
     or (command_row.state = 'failed' and outcome_row.response_status not in (400, 404, 409)) then
    raise exception 'flow enrollment command state and outcome are inconsistent'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger flow_enrollment_commands_outcome_consistency
after insert or update on flow_enrollment_commands
deferrable initially deferred
for each row execute function flow_assert_enrollment_command_outcome();

create constraint trigger flow_enrollment_outcomes_command_consistency
after insert or delete on flow_enrollment_command_outcomes
deferrable initially deferred
for each row execute function flow_assert_enrollment_command_outcome();

create or replace function flow_guard_activation_epoch_close()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.effective_to is not null
     or new.id <> old.id
     or new.flow_id <> old.flow_id
     or new.owner_subject_id <> old.owner_subject_id
     or new.flow_version_id <> old.flow_version_id
     or new.sequence <> old.sequence
     or new.effective_from <> old.effective_from
     or new.manifest_digest <> old.manifest_digest
     or new.rollout_policy_revision <> old.rollout_policy_revision
     or new.activated_by_actor_subject_id <> old.activated_by_actor_subject_id
     or new.activate_command_id <> old.activate_command_id
     or new.created_at <> old.created_at
     or new.effective_to is null
     or new.close_reason is null
     or new.closed_by_actor_subject_id is null
     or new.close_command_id is null then
    raise exception 'flow activation epoch may only close once' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger flow_activation_epochs_close_guard
before update on flow_activation_epochs
for each row execute function flow_guard_activation_epoch_close();

create or replace function flow_reject_activation_epoch_removal()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'flow activation epochs cannot be removed' using errcode = '55000';
end;
$$;

create trigger flow_activation_epochs_reject_delete
before delete on flow_activation_epochs
for each row execute function flow_reject_activation_epoch_removal();

create trigger flow_activation_epochs_reject_truncate
before truncate on flow_activation_epochs
for each statement execute function flow_reject_activation_epoch_removal();

create or replace function flow_assert_activation_epoch_command_provenance()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  activation_command flow_enrollment_commands%rowtype;
  close_command flow_enrollment_commands%rowtype;
begin
  select * into activation_command
    from flow_enrollment_commands where id = new.activate_command_id;
  if not found
     or activation_command.state <> 'succeeded'
     or activation_command.command_scope <> 'flows.enrollment.activate.v1'
     or activation_command.resource_id <> new.flow_id
     or activation_command.owner_subject_id <> new.owner_subject_id
     or activation_command.actor_subject_id <> new.activated_by_actor_subject_id
     or activation_command.target_version_id is distinct from new.flow_version_id then
    raise exception 'flow activation epoch command provenance is inconsistent'
      using errcode = '23514';
  end if;

  if new.effective_to is null then
    return null;
  end if;
  select * into close_command
    from flow_enrollment_commands where id = new.close_command_id;
  if not found
     or close_command.state <> 'succeeded'
     or close_command.resource_id <> new.flow_id
     or close_command.owner_subject_id <> new.owner_subject_id
     or close_command.actor_subject_id <> new.closed_by_actor_subject_id
     or close_command.expected_active_version_id is distinct from new.flow_version_id then
    raise exception 'flow activation epoch command provenance is inconsistent'
      using errcode = '23514';
  end if;
  if new.close_reason = 'pause_enrollment' and (
       close_command.command_scope <> 'flows.enrollment.pause.v1'
       or close_command.expected_activation_epoch_id <> new.id
       or close_command.target_version_id is not null
     ) then
    raise exception 'flow activation epoch command provenance is inconsistent'
      using errcode = '23514';
  end if;
  if new.close_reason = 'version_switch' and (
       close_command.command_scope <> 'flows.enrollment.activate.v1'
       or close_command.target_version_id is null
       or close_command.target_version_id = new.flow_version_id
       or not exists (
         select 1 from flow_activation_epochs replacement
          where replacement.activate_command_id = close_command.id
            and replacement.flow_id = new.flow_id
            and replacement.owner_subject_id = new.owner_subject_id
            and replacement.flow_version_id = close_command.target_version_id
            and replacement.effective_from = new.effective_to
       )
     ) then
    raise exception 'flow activation epoch command provenance is inconsistent'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger flow_activation_epochs_command_provenance
after insert or update on flow_activation_epochs
deferrable initially deferred
for each row execute function flow_assert_activation_epoch_command_provenance();

create or replace function flow_guard_enrollment_control_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  transition_command flow_enrollment_commands%rowtype;
  current_definition_revision integer;
begin
  if new.flow_id <> old.flow_id
     or new.owner_user_id <> old.owner_user_id
     or new.owner_subject_id <> old.owner_subject_id
     or new.created_at <> old.created_at
     or new.enrollment_revision <> old.enrollment_revision + 1
     or new.last_command_id is null
     or new.last_command_id is not distinct from old.last_command_id then
    raise exception 'flow enrollment revision must advance exactly once' using errcode = '55000';
  end if;

  select * into transition_command
    from flow_enrollment_commands where id = new.last_command_id;
  select revision into current_definition_revision
    from flows where id = old.flow_id and owner_user_id = old.owner_user_id;
  if not found
     or transition_command.id is null
     or transition_command.state <> 'processing'
     or transition_command.resource_id <> old.flow_id
     or transition_command.owner_subject_id <> old.owner_subject_id
     or transition_command.expected_enrollment_revision <> old.enrollment_revision then
    raise exception 'flow enrollment command causal CAS is inconsistent'
      using errcode = '23514';
  end if;

  if new.state = 'active' then
    if transition_command.command_scope <> 'flows.enrollment.activate.v1'
       or transition_command.expected_definition_revision is distinct from current_definition_revision
       or transition_command.target_version_id is distinct from new.active_version_id
       or transition_command.expected_active_version_id is distinct from old.active_version_id
       or transition_command.expected_activation_epoch_id is not null then
      raise exception 'flow enrollment command causal CAS is inconsistent'
        using errcode = '23514';
    end if;
  elsif new.state = 'paused' then
    if old.state <> 'active'
       or transition_command.command_scope <> 'flows.enrollment.pause.v1'
       or transition_command.target_version_id is not null
       or transition_command.expected_definition_revision is not null
       or transition_command.expected_active_version_id is distinct from old.active_version_id
       or transition_command.expected_activation_epoch_id is distinct from old.active_activation_epoch_id then
      raise exception 'flow enrollment command causal CAS is inconsistent'
        using errcode = '23514';
    end if;
  else
    raise exception 'flow enrollment command causal CAS is inconsistent'
      using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger flow_enrollment_controls_transition_guard
before update on flow_enrollment_controls
for each row execute function flow_guard_enrollment_control_transition();

create or replace function flow_assert_enrollment_control_provenance()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  checked_flow_id uuid;
  control_row flow_enrollment_controls%rowtype;
  epoch_row flow_activation_epochs%rowtype;
begin
  checked_flow_id := coalesce(new.flow_id, old.flow_id);
  select * into control_row from flow_enrollment_controls where flow_id = checked_flow_id;
  if not found then
    if exists (
      select 1 from flow_activation_epochs
       where flow_id = checked_flow_id and effective_to is null
    ) then
      raise exception 'flow enrollment control provenance is inconsistent'
        using errcode = '23514';
    end if;
    return null;
  end if;

  if not exists (
    select 1 from flow_runtime_owner_subjects subject
     where subject.owner_subject_id = control_row.owner_subject_id
       and subject.owner_user_id = control_row.owner_user_id
       and subject.state = 'active'
  ) then
    raise exception 'flow enrollment owner subject binding is inconsistent'
      using errcode = '23514';
  end if;

  if control_row.state = 'active' then
    select * into epoch_row
      from flow_activation_epochs where id = control_row.active_activation_epoch_id;
    if not found
       or epoch_row.flow_id <> control_row.flow_id
       or epoch_row.owner_subject_id <> control_row.owner_subject_id
       or epoch_row.flow_version_id <> control_row.active_version_id
       or epoch_row.effective_from <> control_row.active_since
       or epoch_row.effective_to is not null
       or epoch_row.activate_command_id <> control_row.last_command_id then
      raise exception 'flow enrollment control provenance is inconsistent'
        using errcode = '23514';
    end if;
  elsif exists (
    select 1 from flow_activation_epochs
     where flow_id = control_row.flow_id and effective_to is null
  ) then
    raise exception 'flow enrollment control provenance is inconsistent'
      using errcode = '23514';
  end if;

  if control_row.state = 'paused' then
    select * into epoch_row
      from flow_activation_epochs where close_command_id = control_row.last_command_id;
    if not found
       or epoch_row.flow_id <> control_row.flow_id
       or epoch_row.owner_subject_id <> control_row.owner_subject_id
       or epoch_row.close_reason <> 'pause_enrollment'
       or epoch_row.effective_to <> control_row.last_paused_at then
      raise exception 'flow enrollment control provenance is inconsistent'
        using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger flow_enrollment_controls_provenance
after insert or update or delete on flow_enrollment_controls
deferrable initially deferred
for each row execute function flow_assert_enrollment_control_provenance();

create constraint trigger flow_activation_epochs_control_provenance
after insert or update on flow_activation_epochs
deferrable initially deferred
for each row execute function flow_assert_enrollment_control_provenance();

create or replace function flow_guard_automation_quota_transition()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.owner_subject_id <> old.owner_subject_id
     or new.created_at <> old.created_at
     or new.revision <> old.revision + 1
     or abs(new.active_allocations - old.active_allocations) <> 1 then
    raise exception 'flow automation quota transition is invalid' using errcode = '55000';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger flow_automation_quota_authorities_transition_guard
before update on flow_automation_quota_authorities
for each row execute function flow_guard_automation_quota_transition();

create or replace function flow_reject_enrollment_authority_removal()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'flow enrollment authority cannot be truncated' using errcode = '55000';
  end if;
  if tg_table_name = 'flow_enrollment_controls' then
    raise exception 'flow enrollment control cannot be removed' using errcode = '55000';
  end if;
  raise exception 'flow automation quota authority cannot be removed' using errcode = '55000';
end;
$$;

create trigger flow_automation_quota_authorities_reject_delete
before delete on flow_automation_quota_authorities
for each row execute function flow_reject_enrollment_authority_removal();

create trigger flow_automation_quota_authorities_reject_truncate
before truncate on flow_automation_quota_authorities
for each statement execute function flow_reject_enrollment_authority_removal();

create trigger flow_enrollment_controls_reject_truncate
before truncate on flow_enrollment_controls
for each statement execute function flow_reject_enrollment_authority_removal();

create trigger flow_enrollment_controls_reject_delete
before delete on flow_enrollment_controls
for each row execute function flow_reject_enrollment_authority_removal();

create or replace function flow_assert_automation_quota_consistency()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  subject_id uuid;
  expected_count integer;
  recorded_count integer;
begin
  if tg_op = 'DELETE' then
    subject_id := old.owner_subject_id;
  else
    subject_id := new.owner_subject_id;
  end if;
  select count(*)::integer into expected_count
    from flow_enrollment_controls
   where owner_subject_id = subject_id and state = 'active';
  select active_allocations into recorded_count
    from flow_automation_quota_authorities
   where owner_subject_id = subject_id;
  if recorded_count is null or recorded_count <> expected_count then
    raise exception 'flow automation quota counter is inconsistent' using errcode = '55000';
  end if;
  return null;
end;
$$;

create constraint trigger flow_enrollment_controls_quota_consistency
after insert or update or delete on flow_enrollment_controls
deferrable initially deferred
for each row execute function flow_assert_automation_quota_consistency();

create constraint trigger flow_automation_quota_authorities_consistency
after insert or update on flow_automation_quota_authorities
deferrable initially deferred
for each row execute function flow_assert_automation_quota_consistency();
--> statement-breakpoint
ALTER TABLE flow_execution_attempts
  DROP CONSTRAINT flow_execution_attempts_trace_summary_schema_check,
  ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
    "flow_execution_attempts"."trace_summary" ?& array[
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
        and "flow_execution_attempts"."trace_summary"->>'nodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
            and "flow_execution_attempts"."trace_summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
        )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE flow_execution_attempts
  VALIDATE CONSTRAINT flow_execution_attempts_trace_summary_schema_check;
--> statement-breakpoint
ALTER TABLE flow_run_events
  DROP CONSTRAINT flow_run_events_type_check,
  DROP CONSTRAINT flow_run_events_summary_schema_check,
  ADD CONSTRAINT flow_run_events_type_check CHECK (
    "flow_run_events"."event_type" in ('run_enrolled', 'token_advanced', 'token_waiting', 'token_signaled', 'work_item_available', 'booking_rescheduled', 'token_retry_scheduled', 'token_lease_expired', 'run_completed', 'run_failed', 'run_suppressed', 'run_canceled')
  ) NOT VALID,
  ADD CONSTRAINT flow_run_events_summary_schema_check CHECK (
    (
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
        and "flow_run_events"."summary"->>'eventKind' = 'booking_confirmed'
        and "flow_run_events"."summary"->>'triggerNodeId' = "flow_run_events"."node_id"
        and length("flow_run_events"."summary"->>'triggerNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'triggerNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and length("flow_run_events"."summary"->>'targetNodeId') between 1 and 160
        and "flow_run_events"."summary"->>'targetNodeId' ~ '^[a-z0-9][a-z0-9_-]*$'
        and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
              'token_advanced', 'token_signaled', 'work_item_available', 'booking_rescheduled'
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
        and "flow_run_events"."summary"->>'nodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
        and length("flow_run_events"."summary"->>'resultCode') between 1 and 160
        and "flow_run_events"."summary"->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
        and (
          (
            "flow_run_events"."event_type" = 'token_advanced'
            and "flow_run_events"."node_id" is not null
            and "flow_run_events"."summary"->>'outcome' = 'advanced'
            and "flow_run_events"."summary"->>'resultCode' = 'FLOW_TOKEN_ADVANCED'
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
            and "flow_run_events"."summary"->>'targetNodeKind' in ('birth_data_available', 'natal_chart_request', 'astrologer_work_item', 'astrologer_approval', 'completed', 'suppressed', 'failed')
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
      )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE flow_run_events
  VALIDATE CONSTRAINT flow_run_events_type_check;
--> statement-breakpoint
ALTER TABLE flow_run_events
  VALIDATE CONSTRAINT flow_run_events_summary_schema_check;
-- ElevenHouse Flows integrity objects: end
