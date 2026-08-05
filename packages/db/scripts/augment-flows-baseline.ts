import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

import { flowEnrollmentControlIntegritySql } from "../src/schema/flows/flow-enrollment-control.schema";
import { flowBookingLifecycleIntegritySql } from "../src/schema/flows/flow-booking-lifecycle.schema";
import { flowWorkItemIntegritySql } from "../src/schema/flows/flow-work-items.schema";
import {
  flowExecutionAttempts,
  flowRunIntegritySql,
  flowRunEvents,
  flowRuntimeEventIntegritySql
} from "../src/schema/flows/flow-runtime.schema";

const statementBreakpoint = "--> statement-breakpoint";
const markerStart = "-- ElevenHouse Flows integrity objects: begin";
const markerEnd = "-- ElevenHouse Flows integrity objects: end";

export const flowEnrollmentTraceConstraintIntegritySql = createFlowEnrollmentTraceConstraintIntegritySql();

const managedBlockAnchorSignatures = [
  'CREATE TRIGGER "flow_versions_immutable_update"',
  'CREATE TRIGGER "flow_versions_delete_with_aggregate_only"',
  'CREATE CONSTRAINT TRIGGER "flow_publication_pointer_consistency"',
  'CREATE CONSTRAINT TRIGGER "flow_version_pointer_consistency"',
  'CREATE TRIGGER "flow_definition_commands_immutable_identity"',
  'CREATE TRIGGER "flow_definition_command_outcomes_retention"',
  'CREATE CONSTRAINT TRIGGER "flow_definition_command_outcome_consistency"',
  'CREATE CONSTRAINT TRIGGER "flow_definition_outcome_command_consistency"',
  'CREATE TRIGGER "flow_runtime_commands_immutable_identity"',
  'CREATE TRIGGER "flow_runtime_command_outcomes_retention"',
  'CREATE CONSTRAINT TRIGGER "flow_runtime_command_outcome_consistency"',
  'CREATE CONSTRAINT TRIGGER "flow_runtime_outcome_command_consistency"',
  'CREATE CONSTRAINT TRIGGER "flow_run_event_command_consistency"',
  'CREATE TRIGGER "flow_execution_attempts_immutable"',
  'CREATE TRIGGER "flow_execution_attempts_truncate_guard"',
  'CREATE TRIGGER "flow_run_events_immutable"',
  'CREATE TRIGGER "flow_run_events_truncate_guard"',
  "create trigger flow_enrollment_commands_prepare",
  "create constraint trigger flow_enrollment_commands_outcome_consistency",
  "create constraint trigger flow_activation_epochs_command_provenance",
  "create constraint trigger flow_enrollment_controls_provenance",
  "create trigger flow_automation_quota_authorities_transition_guard",
  "create constraint trigger flow_automation_quota_authorities_consistency"
] as const;

const ownedObjectSignatures = [
  ...managedBlockAnchorSignatures,
  'CREATE TRIGGER "flow_runs_enrollment_immutable"',
  'CREATE TRIGGER "flow_runtime_events_immutable"',
  'CREATE TRIGGER "flow_runtime_events_truncate_guard"',
  'CREATE CONSTRAINT TRIGGER "flow_runtime_command_event_consistency"',
  'CREATE TRIGGER "flow_work_items_transition_guard"',
  'CREATE TRIGGER "flow_work_items_truncate_guard"',
  'CREATE CONSTRAINT TRIGGER "flow_work_items_command_consistency"',
  'CREATE CONSTRAINT TRIGGER "flow_runtime_commands_work_item_consistency"'
] as const;

export const flowDefinitionIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_version_mutation()
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
${statementBreakpoint}
CREATE TRIGGER "flow_versions_immutable_update"
BEFORE UPDATE ON flow_versions
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_version_mutation();
${statementBreakpoint}
CREATE TRIGGER "flow_versions_delete_with_aggregate_only"
BEFORE DELETE ON flow_versions
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_version_mutation();
${statementBreakpoint}
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
${statementBreakpoint}
CREATE CONSTRAINT TRIGGER "flow_publication_pointer_consistency"
AFTER INSERT OR UPDATE ON flows
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_publication_pointer();
${statementBreakpoint}
CREATE CONSTRAINT TRIGGER "flow_version_pointer_consistency"
AFTER INSERT OR DELETE ON flow_versions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_publication_pointer();
${statementBreakpoint}
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
${statementBreakpoint}
CREATE TRIGGER "flow_definition_commands_immutable_identity"
BEFORE UPDATE OR DELETE ON flow_definition_commands
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_definition_command_mutation();
${statementBreakpoint}
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
${statementBreakpoint}
CREATE TRIGGER "flow_definition_command_outcomes_retention"
BEFORE UPDATE OR DELETE ON flow_definition_command_outcomes
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_definition_outcome_mutation();
${statementBreakpoint}
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
${statementBreakpoint}
CREATE CONSTRAINT TRIGGER "flow_definition_command_outcome_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_definition_commands
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_definition_command_outcome();
${statementBreakpoint}
CREATE CONSTRAINT TRIGGER "flow_definition_outcome_command_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_definition_command_outcomes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_definition_command_outcome();
${statementBreakpoint}
`;

const flowRuntimeCommandCoreIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_runtime_command_mutation()
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
${statementBreakpoint}
CREATE TRIGGER "flow_runtime_commands_immutable_identity"
BEFORE UPDATE OR DELETE ON flow_runtime_commands
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_runtime_command_mutation();
${statementBreakpoint}
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
${statementBreakpoint}
CREATE TRIGGER "flow_runtime_command_outcomes_retention"
BEFORE UPDATE OR DELETE ON flow_runtime_command_outcomes
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_runtime_outcome_mutation();
${statementBreakpoint}
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
${statementBreakpoint}
CREATE CONSTRAINT TRIGGER "flow_runtime_command_outcome_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_runtime_commands
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_runtime_command_outcome();
${statementBreakpoint}
CREATE CONSTRAINT TRIGGER "flow_runtime_outcome_command_consistency"
AFTER INSERT OR UPDATE OR DELETE ON flow_runtime_command_outcomes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_runtime_command_outcome();`;

export const flowRuntimeCommandEventIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_runtime_command_event()
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
${statementBreakpoint}
CREATE CONSTRAINT TRIGGER "flow_runtime_command_event_consistency"
AFTER INSERT OR UPDATE ON flow_runtime_commands
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  NEW.state = 'succeeded'
  AND NEW.command_scope IN ('flows.runtime.cancel.v1', 'flows.work-items.complete.v1')
)
EXECUTE FUNCTION elevenhouse_assert_flow_runtime_command_event();`;

export const flowRuntimeCommandIntegritySql = `${flowRuntimeCommandCoreIntegritySql}
${statementBreakpoint}
${flowRuntimeCommandEventIntegritySql}`;

export const flowRunEventCommandIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_run_event_command()
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
${statementBreakpoint}
CREATE CONSTRAINT TRIGGER "flow_run_event_command_consistency"
AFTER INSERT OR UPDATE ON flow_run_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_assert_flow_run_event_command();`;

export const flowExecutionHistoryIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_execution_history_mutation()
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
${statementBreakpoint}
CREATE TRIGGER "flow_execution_attempts_immutable"
BEFORE UPDATE OR DELETE ON flow_execution_attempts
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_execution_history_mutation();
${statementBreakpoint}
CREATE TRIGGER "flow_execution_attempts_truncate_guard"
BEFORE TRUNCATE ON flow_execution_attempts
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_execution_history_mutation();
${statementBreakpoint}
CREATE TRIGGER "flow_run_events_immutable"
BEFORE UPDATE OR DELETE ON flow_run_events
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_execution_history_mutation();
${statementBreakpoint}
CREATE TRIGGER "flow_run_events_truncate_guard"
BEFORE TRUNCATE ON flow_run_events
FOR EACH STATEMENT
EXECUTE FUNCTION elevenhouse_guard_flow_execution_history_mutation();`;

export const flowsIntegritySql = `${flowDefinitionIntegritySql}
${statementBreakpoint}
${flowRunIntegritySql.trim()}
${statementBreakpoint}
${flowRuntimeEventIntegritySql.trim()}
${statementBreakpoint}
${flowRuntimeCommandIntegritySql}
${statementBreakpoint}
${flowRunEventCommandIntegritySql}
${statementBreakpoint}
${flowExecutionHistoryIntegritySql}
${statementBreakpoint}
${flowBookingLifecycleIntegritySql.trim()}
${statementBreakpoint}
${flowWorkItemIntegritySql.trim()}
${statementBreakpoint}
${flowEnrollmentControlIntegritySql.trim()}
${statementBreakpoint}
${flowEnrollmentTraceConstraintIntegritySql}`;

export async function augmentFlowsBaseline(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  assertCanonicalShape(source);

  const markerCount = countOccurrences(source, markerStart);
  const endMarkerCount = countOccurrences(source, markerEnd);
  if (markerCount > 0 || endMarkerCount > 0) {
    const start = source.indexOf(markerStart);
    const end = source.indexOf(markerEnd);
    const managedBlock = source.slice(start, end + markerEnd.length);
    if (
      markerCount !== 1 ||
      endMarkerCount !== 1 ||
      managedBlockAnchorSignatures.some(
        (signature) =>
          countOccurrences(source, signature) !== 1 || !managedBlock.includes(signature)
      ) ||
      ownedObjectSignatures.some((signature) => countOccurrences(source, signature) > 1) ||
      ownedObjectSignatures.some(
        (signature) => source.includes(signature) && !managedBlock.includes(signature)
      )
    ) {
      throw new Error("Cannot augment baseline: partial or divergent Flows integrity objects");
    }

    const expectedBlock = `${markerStart}\n${flowsIntegritySql}\n${markerEnd}`;
    const augmented = `${source.slice(0, start)}${expectedBlock}${source.slice(end + markerEnd.length)}`;
    if (augmented !== source) await writeFile(migrationPath, augmented, "utf8");
    return;
  }

  if (ownedObjectSignatures.some((signature) => source.includes(signature))) {
    throw new Error("Cannot augment baseline: partial or divergent Flows integrity objects");
  }

  const augmented = `${source.trimEnd()}\n${statementBreakpoint}\n${markerStart}\n${flowsIntegritySql}\n${markerEnd}\n`;
  await writeFile(migrationPath, augmented, "utf8");
}

function createFlowEnrollmentTraceConstraintIntegritySql(): string {
  const executionAttemptsConfig = getTableConfig(flowExecutionAttempts);
  const runEventsConfig = getTableConfig(flowRunEvents);
  const dialect = new PgDialect();
  const checkSql = (
    tableConfig: ReturnType<typeof getTableConfig>,
    name: string
  ): string => {
    const check = tableConfig.checks.find((candidate) => candidate.name === name);
    if (!check) throw new Error(`Cannot build Flows baseline: missing ${name}`);
    const query = dialect.sqlToQuery(check.value);
    if (query.params.length > 0) {
      throw new Error(`Cannot build Flows baseline: ${name} contains SQL parameters`);
    }
    return query.sql;
  };

  return `ALTER TABLE flow_execution_attempts
  DROP CONSTRAINT flow_execution_attempts_trace_summary_schema_check,
  ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
    ${checkSql(
      executionAttemptsConfig,
      "flow_execution_attempts_trace_summary_schema_check"
    )}
  ) NOT VALID;
${statementBreakpoint}
ALTER TABLE flow_execution_attempts
  VALIDATE CONSTRAINT flow_execution_attempts_trace_summary_schema_check;
${statementBreakpoint}
ALTER TABLE flow_run_events
  DROP CONSTRAINT flow_run_events_type_check,
  DROP CONSTRAINT flow_run_events_summary_schema_check,
  ADD CONSTRAINT flow_run_events_type_check CHECK (
    ${checkSql(runEventsConfig, "flow_run_events_type_check")}
  ) NOT VALID,
  ADD CONSTRAINT flow_run_events_summary_schema_check CHECK (
    ${checkSql(runEventsConfig, "flow_run_events_summary_schema_check")}
  ) NOT VALID;
${statementBreakpoint}
ALTER TABLE flow_run_events
  VALIDATE CONSTRAINT flow_run_events_type_check;
${statementBreakpoint}
ALTER TABLE flow_run_events
  VALIDATE CONSTRAINT flow_run_events_summary_schema_check;`;
}

function assertCanonicalShape(source: string): void {
  const requiredFragments = [
    'CREATE TABLE "flows"',
    'CREATE TABLE "flow_versions"',
    'CREATE TABLE "flow_definition_commands"',
    'CREATE TABLE "flow_definition_command_outcomes"',
    'CREATE TABLE "flow_runtime_commands"',
    'CREATE TABLE "flow_runtime_command_outcomes"',
    'CREATE TABLE "flow_runtime_events"',
    'CREATE TABLE "flow_runs"',
    'CREATE TABLE "flow_execution_attempts"',
    'CREATE TABLE "flow_run_events"',
    'CREATE TABLE "flow_work_items"',
    'CREATE TABLE "flow_activation_epochs"',
    'CREATE TABLE "flow_enrollment_commands"',
    'CREATE TABLE "flow_enrollment_command_outcomes"',
    'CREATE TABLE "flow_enrollment_controls"',
    'CREATE TABLE "flow_automation_quota_authorities"',
    '"request_schema_version" text NOT NULL',
    '"expected_enrollment_revision" integer NOT NULL',
    '"replay_until" timestamp with time zone NOT NULL',
    'FOREIGN KEY ("id","published_version_id","owner_user_id","published_at")',
    'REFERENCES "public"."flow_versions"("flow_id","id","owner_user_id","published_at")'
  ];
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      const reason =
        fragment.includes("published_version_id") || fragment.includes("flow_versions")
          ? "canonical flows publication reference"
          : `required generated shape (${fragment})`;
      throw new Error(`Cannot augment baseline: missing ${reason}`);
    }
  }
}

function countOccurrences(source: string, fragment: string): number {
  return source.split(fragment).length - 1;
}

async function findCurrentBaseline(): Promise<string> {
  const migrationDirectory = join(__dirname, "../drizzle");
  const baselines = (await readdir(migrationDirectory))
    .filter((entry) => /^0000_.+\.sql$/.test(entry))
    .sort();
  if (baselines.length !== 1) {
    throw new Error(`Expected exactly one generated 0000 baseline, found ${baselines.length}`);
  }
  return join(migrationDirectory, baselines[0]!);
}

async function main(): Promise<void> {
  const migrationPath = await findCurrentBaseline();
  await augmentFlowsBaseline(migrationPath);
  console.log(`Flows integrity objects verified in ${migrationPath}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
