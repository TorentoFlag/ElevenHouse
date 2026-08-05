const statementBreakpoint = "--> statement-breakpoint";

export const flowRuntimeCommandIntegrityV1Sql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_runtime_command_mutation()
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

export const flowRunEventCommandIntegrityV1Sql = `CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_run_event_command()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_run_event_command_guard$
DECLARE
  command_row flow_runtime_commands%ROWTYPE;
BEGIN
  IF NEW.event_type <> 'run_canceled' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO command_row
    FROM flow_runtime_commands
   WHERE id = NEW.command_id;
  IF NOT FOUND
     OR command_row.api_surface <> 'astrologer-api'
     OR command_row.owner_user_id <> NEW.owner_user_id
     OR command_row.route_template <> '/flow-runs/:runId/cancel'
     OR command_row.resource_id <> NEW.flow_run_id
     OR command_row.command_scope <> 'flows.runtime.cancel.v1'
     OR command_row.state <> 'succeeded' THEN
    RAISE EXCEPTION 'cancellation event requires a succeeded runtime command'
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
