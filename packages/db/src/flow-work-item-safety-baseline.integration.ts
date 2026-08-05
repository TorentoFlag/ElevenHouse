import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertFlowWorkItemSafety,
  reconcileFlowWorkItemSafety
} from "../scripts/flow-work-item-safety-reconciliation";
import {
  flowRunEventCommandIntegrityV1Sql,
  flowRuntimeCommandIntegrityV1Sql
} from "../scripts/flow-runtime-command-integrity-v1";
import { assertDevelopmentDatabaseUrl } from "./connection";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_work_item_safety_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const databaseClient = new Client({ connectionString: isolatedDatabaseUrl });
const currentBaselineSql = readFileSync(
  process.env.FLOW_INTEGRATION_BASELINE_PATH ?? "packages/db/drizzle/0000_sticky_rictor.sql",
  "utf8"
);

describe("flow work-item safety baseline PostgreSQL integration", () => {
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
  });

  it("recognizes the exact generated baseline and remains an exact no-op", async () => {
    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowWorkItemSafety(databaseClient)).resolves.toBe(
        "already_current"
      );
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }

    await expect(assertFlowWorkItemSafety(databaseClient)).resolves.toBeUndefined();
  });

  it("rejects a succeeded cancellation command without its durable run event", async () => {
    await databaseClient.query("BEGIN");
    try {
      await insertSucceededCancellationCommandWithoutEvent();

      await expect(databaseClient.query("COMMIT")).rejects.toMatchObject({
        constraint: "flow_runtime_command_event_consistency"
      });
    } finally {
      await databaseClient.query("ROLLBACK").catch(() => undefined);
    }
  });

  it("upgrades the exact command-event predecessor without rewriting data", async () => {
    await databaseClient.query(downgradeFlowRuntimeCommandEventIntegrityDdl);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowWorkItemSafety(databaseClient)).resolves.toBe("reconciled");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }

    await expect(assertFlowWorkItemSafety(databaseClient)).resolves.toBeUndefined();
  });

  it("refuses to bless predecessor succeeded commands that have no durable event", async () => {
    await databaseClient.query(downgradeFlowRuntimeCommandEventIntegrityDdl);
    await databaseClient.query("BEGIN");
    try {
      await insertSucceededCancellationCommandWithoutEvent();
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowWorkItemSafety(databaseClient)).rejects.toThrow(
        /Flow runtime command event provenance drifted; invalid_count=1/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }
  });

  it("backfills exact V1 cancellation commands and creates empty work-item authority", async () => {
    await databaseClient.query(downgradeFlowWorkItemSafetyDdl);
    await insertFailedCancellationCommand();
    const before = await readCancellationCommandEvidence();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowWorkItemSafety(databaseClient)).resolves.toBe("reconciled");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }

    await expect(readCancellationCommandEvidence()).resolves.toEqual({
      ...before,
      flow_run_id: before.resource_id
    });
    await expect(databaseClient.query("SELECT count(*)::text AS count FROM flow_work_items")).resolves.toMatchObject(
      { rows: [{ count: "0" }] }
    );
    await expect(assertFlowWorkItemSafety(databaseClient)).resolves.toBeUndefined();

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowWorkItemSafety(databaseClient)).resolves.toBe(
        "already_current"
      );
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }
  });

  it("allows the exact pre-atomic execution shape only during work-item reconciliation", async () => {
    await databaseClient.query(downgradeFlowWorkItemSafetyDdl);
    await databaseClient.query(`
      ALTER TABLE flow_execution_tokens
        DROP CONSTRAINT flow_execution_tokens_node_activation_sequence_check,
        DROP COLUMN node_activation_sequence
    `);

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowWorkItemSafety(databaseClient)).resolves.toBe("reconciled");
      await databaseClient.query("COMMIT");
    } catch (error) {
      await databaseClient.query("ROLLBACK");
      throw error;
    }

    await expect(assertFlowWorkItemSafety(databaseClient)).rejects.toThrow(
      /node_activation_sequence/
    );
    await databaseClient.query(`
      ALTER TABLE flow_execution_tokens
        ADD COLUMN node_activation_sequence bigint DEFAULT 1 NOT NULL,
        ADD CONSTRAINT flow_execution_tokens_node_activation_sequence_check
          CHECK (node_activation_sequence > 0)
    `);
    await expect(assertFlowWorkItemSafety(databaseClient)).resolves.toBeUndefined();
  });

  it("rejects a partial predecessor catalog without mutating it", async () => {
    await databaseClient.query(downgradeFlowWorkItemSafetyDdl);
    await databaseClient.query("ALTER TABLE flow_runtime_commands ADD COLUMN unexpected text");

    await databaseClient.query("BEGIN");
    try {
      await expect(reconcileFlowWorkItemSafety(databaseClient)).rejects.toThrow(
        /partial or drifted Flow work-item safety catalog/
      );
    } finally {
      await databaseClient.query("ROLLBACK");
    }

    await expect(
      databaseClient.query("SELECT to_regclass('public.flow_work_items')::text AS relation")
    ).resolves.toMatchObject({ rows: [{ relation: null }] });
  });
});

async function insertFailedCancellationCommand(): Promise<void> {
  const ownerUserId = "a1000000-0000-4000-8000-000000000001";
  const commandId = "a2000000-0000-4000-8000-000000000001";
  const runId = "a3000000-0000-4000-8000-000000000001";
  await databaseClient.query("INSERT INTO users (id) VALUES ($1)", [ownerUserId]);
  await databaseClient.query("BEGIN");
  try {
    await databaseClient.query(
      `INSERT INTO flow_runtime_commands (
         id, api_surface, actor_user_id, owner_user_id, route_template, resource_id,
         command_scope, idempotency_key, request_hash, state, completed_at,
         replay_until, created_at, updated_at
       ) VALUES (
         $1, 'astrologer-api', $2, $2, '/flow-runs/:runId/cancel', $3,
         'flows.runtime.cancel.v1', 'cancel-test-001', $4, 'failed', $5,
         $5::timestamptz + interval '24 hours', $5, $5
       )`,
      [commandId, ownerUserId, runId, `sha256:${"a".repeat(64)}`, "2026-08-04T00:00:00Z"]
    );
    await databaseClient.query(
      `INSERT INTO flow_runtime_command_outcomes (
         command_id, response_status, response_body, created_at
       ) VALUES ($1, 404, '{"error":{"code":"FLOW_RUN_NOT_FOUND"}}'::jsonb, $2)`,
      [commandId, "2026-08-04T00:00:00Z"]
    );
    await databaseClient.query("COMMIT");
  } catch (error) {
    await databaseClient.query("ROLLBACK");
    throw error;
  }
}

async function insertSucceededCancellationCommandWithoutEvent(): Promise<void> {
  const ownerUserId = "b1000000-0000-4000-8000-000000000001";
  const commandId = "b2000000-0000-4000-8000-000000000001";
  const runId = "b3000000-0000-4000-8000-000000000001";
  const completedAt = "2026-08-04T00:00:00Z";
  await databaseClient.query("INSERT INTO users (id) VALUES ($1)", [ownerUserId]);
  await databaseClient.query(
    `INSERT INTO flow_runtime_commands (
       id, api_surface, actor_user_id, owner_user_id, route_template, resource_id,
       flow_run_id, command_scope, idempotency_key, request_hash, state, completed_at,
       replay_until, created_at, updated_at
     ) VALUES (
       $1, 'astrologer-api', $2, $2, '/flow-runs/:runId/cancel', $3,
       $3, 'flows.runtime.cancel.v1', 'cancel-without-event-001', $4, 'succeeded', $5,
       $5::timestamptz + interval '24 hours', $5, $5
     )`,
    [commandId, ownerUserId, runId, `sha256:${"b".repeat(64)}`, completedAt]
  );
  await databaseClient.query(
    `INSERT INTO flow_runtime_command_outcomes (
       command_id, response_status, response_body, created_at
     ) VALUES (
       $1, 200, jsonb_build_object('run', jsonb_build_object('id', $2::text, 'status', 'canceled')),
       $3
     )`,
    [commandId, runId, completedAt]
  );
}

async function readCancellationCommandEvidence(): Promise<Record<string, unknown>> {
  const result = await databaseClient.query<Record<string, unknown>>(`
    SELECT id::text, api_surface, actor_user_id::text, owner_user_id::text,
           route_template, resource_id::text, command_scope, idempotency_key,
           request_hash, state, completed_at::text, replay_until::text,
           created_at::text, updated_at::text,
           CASE WHEN EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'flow_runtime_commands'
                AND column_name = 'flow_run_id'
           ) THEN to_jsonb(flow_runtime_commands)->>'flow_run_id' ELSE NULL END AS flow_run_id
      FROM flow_runtime_commands
  `);
  return result.rows[0] ?? {};
}

const downgradeFlowRuntimeCommandEventIntegrityDdl = `
  DROP TRIGGER "flow_runtime_command_event_consistency" ON flow_runtime_commands;
  DROP FUNCTION elevenhouse_assert_flow_runtime_command_event();
`;

const downgradeFlowWorkItemSafetyDdl = `
  ${downgradeFlowRuntimeCommandEventIntegrityDdl}
  DROP TRIGGER "flow_run_events_work_item_consistency" ON flow_run_events;
  DROP TRIGGER "flow_run_event_command_consistency" ON flow_run_events;
  ALTER TABLE flow_run_events
    DROP CONSTRAINT flow_run_events_command_run_owner_fk;
  DROP INDEX flow_run_events_command_unique;

  DROP TRIGGER "flow_runtime_commands_work_item_consistency" ON flow_runtime_commands;
  DROP TABLE flow_work_items;
  DROP FUNCTION elevenhouse_assert_flow_work_item_command();
  ALTER TABLE flow_run_events
    DROP CONSTRAINT flow_run_events_id_run_owner_unique;

  DROP TRIGGER "flow_runtime_commands_immutable_identity" ON flow_runtime_commands;
  DROP TRIGGER "flow_runtime_command_outcome_consistency" ON flow_runtime_commands;
  DROP TRIGGER "flow_runtime_outcome_command_consistency" ON flow_runtime_command_outcomes;
  DROP TRIGGER "flow_runtime_command_outcomes_retention" ON flow_runtime_command_outcomes;

  ALTER TABLE flow_runtime_commands
    DROP CONSTRAINT flow_runtime_commands_scope_check,
    DROP CONSTRAINT flow_runtime_commands_id_run_owner_unique,
    DROP COLUMN flow_run_id,
    ADD CONSTRAINT flow_runtime_commands_scope_check CHECK (
      api_surface = 'astrologer-api'
      AND route_template IN ('/flow-runs/:runId/cancel')
      AND command_scope IN ('flows.runtime.cancel.v1')
      AND route_template = '/flow-runs/:runId/cancel'
      AND command_scope = 'flows.runtime.cancel.v1'
    );

  ALTER TABLE flow_run_events
    ADD CONSTRAINT flow_run_events_command_run_owner_fk
      FOREIGN KEY (command_id, flow_run_id, owner_user_id)
      REFERENCES flow_runtime_commands(id, resource_id, owner_user_id)
      ON DELETE CASCADE;

  ${flowRuntimeCommandIntegrityV1Sql}
  ${flowRunEventCommandIntegrityV1Sql}
`;

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "test Flow work-item safety");
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
