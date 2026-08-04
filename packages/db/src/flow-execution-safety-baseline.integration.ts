import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertFlowExecutionSafety,
  reconcileFlowExecutionSafety
} from "../scripts/flow-execution-safety-reconciliation";
import {
  flowExecutionRetrySafetyBaselineDdl,
  flowExecutionSafetyBaselineDdl
} from "../scripts/production-baseline-plan";
import { assertDevelopmentDatabaseUrl } from "./connection";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_execution_safety_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const databaseClient = new Client({ connectionString: isolatedDatabaseUrl });
const currentBaselineSql = readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8");

describe("flow execution safety baseline PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    await databaseClient.connect();
  }, 30_000);

  afterAll(async () => {
    try {
      await databaseClient.end();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  beforeEach(async () => {
    await databaseClient.query("DROP SCHEMA public CASCADE");
    await databaseClient.query("CREATE SCHEMA public");
    await databaseClient.query(currentBaselineSql);
    await databaseClient.query(downgradeFlowExecutionSafetyDdl);
  });

  it("adds pinned retry and quarantine state without rewriting existing tokens", async () => {
    await insertCanonicalPredecessorToken();
    const before = await readTokenEvidence();
    const historyBefore = await readExecutionHistoryEvidence();

    await applyTransition();

    await expect(readTokenEvidence()).resolves.toEqual(before);
    await expect(readExecutionHistoryEvidence()).resolves.toEqual(historyBefore);
    const added = await databaseClient.query<{
      retry_policy_key: string;
      max_attempts: number;
      retry_base_delay_ms: number;
      retry_max_delay_ms: number;
      failure_disposition: string | null;
      failure_reason_code: string | null;
      quarantined_at: Date | null;
    }>(`
      SELECT retry_policy_key, max_attempts, retry_base_delay_ms, retry_max_delay_ms,
             failure_disposition, failure_reason_code, quarantined_at
        FROM flow_execution_tokens
    `);
    expect(added.rows).toEqual([
      {
        retry_policy_key: "flow-execution-retry.v1",
        max_attempts: 3,
        retry_base_delay_ms: 1_000,
        retry_max_delay_ms: 60_000,
        failure_disposition: null,
        failure_reason_code: null,
        quarantined_at: null
      }
    ]);
    await expect(readActivationIdentity()).resolves.toEqual({
      attemptSequences: ["1"],
      tokenSequences: ["1"]
    });
    await expect(assertFlowExecutionSafety(databaseClient)).resolves.toBeUndefined();
  });

  it("reconciles the exact generated baseline to current execution safety and then no-ops", async () => {
    await databaseClient.query("DROP SCHEMA public CASCADE");
    await databaseClient.query("CREATE SCHEMA public");
    await databaseClient.query(currentBaselineSql);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).resolves.toBe("reconciled");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }
    await expect(assertFlowExecutionSafety(databaseClient)).resolves.toBeUndefined();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).resolves.toBe("already_current");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }
  });

  it("rejects a generated-baseline completed token pinned to a non-terminal node", async () => {
    await databaseClient.query("DROP SCHEMA public CASCADE");
    await databaseClient.query("CREATE SCHEMA public");
    await databaseClient.query(currentBaselineSql);
    await databaseClient.query(
      "ALTER TABLE flow_execution_attempts ALTER COLUMN node_activation_sequence SET DEFAULT 1"
    );
    await insertCanonicalPredecessorToken();
    await databaseClient.query(
      "ALTER TABLE flow_execution_attempts ALTER COLUMN node_activation_sequence DROP DEFAULT"
    );
    await databaseClient.query(`
      UPDATE flow_execution_tokens
         SET node_id = 'birth-data',
             node_kind = 'birth_data_available',
             executor_key = 'birth_data_available:1:1'
    `);
    const before = await readTokenEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).rejects.toThrow(
        /not losslessly reconcilable to atomic advance/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readTokenEvidence()).resolves.toEqual(before);
  });

  it("reconciles only the exact predecessor catalog and then becomes an exact no-op", async () => {
    await insertCanonicalPredecessorToken();
    const before = await readTokenEvidence();
    const historyBefore = await readExecutionHistoryEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).resolves.toBe("reconciled");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }
    await expect(readTokenEvidence()).resolves.toEqual(before);
    await expect(readExecutionHistoryEvidence()).resolves.toEqual(historyBefore);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).resolves.toBe("already_current");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }
  });

  it("reconciles the exact retry-safety predecessor without rewriting execution history", async () => {
    await insertCanonicalPredecessorToken();
    await databaseClient.query(flowExecutionRetrySafetyBaselineDdl);
    const before = await readTokenEvidence();
    const historyBefore = await readExecutionHistoryEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).resolves.toBe("reconciled");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }

    await expect(readTokenEvidence()).resolves.toEqual(before);
    await expect(readExecutionHistoryEvidence()).resolves.toEqual(historyBefore);
    await expect(readActivationIdentity()).resolves.toEqual({
      attemptSequences: ["1"],
      tokenSequences: ["1"]
    });
    await expect(assertFlowExecutionSafety(databaseClient)).resolves.toBeUndefined();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).resolves.toBe("already_current");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }
  });

  it("rejects a retry-safety catalog containing an enrollment-trigger token", async () => {
    await insertCanonicalPredecessorToken();
    await databaseClient.query(flowExecutionRetrySafetyBaselineDdl);
    await databaseClient.query(`
      UPDATE flow_execution_tokens
         SET node_id = 'manual',
             node_kind = 'manual_client',
             executor_key = 'manual_client:1:1'
    `);
    const before = await readTokenEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).rejects.toThrow(
        /not losslessly reconcilable to atomic advance/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readTokenEvidence()).resolves.toEqual(before);
    await expect(readActivationColumnCount()).resolves.toBe("0");
  });

  it("rejects retry-safety history with more than one causal event per attempt", async () => {
    await insertCanonicalPredecessorToken();
    await databaseClient.query(flowExecutionRetrySafetyBaselineDdl);
    await databaseClient.query(`
      INSERT INTO flow_run_events (
        id, owner_user_id, flow_run_id, sequence, event_type, node_id, attempt_id,
        summary, occurred_at
      ) VALUES (
        'aa000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000001',
        'a6000000-0000-4000-8000-000000000001',
        2, 'run_completed', 'completed', 'a8000000-0000-4000-8000-000000000001',
        '{"schemaVersion":"flow-runtime-trace.v1","outcome":"terminal","nodeKind":"completed","reasonCode":"FLOW_GOAL_REACHED","resultCode":"done"}',
        '2026-08-03T10:05:00Z'
      )
    `);
    const before = await readExecutionHistoryEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).rejects.toThrow(
        /not losslessly reconcilable to atomic advance/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readExecutionHistoryEvidence()).resolves.toEqual(before);
    await expect(readActivationColumnCount()).resolves.toBe("0");
  });

  it("rejects legacy failed tokens whose reason cannot be inferred losslessly", async () => {
    await insertCanonicalPredecessorToken();
    await databaseClient.query(`
      UPDATE flow_execution_tokens
         SET state = 'failed', terminal_at = transaction_timestamp()
    `);
    const before = await readTokenEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).rejects.toThrow(
        /not losslessly reconcilable/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readTokenEvidence()).resolves.toEqual(before);
    await expect(readAddedColumnCount()).resolves.toBe("0");
  });

  it("rejects a predecessor claim whose persisted clock is in the future", async () => {
    await insertCanonicalPredecessorToken();
    await databaseClient.query(`
      UPDATE flow_execution_tokens
         SET state = 'claimed',
             claimed_at = clock_timestamp() + interval '1 day',
             lease_owner = 'future-clock-worker',
             lease_expires_at = clock_timestamp() + interval '1 day 1 minute',
             attempt_counter = 2,
             fencing_token = 2,
             terminal_at = null,
             updated_at = clock_timestamp() + interval '1 day'
    `);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).rejects.toThrow(
        /not losslessly reconcilable/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readAddedColumnCount()).resolves.toBe("0");
  });

  it("rejects predecessor attempt history outside the pinned budget", async () => {
    await insertCanonicalPredecessorToken();
    await databaseClient.query(`
      ALTER TABLE flow_execution_attempts
        DISABLE TRIGGER flow_execution_attempts_immutable;
      UPDATE flow_execution_attempts
         SET attempt_number = 4, fencing_token = 4;
      ALTER TABLE flow_execution_attempts
        ENABLE TRIGGER flow_execution_attempts_immutable;
    `);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).rejects.toThrow(
        /not losslessly reconcilable/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }
    await expect(readAddedColumnCount()).resolves.toBe("0");
  });

  it("rejects a partial predecessor catalog without changing rows or shape", async () => {
    await insertCanonicalPredecessorToken();
    await databaseClient.query(
      "CREATE INDEX flow_execution_tokens_unapproved_idx ON flow_execution_tokens (attempt_counter)"
    );
    const before = await readTokenEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowExecutionSafety(databaseClient)).rejects.toThrow(
        /partial or drifted Flow execution safety catalog/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(readTokenEvidence()).resolves.toEqual(before);
    await expect(readAddedColumnCount()).resolves.toBe("0");
  });

  it("rejects a drifted execution-history trigger function body", async () => {
    await applyTransition();
    await databaseClient.query(`
      CREATE OR REPLACE FUNCTION elevenhouse_guard_flow_execution_history_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $drifted_execution_history_guard$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $drifted_execution_history_guard$;
    `);

    await expect(assertFlowExecutionSafety(databaseClient)).rejects.toThrow(
      /Flow execution safety catalog drifted/
    );
  });

  it("rejects case-only drift inside a quoted trigger-function literal", async () => {
    await applyTransition();
    await databaseClient.query(`
      CREATE OR REPLACE FUNCTION elevenhouse_assert_flow_run_event_command()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $flow_run_event_command_guard$
      DECLARE
        command_row flow_runtime_commands%ROWTYPE;
      BEGIN
        IF NEW.event_type <> 'RUN_CANCELED' THEN
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
    `);

    await expect(assertFlowExecutionSafety(databaseClient)).rejects.toThrow(
      /Flow execution safety catalog drifted/
    );
  });

  it.each([
    ["row-level security", "ALTER TABLE flow_execution_tokens ENABLE ROW LEVEL SECURITY"],
    ["forced row-level security", "ALTER TABLE flow_execution_tokens FORCE ROW LEVEL SECURITY"]
  ])("rejects %s drift on an execution authority relation", async (_label, statement) => {
    await applyTransition();
    await databaseClient.query(statement);

    await expect(assertFlowExecutionSafety(databaseClient)).rejects.toThrow(
      /Flow execution safety catalog drifted/
    );
  });

  it("serializes concurrent reconciliation and applies the transition once", async () => {
    const competingClient = new Client({ connectionString: isolatedDatabaseUrl });
    await competingClient.connect();
    await databaseClient.query("BEGIN");
    await competingClient.query("BEGIN");

    try {
      const first = reconcileFlowExecutionSafety(databaseClient).then(async (result) => {
        await databaseClient.query("COMMIT");
        return result;
      });
      const second = reconcileFlowExecutionSafety(competingClient).then(async (result) => {
        await competingClient.query("COMMIT");
        return result;
      });

      await expect(Promise.all([first, second])).resolves.toEqual(
        expect.arrayContaining(["reconciled", "already_current"])
      );
      await expect(assertFlowExecutionSafety(databaseClient)).resolves.toBeUndefined();
    } catch (error) {
      await databaseClient.query("ROLLBACK").catch(() => undefined);
      await competingClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await competingClient.end();
    }
  });
});

async function applyTransition(): Promise<void> {
  await databaseClient.query("BEGIN");
  try {
    await databaseClient.query(flowExecutionSafetyBaselineDdl);
    await databaseClient.query("COMMIT");
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  }
}

async function insertCanonicalPredecessorToken(): Promise<void> {
  await databaseClient.query(`
    INSERT INTO users (id, status)
    VALUES ('a1000000-0000-4000-8000-000000000001', 'active');

    INSERT INTO flows (
      id, owner_user_id, name, origin, status, definition_state, approval_mode,
      revision, draft_graph, draft_presentation, created_at, updated_at
    ) VALUES (
      'a2000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'Execution safety fixture',
      '{"schemaVersion":"flow-definition-origin.v1","type":"blank"}',
      'draft', 'draft', 'manual_approve', 1,
      '{"schemaVersion":"flow-graph.v2","nodes":[{"id":"completed","kind":"completed","displayTitle":"Completed","configSchemaVersion":1,"executorContractVersion":1,"config":{"goalKey":"done"}}],"edges":[]}',
      '{"schemaVersion":"flow-presentation.v1","nodes":[{"nodeId":"completed","position":{"x":0,"y":0}}],"viewport":{"x":0,"y":0,"zoom":1}}',
      '2026-08-03T10:00:00Z', '2026-08-03T10:00:00Z'
    );

    INSERT INTO flow_versions (
      id, flow_id, owner_user_id, version, source_revision, approval_mode,
      graph_schema_version, graph, presentation, capability_manifest, published_at
    ) VALUES (
      'a3000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      1, 1, 'manual_approve', 'flow-graph.v2',
      '{"schemaVersion":"flow-graph.v2","nodes":[{"id":"completed","kind":"completed","displayTitle":"Completed","configSchemaVersion":1,"executorContractVersion":1,"config":{"goalKey":"done"}}],"edges":[]}',
      '{"schemaVersion":"flow-presentation.v1","nodes":[{"nodeId":"completed","position":{"x":0,"y":0}}],"viewport":{"x":0,"y":0,"zoom":1}}',
      '{"schemaVersion":"flow-capability-manifest.v1","executionSemanticsVersion":"flow-interpreter.v1","nodeExecutors":[{"kind":"completed","configSchemaVersion":1,"executorContractVersion":1}],"requiredCapabilities":[]}',
      '2026-08-03T10:01:00Z'
    );

    UPDATE flows
       SET status = 'published', definition_state = 'versioned',
           published_version_id = 'a3000000-0000-4000-8000-000000000001',
           published_at = '2026-08-03T10:01:00Z'
     WHERE id = 'a2000000-0000-4000-8000-000000000001';

    INSERT INTO flow_runtime_events (
      id, owner_user_id, source, source_event_id, dedupe_key, subject_type,
      subject_id, occurred_at, payload, created_at
    ) VALUES (
      'a4000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'manual', 'execution-safety-fixture', 'execution-safety-fixture',
      'client', 'a5000000-0000-4000-8000-000000000001',
      '2026-08-03T10:02:00Z', '{}', '2026-08-03T10:02:00Z'
    );

    INSERT INTO flow_runs (
      id, owner_user_id, flow_id, flow_version_id, runtime_event_id, status,
      snapshot, current_node_id, trace_sequence, completed_at, created_at, updated_at
    ) VALUES (
      'a6000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'a4000000-0000-4000-8000-000000000001',
      'completed', '{"schemaVersion":"flow-run-snapshot.v2"}', 'completed', 1,
      '2026-08-03T10:04:00Z',
      '2026-08-03T10:03:00Z', '2026-08-03T10:03:00Z'
    );

    INSERT INTO flow_execution_tokens (
      id, owner_user_id, flow_run_id, flow_version_id, node_id, node_kind,
      config_schema_version, executor_contract_version, executor_key, state,
      available_at, attempt_counter, fencing_token, terminal_at, created_at, updated_at
    ) VALUES (
      'a7000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'completed', 'completed', 1, 1, 'completed:1:1', 'completed',
      '2026-08-03T10:03:00Z', 1, 1, '2026-08-03T10:04:00Z',
      '2026-08-03T10:03:00Z', '2026-08-03T10:03:00Z'
    );

    INSERT INTO flow_execution_attempts (
      id, owner_user_id, flow_run_id, token_id, flow_version_id, node_id,
      executor_key, attempt_number, fencing_token, lease_owner, outcome,
      result_code, trace_summary, started_at, completed_at, created_at
    ) VALUES (
      'a8000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000001',
      'a7000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'completed', 'completed:1:1', 1, 1, 'flows-worker-fixture', 'completed',
      'done',
      '{"schemaVersion":"flow-runtime-trace.v1","outcome":"terminal","nodeKind":"completed","reasonCode":"FLOW_GOAL_REACHED","resultCode":"done"}',
      '2026-08-03T10:03:00Z', '2026-08-03T10:04:00Z', '2026-08-03T10:04:00Z'
    );

    INSERT INTO flow_run_events (
      id, owner_user_id, flow_run_id, sequence, event_type, node_id, attempt_id,
      summary, occurred_at
    ) VALUES (
      'a9000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000001',
      1, 'run_completed', 'completed', 'a8000000-0000-4000-8000-000000000001',
      '{"schemaVersion":"flow-runtime-trace.v1","outcome":"terminal","nodeKind":"completed","reasonCode":"FLOW_GOAL_REACHED","resultCode":"done"}',
      '2026-08-03T10:04:00Z'
    );
  `);
}

async function readTokenEvidence() {
  const result = await databaseClient.query(`
    SELECT xmin::text AS row_version, ctid::text AS row_location,
           id, owner_user_id, flow_run_id, flow_version_id, node_id, node_kind,
           config_schema_version, executor_contract_version, executor_key, state,
           available_at::text, claimed_at::text, lease_owner, lease_expires_at::text,
           attempt_counter::text, fencing_token::text, terminal_at::text,
           created_at::text, updated_at::text
      FROM flow_execution_tokens
     ORDER BY id
  `);
  return result.rows;
}

async function readExecutionHistoryEvidence() {
  const [attempts, events] = await Promise.all([
    databaseClient.query(`
      SELECT xmin::text AS row_version, ctid::text AS row_location,
             id, owner_user_id, flow_run_id, token_id, flow_version_id, node_id,
             executor_key, attempt_number::text, fencing_token::text, lease_owner,
             outcome, result_code, trace_summary::text, started_at::text,
             completed_at::text, created_at::text
        FROM flow_execution_attempts
       ORDER BY id
    `),
    databaseClient.query(`
      SELECT xmin::text AS row_version, ctid::text AS row_location,
             id, owner_user_id, flow_run_id, sequence::text, event_type, node_id,
             attempt_id, command_id, summary::text, occurred_at::text
        FROM flow_run_events
       ORDER BY id
    `)
  ]);
  return { attempts: attempts.rows, events: events.rows };
}

async function readAddedColumnCount(): Promise<string> {
  const result = await databaseClient.query<{ count: string }>(`
    SELECT count(*)::text AS count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'flow_execution_tokens'
       AND column_name IN (
         'retry_policy_key', 'max_attempts', 'retry_base_delay_ms', 'retry_max_delay_ms',
         'failure_disposition', 'failure_reason_code', 'quarantined_at'
       )
  `);
  return result.rows[0]?.count ?? "unknown";
}

async function readActivationColumnCount(): Promise<string> {
  const result = await databaseClient.query<{ count: string }>(`
    SELECT count(*)::text AS count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('flow_execution_tokens', 'flow_execution_attempts')
       AND column_name = 'node_activation_sequence'
  `);
  return result.rows[0]?.count ?? "unknown";
}

async function readActivationIdentity(): Promise<{
  readonly attemptSequences: readonly string[];
  readonly tokenSequences: readonly string[];
}> {
  const [tokens, attempts] = await Promise.all([
    databaseClient.query<{ node_activation_sequence: string }>(`
      SELECT node_activation_sequence::text AS node_activation_sequence
        FROM flow_execution_tokens
       ORDER BY id
    `),
    databaseClient.query<{ node_activation_sequence: string }>(`
      SELECT node_activation_sequence::text AS node_activation_sequence
        FROM flow_execution_attempts
       ORDER BY id
    `)
  ]);
  return {
    attemptSequences: attempts.rows.map((row) => row.node_activation_sequence),
    tokenSequences: tokens.rows.map((row) => row.node_activation_sequence)
  };
}

const downgradeFlowExecutionSafetyDdl = `
  DROP INDEX flow_run_events_attempt_unique;
  DROP INDEX flow_execution_attempts_token_activation_attempt_unique;
  CREATE UNIQUE INDEX flow_execution_attempts_token_attempt_unique
    ON flow_execution_attempts (token_id, attempt_number);

  DROP INDEX flow_execution_tokens_quarantined_idx;

  ALTER TABLE flow_execution_tokens
    DROP CONSTRAINT flow_execution_tokens_attempt_counter_check,
    DROP CONSTRAINT flow_execution_tokens_fencing_token_check,
    DROP CONSTRAINT flow_execution_tokens_lease_state_check,
    DROP CONSTRAINT flow_execution_tokens_counter_state_check,
    ADD CONSTRAINT flow_execution_tokens_attempt_counter_check CHECK (attempt_counter >= 0),
    ADD CONSTRAINT flow_execution_tokens_fencing_token_check CHECK (fencing_token >= 0),
    ADD CONSTRAINT flow_execution_tokens_lease_state_check CHECK (
      (
        state = 'claimed'
        AND claimed_at IS NOT NULL
        AND lease_owner IS NOT NULL
        AND lease_expires_at IS NOT NULL
      ) OR (
        state <> 'claimed'
        AND claimed_at IS NULL
        AND lease_owner IS NULL
        AND lease_expires_at IS NULL
      )
    );

  ALTER TABLE flow_execution_tokens
    DROP CONSTRAINT flow_execution_tokens_node_activation_sequence_check,
    DROP CONSTRAINT flow_execution_tokens_node_kind_check,
    DROP CONSTRAINT flow_execution_tokens_retry_policy_check,
    DROP CONSTRAINT flow_execution_tokens_failure_disposition_check,
    DROP CONSTRAINT flow_execution_tokens_failure_reason_check,
    DROP CONSTRAINT flow_execution_tokens_failure_state_check,
    DROP COLUMN retry_policy_key,
    DROP COLUMN max_attempts,
    DROP COLUMN retry_base_delay_ms,
    DROP COLUMN retry_max_delay_ms,
    DROP COLUMN failure_disposition,
    DROP COLUMN failure_reason_code,
    DROP COLUMN quarantined_at,
    DROP COLUMN node_activation_sequence;

  ALTER TABLE flow_execution_attempts
    DROP CONSTRAINT flow_execution_attempts_node_activation_sequence_check,
    DROP CONSTRAINT flow_execution_attempts_number_check,
    DROP CONSTRAINT flow_execution_attempts_trace_summary_schema_check,
    ADD CONSTRAINT flow_execution_attempts_number_check CHECK (
      attempt_number > 0 AND fencing_token > 0
    ),
    ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check CHECK (
      trace_summary ?& ARRAY['schemaVersion','outcome','nodeKind','reasonCode','resultCode']::text[]
      AND trace_summary - ARRAY['schemaVersion','outcome','nodeKind','reasonCode','resultCode']::text[] = '{}'::jsonb
      AND jsonb_typeof(trace_summary->'schemaVersion') = 'string'
      AND jsonb_typeof(trace_summary->'outcome') = 'string'
      AND jsonb_typeof(trace_summary->'nodeKind') = 'string'
      AND jsonb_typeof(trace_summary->'reasonCode') = 'string'
      AND jsonb_typeof(trace_summary->'resultCode') = 'string'
      AND trace_summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND trace_summary->>'nodeKind' IN (
        'booking_confirmed','manual_client','birth_data_available','astrologer_work_item',
        'astrologer_approval','completed','suppressed','failed'
      )
      AND trace_summary->>'nodeKind' = split_part(executor_key, ':', 1)
      AND result_code = trace_summary->>'resultCode'
      AND length(trace_summary->>'resultCode') BETWEEN 1 AND 160
      AND trace_summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (outcome = 'completed' AND trace_summary->>'outcome' = 'terminal'
          AND trace_summary->>'reasonCode' = 'FLOW_GOAL_REACHED')
        OR (outcome = 'lease_expired' AND trace_summary->>'outcome' = 'lease_expired'
          AND trace_summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND trace_summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED')
        OR (outcome = 'canceled' AND trace_summary->>'outcome' = 'canceled'
          AND trace_summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND trace_summary->>'resultCode' = 'FLOW_RUN_CANCELED')
      )
    ),
    DROP COLUMN node_activation_sequence;

  ALTER TABLE flow_run_events
    DROP CONSTRAINT flow_run_events_summary_schema_check,
    ADD CONSTRAINT flow_run_events_summary_schema_check CHECK (
      summary ?& ARRAY['schemaVersion','outcome','nodeKind','reasonCode','resultCode']::text[]
      AND summary - ARRAY['schemaVersion','outcome','nodeKind','reasonCode','resultCode']::text[] = '{}'::jsonb
      AND jsonb_typeof(summary->'schemaVersion') = 'string'
      AND jsonb_typeof(summary->'outcome') = 'string'
      AND jsonb_typeof(summary->'nodeKind') = 'string'
      AND jsonb_typeof(summary->'reasonCode') = 'string'
      AND jsonb_typeof(summary->'resultCode') = 'string'
      AND summary->>'schemaVersion' = 'flow-runtime-trace.v1'
      AND summary->>'nodeKind' IN (
        'booking_confirmed','manual_client','birth_data_available','astrologer_work_item',
        'astrologer_approval','completed','suppressed','failed'
      )
      AND length(summary->>'resultCode') BETWEEN 1 AND 160
      AND summary->>'resultCode' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      AND (
        (event_type = 'run_completed' AND attempt_id IS NOT NULL AND command_id IS NULL
          AND summary->>'outcome' = 'terminal' AND summary->>'reasonCode' = 'FLOW_GOAL_REACHED')
        OR (event_type = 'token_lease_expired' AND attempt_id IS NOT NULL AND command_id IS NULL
          AND summary->>'outcome' = 'lease_expired'
          AND summary->>'reasonCode' = 'FLOW_TOKEN_LEASE_EXPIRED'
          AND summary->>'resultCode' = 'FLOW_TOKEN_LEASE_EXPIRED')
        OR (event_type = 'run_canceled' AND command_id IS NOT NULL
          AND summary->>'outcome' = 'canceled'
          AND summary->>'reasonCode' = 'FLOW_RUN_CANCELED_BY_OWNER'
          AND summary->>'resultCode' = 'FLOW_RUN_CANCELED')
      )
    );
`;

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "test Flow execution safety");
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
