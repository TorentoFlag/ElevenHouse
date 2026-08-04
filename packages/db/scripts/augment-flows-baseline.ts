import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const statementBreakpoint = "--> statement-breakpoint";
const markerStart = "-- ElevenHouse Flows integrity objects: begin";
const markerEnd = "-- ElevenHouse Flows integrity objects: end";

const ownedObjectSignatures = [
  'CREATE TRIGGER "flow_versions_immutable_update"',
  'CREATE TRIGGER "flow_versions_delete_with_aggregate_only"',
  'CREATE CONSTRAINT TRIGGER "flow_publication_pointer_consistency"',
  'CREATE CONSTRAINT TRIGGER "flow_version_pointer_consistency"',
  'CREATE TRIGGER "flow_definition_commands_immutable_identity"',
  'CREATE TRIGGER "flow_definition_command_outcomes_retention"',
  'CREATE CONSTRAINT TRIGGER "flow_definition_command_outcome_consistency"',
  'CREATE CONSTRAINT TRIGGER "flow_definition_outcome_command_consistency"',
  'CREATE TRIGGER "flow_definition_migrations_immutable"',
  'CREATE TRIGGER "flow_runtime_commands_immutable_identity"',
  'CREATE TRIGGER "flow_runtime_command_outcomes_retention"',
  'CREATE CONSTRAINT TRIGGER "flow_runtime_command_outcome_consistency"',
  'CREATE CONSTRAINT TRIGGER "flow_runtime_outcome_command_consistency"',
  'CREATE CONSTRAINT TRIGGER "flow_run_event_command_consistency"',
  'CREATE TRIGGER "flow_execution_attempts_immutable"',
  'CREATE TRIGGER "flow_execution_attempts_truncate_guard"',
  'CREATE TRIGGER "flow_run_events_immutable"',
  'CREATE TRIGGER "flow_run_events_truncate_guard"'
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
CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_definition_migration_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $flow_migration_guard$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'flow definition migration evidence is immutable'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_definition_migrations_immutable';
  END IF;

  IF EXISTS (SELECT 1 FROM flows WHERE id = OLD.flow_id)
     AND EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_user_id) THEN
    RAISE EXCEPTION 'flow definition migration evidence can only be deleted with its aggregate'
      USING ERRCODE = '55000', CONSTRAINT = 'flow_definition_migrations_immutable';
  END IF;

  RETURN OLD;
END;
$flow_migration_guard$;
${statementBreakpoint}
CREATE TRIGGER "flow_definition_migrations_immutable"
BEFORE UPDATE OR DELETE ON flow_definition_migrations
FOR EACH ROW
EXECUTE FUNCTION elevenhouse_guard_flow_definition_migration_mutation();`;

export const flowRuntimeCommandIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_runtime_command_mutation()
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

export const flowRunEventCommandIntegritySql = `CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_run_event_command()
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
${flowRuntimeCommandIntegritySql}
${statementBreakpoint}
${flowRunEventCommandIntegritySql}
${statementBreakpoint}
${flowExecutionHistoryIntegritySql}`;

export async function augmentFlowsBaseline(migrationPath: string): Promise<void> {
  const source = await readFile(migrationPath, "utf8");
  assertCanonicalShape(source);

  const markerCount = countOccurrences(source, markerStart);
  const endMarkerCount = countOccurrences(source, markerEnd);
  if (markerCount > 0 || endMarkerCount > 0) {
    const expectedBlock = `${markerStart}\n${flowsIntegritySql}\n${markerEnd}`;
    if (
      markerCount !== 1 ||
      endMarkerCount !== 1 ||
      !source.includes(expectedBlock) ||
      ownedObjectSignatures.some((signature) => countOccurrences(source, signature) !== 1)
    ) {
      throw new Error("Cannot augment baseline: partial or divergent Flows integrity objects");
    }
    return;
  }

  if (ownedObjectSignatures.some((signature) => source.includes(signature))) {
    throw new Error("Cannot augment baseline: partial or divergent Flows integrity objects");
  }

  const augmented = `${source.trimEnd()}\n${statementBreakpoint}\n${markerStart}\n${flowsIntegritySql}\n${markerEnd}\n`;
  await writeFile(migrationPath, augmented, "utf8");
}

function assertCanonicalShape(source: string): void {
  const requiredFragments = [
    'CREATE TABLE "flows"',
    'CREATE TABLE "flow_versions"',
    'CREATE TABLE "flow_definition_commands"',
    'CREATE TABLE "flow_definition_command_outcomes"',
    'CREATE TABLE "flow_definition_migrations"',
    'CREATE TABLE "flow_runtime_commands"',
    'CREATE TABLE "flow_runtime_command_outcomes"',
    'CREATE TABLE "flow_runs"',
    'CREATE TABLE "flow_execution_attempts"',
    'CREATE TABLE "flow_run_events"',
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
