import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  approvedLegacyMigrations,
  classifyBaselineHistory,
  currentBaseline,
  flowCapabilityManifestSafetyBaselineDdl,
  flowDefinitionControlBaselineDdl,
  flowExecutionAtomicAdvanceBaselineDdl,
  flowExecutionRetrySafetyBaselineDdl,
  flowExecutionRuntimeBaselineDdl,
  flowExecutionSafetyBaselineDdl,
  flowOutboxSafetyBaselineDdl,
  flowRunCancellationBaselineDdl,
  flowRuntimeFoundationBaselineDdl,
  previousAtomicAdvanceBaseline,
  previousFlowSafetyBaseline,
  previousBaseline,
  previousCancellationKernelBaseline,
  previousFlowDefinitionControlBaseline,
  previousRuntimeKernelBaseline,
  schedulingBaselineDdl
} from "./production-baseline-plan";

const priorBaseline = {
  hash: "9502df7bc0155994014951df839fd556213d11e3c370cb5244d65a37a43d704e",
  createdAt: "1785010323027"
} as const;

const natalChartEngineBaseline = {
  hash: "ab1e22a3e02a0c428dfa01e90e48b5f037e66509ecf51fa5674e5e3ab2889b57",
  createdAt: "1784275401007"
} as const;

describe("production baseline transition plan", () => {
  it("matches the checked-in generated baseline hash and journal timestamp", () => {
    const migration = readFileSync("packages/db/drizzle/0000_sticky_rictor.sql");
    const journal = JSON.parse(readFileSync("packages/db/drizzle/meta/_journal.json", "utf8")) as {
      entries: Array<{ when: number }>;
    };

    expect(createHash("sha256").update(migration).digest("hex")).toBe(currentBaseline.hash);
    expect(String(journal.entries[0]?.when)).toBe(currentBaseline.createdAt);
  });

  it("accepts only explicit fresh, previous and calculation-legacy histories", () => {
    expect(classifyBaselineHistory([row(currentBaseline)])).toBe("current");
    expect(classifyBaselineHistory([row(previousAtomicAdvanceBaseline)])).toBe(
      "previous_atomic_advance"
    );
    expect(
      classifyBaselineHistory([row(previousAtomicAdvanceBaseline), row(currentBaseline)])
    ).toBe("current");
    expect(classifyBaselineHistory([row(previousFlowSafetyBaseline)])).toBe("previous_flow_safety");
    expect(
      classifyBaselineHistory([row(previousFlowSafetyBaseline), row(previousAtomicAdvanceBaseline)])
    ).toBe("previous_atomic_advance");
    expect(classifyBaselineHistory([row(previousFlowSafetyBaseline), row(currentBaseline)])).toBe(
      "current"
    );
    expect(classifyBaselineHistory([row(previousCancellationKernelBaseline)])).toBe(
      "previous_cancellation_kernel"
    );
    expect(
      classifyBaselineHistory([row(previousCancellationKernelBaseline), row(currentBaseline)])
    ).toBe("current");
    expect(classifyBaselineHistory([row(previousRuntimeKernelBaseline)])).toBe(
      "previous_runtime_kernel"
    );
    expect(
      classifyBaselineHistory([row(previousRuntimeKernelBaseline), row(currentBaseline)])
    ).toBe("current");
    expect(classifyBaselineHistory([row(previousFlowDefinitionControlBaseline)])).toBe(
      "previous_flow_definition_control"
    );
    expect(
      classifyBaselineHistory([row(previousFlowDefinitionControlBaseline), row(currentBaseline)])
    ).toBe("current");
    expect(classifyBaselineHistory([row(previousBaseline), row(currentBaseline)])).toBe("current");
    expect(
      classifyBaselineHistory([row(priorBaseline), row(previousBaseline), row(currentBaseline)])
    ).toBe("current");
    expect(classifyBaselineHistory([row(previousBaseline)])).toBe("previous_current");
    expect(classifyBaselineHistory([row(priorBaseline), row(previousBaseline)])).toBe(
      "previous_current"
    );
    expect(
      classifyBaselineHistory([...approvedLegacyMigrations.map(row), row(natalChartEngineBaseline)])
    ).toBe("previous_current");
    expect(
      classifyBaselineHistory([
        ...approvedLegacyMigrations.map(row),
        row(natalChartEngineBaseline),
        row(currentBaseline)
      ])
    ).toBe("current");
    expect(
      classifyBaselineHistory([...approvedLegacyMigrations.map(row), row(previousBaseline)])
    ).toBe("previous_current");
    expect(classifyBaselineHistory(approvedLegacyMigrations.map(row))).toBe("legacy_calculations");
    expect(classifyBaselineHistory([{ hash: "f".repeat(64), created_at: "1" }])).toBe("unknown");
  });

  it("contains the owner-safe scheduling DDL and overlap invariant", () => {
    expect(schedulingBaselineDdl).toContain("ADD CONSTRAINT products_id_owner_unique");
    expect(schedulingBaselineDdl).toContain("CREATE TABLE IF NOT EXISTS availability_schedules");
    expect(schedulingBaselineDdl).toContain("CREATE TABLE IF NOT EXISTS manual_calendar_blocks");
    expect(schedulingBaselineDdl).toContain("CREATE TABLE IF NOT EXISTS bookings");
    expect(schedulingBaselineDdl).toContain("CREATE TABLE IF NOT EXISTS idempotency_commands");
    expect(schedulingBaselineDdl).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idempotency_commands_scope_key_unique"
    );
    expect(schedulingBaselineDdl).toContain("conname = 'products_id_owner_unique'");
    expect(schedulingBaselineDdl).toContain("schedule_reservations_active_owner_range_exclude");
    expect(schedulingBaselineDdl).toContain(
      "tstzrange(occupied_start_at, occupied_end_at, '[)') WITH &&"
    );
  });

  it("contains the canonical lossless Flows control-plane transition", () => {
    expect(flowDefinitionControlBaselineDdl).toContain("ADD COLUMN IF NOT EXISTS origin jsonb");
    expect(flowDefinitionControlBaselineDdl).toContain(
      "jsonb_set(draft_graph, '{schemaVersion}', '\"flow-graph.v1\"'::jsonb, true)"
    );
    expect(flowDefinitionControlBaselineDdl).toContain(
      "jsonb_set(graph, '{schemaVersion}', '\"flow-graph.v1\"'::jsonb, true)"
    );
    expect(flowDefinitionControlBaselineDdl).toContain(
      "CREATE TABLE flow_definition_command_outcomes"
    );
    expect(flowDefinitionControlBaselineDdl).toContain("CREATE TABLE flow_definition_migrations");
    expect(flowDefinitionControlBaselineDdl).toContain(
      "FOREIGN KEY (id, published_version_id, owner_user_id, published_at)"
    );
    expect(flowDefinitionControlBaselineDdl).toContain(
      "REFERENCES flow_versions(flow_id, id, owner_user_id, published_at) ON DELETE RESTRICT"
    );
    expect(flowDefinitionControlBaselineDdl).toContain(
      "CREATE INDEX IF NOT EXISTS flows_owner_definition_state_updated_idx"
    );
    expect(flowDefinitionControlBaselineDdl).toContain(
      'CREATE CONSTRAINT TRIGGER "flow_publication_pointer_consistency"'
    );
    expect(flowDefinitionControlBaselineDdl).toContain(
      'CREATE TRIGGER "flow_definition_commands_immutable_identity"'
    );
    expect(flowDefinitionControlBaselineDdl).toContain(
      'CREATE TRIGGER "flow_definition_migrations_immutable"'
    );
    expect(flowDefinitionControlBaselineDdl).toContain("flow-capability-manifest.v1");
    expect(flowDefinitionControlBaselineDdl).toContain("flow-capability-manifest.v2");
    expect(flowDefinitionControlBaselineDdl).toContain("executionSemanticsVersion");
    expect(flowDefinitionControlBaselineDdl).toContain("triggerMatcher");
    expect(flowDefinitionControlBaselineDdl).toContain("eventSchemaVersion");
    expect(flowDefinitionControlBaselineDdl).toContain("capability_manifest ?& ARRAY[");
    expect(flowDefinitionControlBaselineDdl).toContain("capability_manifest - ARRAY[");
    expect(flowDefinitionControlBaselineDdl).not.toContain("expires_at timestamptz");
  });

  it("contains the additive fail-closed capability-manifest transition", () => {
    expect(flowCapabilityManifestSafetyBaselineDdl).toContain(
      "ADD CONSTRAINT flow_versions_capability_manifest_schema_check"
    );
    expect(flowCapabilityManifestSafetyBaselineDdl).toContain("eventSchemaVersion");
    expect(flowCapabilityManifestSafetyBaselineDdl).toContain("NOT VALID");
    expect(flowCapabilityManifestSafetyBaselineDdl).toContain(
      "VALIDATE CONSTRAINT flow_versions_capability_manifest_schema_check"
    );
    expect(flowCapabilityManifestSafetyBaselineDdl).not.toMatch(
      /\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+flow_versions/
    );
  });

  it("contains the lossless terminal-token runtime transition without fabricating executions", () => {
    expect(flowExecutionRuntimeBaselineDdl).toContain(
      "ADD COLUMN trace_sequence bigint DEFAULT 0 NOT NULL"
    );
    expect(flowExecutionRuntimeBaselineDdl).toContain("CREATE TABLE flow_execution_tokens");
    expect(flowExecutionRuntimeBaselineDdl).toContain("CREATE TABLE flow_execution_attempts");
    expect(flowExecutionRuntimeBaselineDdl).toContain("CREATE TABLE flow_run_events");
    expect(flowExecutionRuntimeBaselineDdl).toContain(
      "CREATE UNIQUE INDEX flow_execution_attempts_token_attempt_unique"
    );
    expect(flowExecutionRuntimeBaselineDdl).toContain(
      'CREATE TRIGGER "flow_execution_attempts_immutable"'
    );
    expect(flowExecutionRuntimeBaselineDdl).toContain(
      'CREATE TRIGGER "flow_execution_attempts_truncate_guard"'
    );
    expect(flowExecutionRuntimeBaselineDdl).toContain('CREATE TRIGGER "flow_run_events_immutable"');
    expect(flowExecutionRuntimeBaselineDdl).toContain(
      'CREATE TRIGGER "flow_run_events_truncate_guard"'
    );
    expect(flowExecutionRuntimeBaselineDdl).toContain("result_code text NOT NULL");
    expect(flowExecutionRuntimeBaselineDdl).not.toContain("INSERT INTO flow_execution_tokens");
    expect(flowExecutionRuntimeBaselineDdl).not.toContain("UPDATE flow_runs SET status");
  });

  it("contains the durable cancellation transition without fabricating commands or history", () => {
    expect(flowRunCancellationBaselineDdl).toContain("CREATE TABLE flow_runtime_commands");
    expect(flowRunCancellationBaselineDdl).toContain("CREATE TABLE flow_runtime_command_outcomes");
    expect(flowRunCancellationBaselineDdl).toContain(
      "ALTER TABLE flow_run_events ADD COLUMN command_id uuid"
    );
    expect(flowRunCancellationBaselineDdl).toContain("flow_run_events_command_run_owner_fk");
    expect(flowRunCancellationBaselineDdl).toContain("FLOW_RUN_CANCELED_BY_OWNER");
    expect(flowRunCancellationBaselineDdl).toContain(
      'CREATE TRIGGER "flow_runtime_commands_immutable_identity"'
    );
    expect(flowRunCancellationBaselineDdl).toContain(
      'CREATE CONSTRAINT TRIGGER "flow_runtime_command_outcome_consistency"'
    );
    expect(flowRunCancellationBaselineDdl).not.toContain("INSERT INTO flow_runtime_commands");
    expect(flowRunCancellationBaselineDdl).not.toContain("INSERT INTO flow_run_events");
  });

  it("contains the lossless fenced outbox quarantine transition", () => {
    expect(flowOutboxSafetyBaselineDdl).toContain(
      "ADD COLUMN claim_fence bigint DEFAULT 0 NOT NULL"
    );
    expect(flowOutboxSafetyBaselineDdl).toContain("ADD COLUMN quarantine_reason_code text");
    expect(flowOutboxSafetyBaselineDdl).toContain("outbox_events_state_check");
    expect(flowOutboxSafetyBaselineDdl).toContain("outbox_events_claim_fence_check");
    expect(flowOutboxSafetyBaselineDdl).toContain("outbox_events_quarantined_index");
    expect(flowOutboxSafetyBaselineDdl).toContain("VALIDATE CONSTRAINT outbox_events_state_check");
    expect(flowOutboxSafetyBaselineDdl).not.toContain("UPDATE outbox_events");
    expect(flowOutboxSafetyBaselineDdl).not.toContain("INSERT INTO outbox_events");
    expect(flowOutboxSafetyBaselineDdl).not.toContain("DELETE FROM outbox_events");
  });

  it("contains the lossless pinned retry and poison-token transition", () => {
    expect(flowExecutionRetrySafetyBaselineDdl).toContain(
      "ADD COLUMN retry_policy_key text DEFAULT 'flow-execution-retry.v1' NOT NULL"
    );
    expect(flowExecutionRetrySafetyBaselineDdl).toContain(
      "flow_execution_tokens_failure_state_check"
    );
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("max_attempts = 3");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("retry_base_delay_ms = 1000");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("retry_max_delay_ms = 60000");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain(
      "attempt_counter BETWEEN 0 AND max_attempts"
    );
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("fencing_token >= attempt_counter");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("attempt_counter < max_attempts");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("claimed_at <= lease_expires_at");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("claimed_at <= updated_at");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("failure_disposition IS NOT NULL");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("failure_reason_code IS NOT NULL");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain(
      "VALIDATE CONSTRAINT flow_execution_tokens_lease_state_check"
    );
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("attempt_number BETWEEN 1 AND 3");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("fencing_token >= attempt_number");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain(
      "VALIDATE CONSTRAINT flow_execution_attempts_number_check"
    );
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("FLOW_EXECUTION_RETRY_SCHEDULED");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain("FLOW_EXECUTION_RETRY_EXHAUSTED");
    expect(flowExecutionRetrySafetyBaselineDdl).toContain(
      "VALIDATE CONSTRAINT flow_execution_attempts_trace_summary_schema_check"
    );
    expect(flowExecutionRetrySafetyBaselineDdl).toContain(
      "CREATE INDEX flow_execution_tokens_quarantined_idx"
    );
    expect(flowExecutionRetrySafetyBaselineDdl).not.toMatch(
      /\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+flow_(?:execution|run)/
    );
  });

  it("contains the lossless one-token atomic-advance transition", () => {
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain(
      "ADD COLUMN node_activation_sequence bigint DEFAULT 1 NOT NULL"
    );
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain(
      "ALTER COLUMN node_activation_sequence DROP DEFAULT"
    );
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain(
      "flow_execution_attempts_token_activation_attempt_unique"
    );
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain(
      "flow_execution_tokens_completed_node_check"
    );
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain(
      "DROP CONSTRAINT flow_execution_tokens_node_kind_check"
    );
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain(
      "VALIDATE CONSTRAINT flow_execution_tokens_node_kind_check"
    );
    expect(flowExecutionAtomicAdvanceBaselineDdl).not.toContain("'booking_confirmed'");
    expect(flowExecutionAtomicAdvanceBaselineDdl).not.toContain("'manual_client'");
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain("flow_run_events_attempt_unique");
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain("event_type = 'token_advanced'");
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain("outcome = 'advanced'");
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain("FLOW_TOKEN_ADVANCED");
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain(
      "jsonb_typeof(trace_summary->'sourceHandle') = 'string'"
    );
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain(
      "jsonb_typeof(summary->'selectedEdgeId') = 'string'"
    );
    expect(flowExecutionAtomicAdvanceBaselineDdl).toContain(
      "outcome = 'completed'\n          AND trace_summary->>'nodeKind' = 'completed'"
    );
    expect(flowExecutionAtomicAdvanceBaselineDdl).not.toMatch(
      /\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+flow_(?:execution|run)/
    );
    expect(flowExecutionSafetyBaselineDdl).toBe(
      `${flowExecutionRetrySafetyBaselineDdl}\n${flowExecutionAtomicAdvanceBaselineDdl}`
    );
  });

  it("contains the canonical runtime foundation transition without fabricating activity", () => {
    expect(flowRuntimeFoundationBaselineDdl).toContain("CREATE TABLE flow_runtime_events");
    expect(flowRuntimeFoundationBaselineDdl).toContain("CREATE TABLE flow_runs");
    expect(flowRuntimeFoundationBaselineDdl).toContain("CREATE TABLE flow_step_runs");
    expect(flowRuntimeFoundationBaselineDdl).toContain("CREATE TABLE flow_approvals");
    expect(flowRuntimeFoundationBaselineDdl).toContain("CREATE TABLE flow_delivery_attempts");
    expect(flowRuntimeFoundationBaselineDdl).toContain("CREATE TABLE flow_suppressions");
    expect(flowRuntimeFoundationBaselineDdl).not.toContain("INSERT INTO flow_runtime_events");
    expect(flowRuntimeFoundationBaselineDdl).not.toContain("INSERT INTO flow_runs");
  });
});

function row(migration: { readonly hash: string; readonly createdAt: string }): {
  readonly hash: string;
  readonly created_at: string;
} {
  return { hash: migration.hash, created_at: migration.createdAt };
}
