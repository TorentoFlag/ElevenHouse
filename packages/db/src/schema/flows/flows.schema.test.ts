import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  flowApprovals,
  flowDefinitionCommandOutcomes,
  flowDefinitionCommands,
  flowDefinitionCommandScopeValues,
  flowDefinitionRouteTemplateValues,
  flowDeliveryAttempts,
  flowExecutionAttempts,
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowRuntimeCommandOutcomes,
  flowRuntimeCommands,
  flowRuntimeCommandScopeValues,
  flowRuntimeCommandStateValues,
  flowRuntimeCommandRouteTemplateValues,
  flowRunEventTypeValues,
  flowRuntimeEvents,
  flowStepRuns,
  flowSuppressions,
  flowVersions,
  flows
} from "../index";
import { flowRunIntegritySql, flowRuntimeEventIntegritySql } from "./flow-runtime.schema";

const baselineMigrationFile = readCurrentMigrationSql();

describe("Flows persistence schema", () => {
  it("exports flow draft and immutable version tables", () => {
    expect(getTableName(flows)).toBe("flows");
    expect(getTableName(flowVersions)).toBe("flow_versions");

    expect(Object.keys(getTableColumns(flows))).toEqual(
      expect.arrayContaining([
        "ownerUserId",
        "name",
        "origin",
        "status",
        "definitionState",
        "approvalMode",
        "revision",
        "draftBaseVersionId",
        "draftGraph",
        "draftPresentation",
        "publishedVersionId",
        "publishedAt"
      ])
    );
    expect(Object.keys(getTableColumns(flowVersions))).toEqual(
      expect.arrayContaining([
        "flowId",
        "ownerUserId",
        "version",
        "sourceRevision",
        "approvalMode",
        "graphSchemaVersion",
        "graph",
        "presentation",
        "capabilityManifest",
        "publishedAt"
      ])
    );
    expect(getTableName(flowDefinitionCommands)).toBe("flow_definition_commands");
    expect(Object.keys(getTableColumns(flowDefinitionCommands))).toEqual(
      expect.arrayContaining([
        "apiSurface",
        "actorUserId",
        "ownerUserId",
        "routeTemplate",
        "resourceId",
        "commandScope",
        "idempotencyKey",
        "requestHash",
        "state",
        "completedAt",
        "replayUntil"
      ])
    );
    expect(Object.keys(getTableColumns(flowDefinitionCommands))).not.toEqual(
      expect.arrayContaining(["responseStatus", "responseBody", "expiresAt"])
    );

    expect(getTableName(flowDefinitionCommandOutcomes)).toBe("flow_definition_command_outcomes");
    expect(Object.keys(getTableColumns(flowDefinitionCommandOutcomes))).toEqual(
      expect.arrayContaining(["commandId", "responseStatus", "responseBody", "createdAt"])
    );
  });

  it("defines owner indexes, immutable version uniqueness and value checks", () => {
    const flowConfig = getTableConfig(flows);
    const versionConfig = getTableConfig(flowVersions);
    const commandConfig = getTableConfig(flowDefinitionCommands);
    const outcomeConfig = getTableConfig(flowDefinitionCommandOutcomes);

    expect(flowConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flows_owner_status_updated_idx",
        "flows_owner_definition_state_updated_idx",
        "flows_owner_name_idx"
      ])
    );
    expect(versionConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_versions_owner_published_idx",
        "flow_versions_flow_version_unique",
        "flow_versions_flow_source_revision_unique"
      ])
    );
    expect(commandConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_definition_commands_scope_key_unique",
        "flow_definition_commands_replay_until_idx",
        "flow_definition_commands_owner_resource_created_idx"
      ])
    );
    expect(outcomeConfig.indexes.map((index) => index.config.name)).toContain(
      "flow_definition_command_outcomes_created_idx"
    );
    expect(flowConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flows_status_check",
        "flows_definition_state_check",
        "flows_revision_check",
        "flows_definition_lifecycle_check",
        "flows_graph_origin_check",
        "flows_approval_mode_check",
        "flows_draft_graph_object_check",
        "flows_draft_presentation_object_check"
      ])
    );
    expect(versionConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flow_versions_approval_mode_check",
        "flow_versions_positive_version_check",
        "flow_versions_source_revision_check",
        "flow_versions_v2_metadata_check",
        "flow_versions_capability_manifest_schema_check",
        "flow_versions_graph_object_check",
        "flow_versions_presentation_object_check"
      ])
    );
    const versionManifestCheck = versionConfig.checks.find(
      (check) => check.name === "flow_versions_capability_manifest_schema_check"
    );
    expect(versionManifestCheck).toBeDefined();
    const versionManifestSql = new PgDialect().sqlToQuery(versionManifestCheck!.value).sql;
    expect(versionManifestSql).toContain("flow-capability-manifest.v2");
    expect(versionManifestSql).toContain("executionSemanticsVersion");
    expect(versionManifestSql).toContain("triggerMatcher");
    expect(versionManifestSql).toContain("eventSchemaVersion");
    expect(versionManifestSql).toContain("jsonb_typeof");
    expect(versionManifestSql).toContain("?&");
    expect(versionManifestSql).toContain("- ARRAY");
    expect(commandConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flow_definition_commands_scope_check",
        "flow_definition_commands_key_check",
        "flow_definition_commands_request_hash_check",
        "flow_definition_commands_state_check",
        "flow_definition_commands_terminal_state_check",
        "flow_definition_commands_replay_window_check"
      ])
    );
    expect(outcomeConfig.checks.map((check) => check.name)).toContain(
      "flow_definition_command_outcomes_response_check"
    );
    expect(flowConfig.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "flows_published_version_owner_fk",
        "flows_draft_base_version_owner_fk"
      ])
    );
    expect(
      flowConfig.foreignKeys
        .find((key) => key.getName() === "flows_published_version_owner_fk")
        ?.reference()
        .columns.map((column) => column.name)
    ).toEqual(["id", "published_version_id", "owner_user_id", "published_at"]);
    expect(
      flowConfig.foreignKeys
        .find((key) => key.getName() === "flows_published_version_owner_fk")
        ?.reference()
        .foreignColumns.map((column) => column.name)
    ).toEqual(["flow_id", "id", "owner_user_id", "published_at"]);
    expect(versionConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "flow_versions_flow_id_id_owner_published_unique"
    );
    expect(outcomeConfig.foreignKeys.map((key) => key.getName())).toContain(
      "flow_definition_command_outcomes_command_fk"
    );

    expect(flowDefinitionCommandScopeValues).toEqual([
      "flows.definition.create.v2",
      "flows.definition.update-draft.v2",
      "flows.definition.publish.v2",
      "flows.definition.create-next-draft.v2"
    ]);
    expect(flowDefinitionRouteTemplateValues).toEqual([
      "/flows",
      "/flows/:flowId/draft",
      "/flows/:flowId/publish",
      "/flows/:flowId/next-draft"
    ]);
  });

  it("exports owner-scoped runtime tables with immutable run references", () => {
    expect(getTableName(flowRuntimeEvents)).toBe("flow_runtime_events");
    expect(getTableName(flowRuns)).toBe("flow_runs");
    expect(getTableName(flowStepRuns)).toBe("flow_step_runs");
    expect(getTableName(flowApprovals)).toBe("flow_approvals");
    expect(getTableName(flowDeliveryAttempts)).toBe("flow_delivery_attempts");
    expect(getTableName(flowSuppressions)).toBe("flow_suppressions");

    for (const table of [
      flowRuntimeEvents,
      flowRuns,
      flowStepRuns,
      flowApprovals,
      flowDeliveryAttempts,
      flowSuppressions
    ]) {
      expect(Object.keys(getTableColumns(table))).toContain("ownerUserId");
    }

    expect(Object.keys(getTableColumns(flowDeliveryAttempts))).toContain("idempotencyKey");
    expect(Object.keys(getTableColumns(flowRuntimeEvents))).toEqual(
      expect.arrayContaining([
        "eventKind",
        "occurrenceKey",
        "payloadSchemaVersion",
        "payloadDigest",
        "classification",
        "redactionVersion",
        "retentionPolicyId",
        "ingestionOutcome",
        "processedAt"
      ])
    );
    expect(Object.keys(getTableColumns(flowRuns))).toEqual(
      expect.arrayContaining([
        "activationEpochId",
        "triggerNodeId",
        "occurrenceKey",
        "enrollmentPolicyKey",
        "enrollmentPolicyRevision",
        "executionAuthorityBasis",
        "executionAuthorityRefId"
      ])
    );
    expect(getTableConfig(flowRuntimeEvents).indexes.map((index) => index.config.name)).toContain(
      "flow_runtime_events_owner_dedupe_unique"
    );
    expect(getTableConfig(flowRuntimeEvents).indexes.map((index) => index.config.name)).toContain(
      "flow_runtime_events_source_identity_unique"
    );
    expect(getTableConfig(flowRuns).indexes.map((index) => index.config.name)).toContain(
      "flow_runs_owner_flow_event_unique"
    );
    expect(getTableConfig(flowRuns).indexes.map((index) => index.config.name)).toContain(
      "flow_runs_owner_stable_enrollment_unique"
    );
    expect(getTableConfig(flowSuppressions).indexes.map((index) => index.config.name)).toContain(
      "flow_suppressions_owner_flow_event_reason_unique"
    );
    expect(getTableConfig(flowRuns).foreignKeys.map((key) => key.getName())).toContain(
      "flow_runs_flow_version_owner_fk"
    );
    expect(getTableConfig(flowRuns).foreignKeys.map((key) => key.getName())).toContain(
      "flow_runs_activation_epoch_fk"
    );
    expect(getTableConfig(flowRuntimeEvents).checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flow_runtime_events_normalized_shape_check",
        "flow_runtime_events_payload_digest_check"
      ])
    );
    expect(getTableConfig(flowRuns).checks.map((check) => check.name)).toContain(
      "flow_runs_enrollment_shape_check"
    );
    expect(getTableConfig(flowStepRuns).foreignKeys.map((key) => key.getName())).toContain(
      "flow_step_runs_run_owner_fk"
    );
    expect(getTableConfig(flowApprovals).foreignKeys.map((key) => key.getName())).toContain(
      "flow_approvals_run_owner_fk"
    );
  });

  it("retains runtime ingestion evidence as append-only data for the owner lifetime", () => {
    expect(flowRuntimeEventIntegritySql).toContain(
      'CREATE TRIGGER "flow_runtime_events_immutable"'
    );
    expect(flowRuntimeEventIntegritySql).toContain(
      'CREATE TRIGGER "flow_runtime_events_truncate_guard"'
    );
    expect(flowRuntimeEventIntegritySql).toContain("IF TG_OP = 'UPDATE'");
    expect(flowRuntimeEventIntegritySql).toContain(
      "EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_user_id)"
    );
  });

  it("defines a durable runtime command ledger for run and human-work replay", () => {
    expect(getTableName(flowRuntimeCommands)).toBe("flow_runtime_commands");
    expect(getTableName(flowRuntimeCommandOutcomes)).toBe("flow_runtime_command_outcomes");
    expect(Object.keys(getTableColumns(flowRuntimeCommands))).toEqual(
      expect.arrayContaining([
        "apiSurface",
        "actorUserId",
        "ownerUserId",
        "routeTemplate",
        "resourceId",
        "flowRunId",
        "commandScope",
        "idempotencyKey",
        "requestHash",
        "state",
        "completedAt",
        "replayUntil"
      ])
    );
    expect(Object.keys(getTableColumns(flowRuntimeCommandOutcomes))).toEqual(
      expect.arrayContaining(["commandId", "responseStatus", "responseBody", "createdAt"])
    );

    const commandConfig = getTableConfig(flowRuntimeCommands);
    const outcomeConfig = getTableConfig(flowRuntimeCommandOutcomes);
    expect(commandConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_runtime_commands_scope_key_unique",
        "flow_runtime_commands_replay_until_idx",
        "flow_runtime_commands_owner_resource_created_idx"
      ])
    );
    expect(commandConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flow_runtime_commands_scope_check",
        "flow_runtime_commands_key_check",
        "flow_runtime_commands_request_hash_check",
        "flow_runtime_commands_state_check",
        "flow_runtime_commands_terminal_state_check",
        "flow_runtime_commands_replay_window_check"
      ])
    );
    expect(outcomeConfig.checks.map((check) => check.name)).toContain(
      "flow_runtime_command_outcomes_response_check"
    );
    expect(outcomeConfig.foreignKeys.map((key) => key.getName())).toContain(
      "flow_runtime_command_outcomes_command_fk"
    );
    expect(commandConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "flow_runtime_commands_id_run_owner_unique"
    );
    expect(flowRuntimeCommandScopeValues).toEqual([
      "flows.runtime.cancel.v1",
      "flows.work-items.start.v1",
      "flows.work-items.snooze.v1",
      "flows.work-items.complete.v1"
    ]);
    expect(flowRuntimeCommandRouteTemplateValues).toEqual([
      "/flow-runs/:runId/cancel",
      "/flow-work-items/:workItemId/start",
      "/flow-work-items/:workItemId/snooze",
      "/flow-work-items/:workItemId/complete"
    ]);
    expect(flowRuntimeCommandStateValues).toEqual(["processing", "succeeded", "failed"]);
  });

  it("defines the fenced V2 token, append-only attempt and monotonic trace spine", () => {
    expect(getTableName(flowExecutionTokens)).toBe("flow_execution_tokens");
    expect(getTableName(flowExecutionAttempts)).toBe("flow_execution_attempts");
    expect(getTableName(flowRunEvents)).toBe("flow_run_events");

    expect(Object.keys(getTableColumns(flowRuns))).toContain("traceSequence");
    expect(Object.keys(getTableColumns(flowExecutionTokens))).toEqual(
      expect.arrayContaining([
        "ownerUserId",
        "flowRunId",
        "flowVersionId",
        "nodeId",
        "nodeKind",
        "executorKey",
        "state",
        "availableAt",
        "claimedAt",
        "leaseOwner",
        "leaseExpiresAt",
        "claimControlPolicyRevision",
        "claimPolicyDigest",
        "claimWorkerSessionId",
        "claimWorkerRegistrationDigest",
        "nodeActivationSequence",
        "attemptCounter",
        "fencingToken",
        "retryPolicyKey",
        "maxAttempts",
        "retryBaseDelayMs",
        "retryMaxDelayMs",
        "failureDisposition",
        "failureReasonCode",
        "terminalAt",
        "quarantinedAt"
      ])
    );
    expect(Object.keys(getTableColumns(flowExecutionAttempts))).toEqual(
      expect.arrayContaining([
        "flowRunId",
        "tokenId",
        "flowVersionId",
        "nodeId",
        "executorKey",
        "nodeActivationSequence",
        "attemptNumber",
        "fencingToken",
        "leaseOwner",
        "controlPolicyRevision",
        "policyDigest",
        "workerSessionId",
        "workerRegistrationDigest",
        "outcome",
        "traceSummary",
        "startedAt",
        "completedAt"
      ])
    );
    expect(Object.keys(getTableColumns(flowRunEvents))).toEqual(
      expect.arrayContaining([
        "flowRunId",
        "sequence",
        "eventType",
        "nodeId",
        "attemptId",
        "commandId",
        "summary",
        "occurredAt"
      ])
    );

    expect(getTableConfig(flowExecutionTokens).indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_execution_tokens_run_unique",
        "flow_execution_tokens_runnable_idx",
        "flow_execution_tokens_expired_lease_idx",
        "flow_execution_tokens_quarantined_idx"
      ])
    );
    expect(getTableConfig(flowExecutionAttempts).indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_execution_attempts_token_activation_attempt_unique",
        "flow_execution_attempts_token_fence_unique"
      ])
    );
    expect(getTableConfig(flowRunEvents).indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_run_events_run_sequence_unique",
        "flow_run_events_attempt_unique",
        "flow_run_events_command_unique"
      ])
    );
    expect(
      getTableConfig(flowRunEvents).uniqueConstraints.map((constraint) => constraint.name)
    ).toContain("flow_run_events_id_run_owner_unique");
    expect(flowRunEventTypeValues).toContain("work_item_available");
    expect(flowRunEventTypeValues).toContain("booking_rescheduled");
    expect(getTableColumns(flowExecutionAttempts).resultCode.notNull).toBe(true);
    expect(getTableColumns(flowExecutionTokens).retryPolicyKey.default).toBe(
      "flow-execution-retry.v1"
    );
    expect(getTableColumns(flowExecutionTokens).maxAttempts.default).toBe(3);

    expect(getTableConfig(flowExecutionTokens).checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flow_execution_tokens_state_check",
        "flow_execution_tokens_node_kind_check",
        "flow_execution_tokens_executor_key_check",
        "flow_execution_tokens_lease_state_check",
        "flow_execution_tokens_claim_authority_check",
        "flow_execution_tokens_node_activation_sequence_check",
        "flow_execution_tokens_attempt_counter_check",
        "flow_execution_tokens_fencing_token_check",
        "flow_execution_tokens_counter_state_check",
        "flow_execution_tokens_retry_policy_check",
        "flow_execution_tokens_failure_disposition_check",
        "flow_execution_tokens_failure_reason_check",
        "flow_execution_tokens_failure_state_check"
      ])
    );
    expect(getTableConfig(flowExecutionAttempts).checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flow_execution_attempts_outcome_check",
        "flow_execution_attempts_node_activation_sequence_check",
        "flow_execution_attempts_number_check",
        "flow_execution_attempts_claim_authority_check",
        "flow_execution_attempts_trace_summary_object_check"
      ])
    );
    expect(getTableConfig(flowRunEvents).checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flow_run_events_type_check",
        "flow_run_events_sequence_check",
        "flow_run_events_summary_object_check"
      ])
    );
    const runEventSummaryCheck = getTableConfig(flowRunEvents).checks.find(
      (check) => check.name === "flow_run_events_summary_schema_check"
    );
    expect(runEventSummaryCheck).toBeDefined();
    expect(new PgDialect().sqlToQuery(runEventSummaryCheck!.value).sql).toContain(
      "FLOW_WORK_ITEM_COMPLETED"
    );
    expect(new PgDialect().sqlToQuery(runEventSummaryCheck!.value).sql).toContain(
      "FLOW_WORK_ITEM_SNOOZE_ELAPSED"
    );
    expect(new PgDialect().sqlToQuery(runEventSummaryCheck!.value).sql).toContain(
      "FLOW_BOOKING_RESCHEDULED"
    );

    expect(getTableConfig(flowExecutionTokens).foreignKeys.map((key) => key.getName())).toContain(
      "flow_execution_tokens_run_version_owner_fk"
    );
    expect(getTableConfig(flowExecutionTokens).foreignKeys.map((key) => key.getName())).toContain(
      "flow_execution_tokens_claim_policy_fk"
    );
    expect(getTableConfig(flowExecutionAttempts).foreignKeys.map((key) => key.getName())).toContain(
      "flow_execution_attempts_token_run_owner_fk"
    );
    expect(getTableConfig(flowExecutionAttempts).foreignKeys.map((key) => key.getName())).toContain(
      "flow_execution_attempts_claim_policy_fk"
    );
    expect(getTableConfig(flowRunEvents).foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "flow_run_events_run_owner_fk",
        "flow_run_events_attempt_run_owner_fk",
        "flow_run_events_command_run_owner_fk"
      ])
    );
  });

  it("enforces owner-scoped runtime lineage with composite identities and foreign keys", () => {
    expect(getTableConfig(flows).uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "flows_id_owner_unique"
    );
    expect(
      getTableConfig(flowVersions).uniqueConstraints.map((constraint) => constraint.name)
    ).toEqual(
      expect.arrayContaining([
        "flow_versions_id_owner_unique",
        "flow_versions_flow_id_id_owner_unique"
      ])
    );
    expect(
      getTableConfig(flowRuntimeEvents).uniqueConstraints.map((constraint) => constraint.name)
    ).toContain("flow_runtime_events_id_owner_unique");
    expect(getTableConfig(flowRuns).uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "flow_runs_id_owner_unique",
        "flow_runs_id_event_owner_unique",
        "flow_runs_id_flow_event_owner_unique"
      ])
    );
    expect(
      getTableConfig(flowStepRuns).uniqueConstraints.map((constraint) => constraint.name)
    ).toEqual(
      expect.arrayContaining([
        "flow_step_runs_id_owner_unique",
        "flow_step_runs_id_run_owner_unique"
      ])
    );

    expect(getTableConfig(flowVersions).foreignKeys.map((key) => key.getName())).toContain(
      "flow_versions_flow_owner_fk"
    );
    expect(getTableConfig(flows).foreignKeys.map((key) => key.getName())).toContain(
      "flows_published_version_owner_fk"
    );
    expect(getTableConfig(flowRuns).foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "flow_runs_flow_owner_fk",
        "flow_runs_flow_version_owner_fk",
        "flow_runs_runtime_event_owner_fk"
      ])
    );
    expect(getTableConfig(flowStepRuns).foreignKeys.map((key) => key.getName())).toContain(
      "flow_step_runs_run_owner_fk"
    );
    expect(getTableConfig(flowApprovals).foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining(["flow_approvals_run_owner_fk", "flow_approvals_step_run_owner_fk"])
    );
    expect(getTableConfig(flowDeliveryAttempts).foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "flow_delivery_attempts_run_owner_fk",
        "flow_delivery_attempts_step_run_owner_fk"
      ])
    );
    expect(getTableConfig(flowSuppressions).foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "flow_suppressions_flow_owner_fk",
        "flow_suppressions_runtime_event_owner_fk",
        "flow_suppressions_run_event_owner_fk"
      ])
    );
  });

  it("keeps Flows DDL in the single current baseline", () => {
    const migration = baselineMigrationFile;

    expect(migration).toContain('CREATE TABLE "flows"');
    expect(migration).toContain('CREATE TABLE "flow_versions"');
    expect(migration).toContain('CREATE TABLE "flow_definition_commands"');
    expect(migration).toContain('CREATE TABLE "flow_definition_command_outcomes"');
    expect(migration).toContain("flows_status_check");
    expect(migration).toContain("flow_versions_flow_version_unique");
    expect(migration).toContain("flow_versions_flow_source_revision_unique");
    expect(migration).toContain("flow_definition_commands_scope_key_unique");
    expect(migration).toContain("flow_definition_commands_terminal_state_check");
    expect(migration).toContain("flow_definition_command_outcomes_response_check");
    expect(migration).toContain("flows_graph_origin_check");
    expect(migration).toContain("flow_versions_flow_id_id_owner_published_unique");

    for (const table of [
      "flow_runtime_events",
      "flow_runs",
      "flow_execution_tokens",
      "flow_execution_attempts",
      "flow_run_events",
      "flow_step_runs",
      "flow_approvals",
      "flow_delivery_attempts",
      "flow_suppressions"
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "flow_runtime_events_owner_dedupe_unique" ON "flow_runtime_events" USING btree ("owner_user_id","dedupe_key")'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "flow_runs_owner_flow_event_unique" ON "flow_runs" USING btree ("owner_user_id","flow_id","runtime_event_id")'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "flow_suppressions_owner_flow_event_reason_unique" ON "flow_suppressions" USING btree ("owner_user_id","flow_id","runtime_event_id","reason")'
    );
    expect(migration).toContain(
      'FOREIGN KEY ("flow_id","flow_version_id","owner_user_id") REFERENCES "public"."flow_versions"("flow_id","id","owner_user_id")'
    );
    expect(migration).toContain(
      'FOREIGN KEY ("flow_run_id","owner_user_id") REFERENCES "public"."flow_runs"("id","owner_user_id")'
    );
    expect(migration).toContain('"idempotency_key" text NOT NULL');
    expect(migration).toContain(
      '"flow_execution_tokens"."retry_policy_key" = \'flow-execution-retry.v1\''
    );
    expect(migration).toContain('"flow_execution_tokens"."max_attempts" = 3');
    expect(migration).toContain('"flow_execution_tokens"."retry_base_delay_ms" = 1000');
    expect(migration).toContain('"flow_execution_tokens"."retry_max_delay_ms" = 60000');
    expect(migration).toContain(
      '"flow_execution_tokens"."attempt_counter" between 0 and "flow_execution_tokens"."max_attempts"'
    );
    expect(migration).toContain(
      '"flow_execution_tokens"."fencing_token" >= "flow_execution_tokens"."attempt_counter"'
    );
    expect(migration).toContain('CONSTRAINT "flow_execution_tokens_counter_state_check"');
    expect(migration).toContain(
      '"flow_execution_tokens"."state" not in (\'runnable\', \'retry_scheduled\')\n          or "flow_execution_tokens"."attempt_counter" < "flow_execution_tokens"."max_attempts"'
    );
    expect(migration).not.toContain('"flow_execution_tokens"."retry_policy_key" = $1');
    expect(migration).toContain(
      "'FLOW_RUN_CANCELED_BY_OWNER', 'FLOW_BOOKING_CANCELED'"
    );

    for (const constraint of [
      "flows_id_owner_unique",
      "flow_versions_id_owner_unique",
      "flow_versions_flow_id_id_owner_unique",
      "flows_published_version_owner_fk",
      "flows_draft_base_version_owner_fk",
      "flow_runtime_events_id_owner_unique",
      "flow_runs_id_owner_unique",
      "flow_runs_id_event_owner_unique",
      "flow_runs_id_flow_event_owner_unique",
      "flow_runs_id_version_owner_unique",
      "flow_execution_tokens_id_run_owner_unique",
      "flow_execution_attempts_id_run_owner_unique",
      "flow_step_runs_id_owner_unique",
      "flow_step_runs_id_run_owner_unique",
      "flow_versions_flow_owner_fk",
      "flow_runs_flow_owner_fk",
      "flow_runs_flow_version_owner_fk",
      "flow_runs_runtime_event_owner_fk",
      "flow_execution_tokens_run_version_owner_fk",
      "flow_execution_attempts_token_run_owner_fk",
      "flow_run_events_run_owner_fk",
      "flow_run_events_attempt_run_owner_fk",
      "flow_step_runs_run_owner_fk",
      "flow_approvals_run_owner_fk",
      "flow_approvals_step_run_owner_fk",
      "flow_delivery_attempts_run_owner_fk",
      "flow_delivery_attempts_step_run_owner_fk",
      "flow_suppressions_flow_owner_fk",
      "flow_suppressions_runtime_event_owner_fk",
      "flow_suppressions_run_event_owner_fk"
    ]) {
      expect(migration).toContain(`CONSTRAINT "${constraint}"`);
    }
    expect(migration).toContain(
      'FOREIGN KEY ("id","published_version_id","owner_user_id","published_at") REFERENCES "public"."flow_versions"("flow_id","id","owner_user_id","published_at")'
    );
    expect(migration).toContain('CREATE TRIGGER "flow_versions_immutable_update"');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "flow_publication_pointer_consistency"');
    expect(migration).toContain('CREATE TRIGGER "flow_definition_commands_immutable_identity"');
    expect(migration).toContain(
      'CREATE CONSTRAINT TRIGGER "flow_definition_command_outcome_consistency"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "flow_execution_tokens_run_unique" ON "flow_execution_tokens"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "flow_execution_attempts_token_fence_unique" ON "flow_execution_attempts"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "flow_execution_attempts_token_activation_attempt_unique" ON "flow_execution_attempts"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "flow_run_events_run_sequence_unique" ON "flow_run_events"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "flow_run_events_attempt_unique" ON "flow_run_events"'
    );
    expect(migration).toContain('CREATE TRIGGER "flow_execution_attempts_immutable"');
    expect(migration).toContain('CREATE TRIGGER "flow_execution_attempts_truncate_guard"');
    expect(migration).toContain('CREATE TRIGGER "flow_run_events_immutable"');
    expect(migration).toContain('CREATE TRIGGER "flow_run_events_truncate_guard"');
    expect(migration).toContain('CREATE TRIGGER "flow_runs_enrollment_immutable"');
    expect(migration).toContain('CREATE CONSTRAINT TRIGGER "flow_run_event_command_consistency"');
    expect(migration).toContain("cancellation event requires a succeeded runtime command");
    expect(migration).toContain('"result_code" text NOT NULL');
  });

  it("protects the immutable Flow enrollment snapshot and identity in PostgreSQL", () => {
    expect(flowRunIntegritySql).toContain("OLD.snapshot");
    expect(flowRunIntegritySql).toContain("OLD.runtime_event_id");
    expect(flowRunIntegritySql).toContain("OLD.activation_epoch_id");
    expect(flowRunIntegritySql).toContain("NEW.trace_sequence < OLD.trace_sequence");
    expect(flowRunIntegritySql).toContain('CREATE TRIGGER "flow_runs_enrollment_immutable"');
  });
});
