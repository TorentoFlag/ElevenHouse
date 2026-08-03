import { readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  flowApprovals,
  flowDefinitionCommandOutcomes,
  flowDefinitionCommands,
  flowDefinitionCommandScopeValues,
  flowDefinitionMigrations,
  flowDefinitionRouteTemplateValues,
  flowDeliveryAttempts,
  flowRuns,
  flowRuntimeEvents,
  flowStepRuns,
  flowSuppressions,
  flowVersions,
  flows
} from "../index";

const baselineMigrationFile = "packages/db/drizzle/0000_sticky_rictor.sql";

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

    expect(getTableName(flowDefinitionMigrations)).toBe("flow_definition_migrations");
    expect(Object.keys(getTableColumns(flowDefinitionMigrations))).toEqual(
      expect.arrayContaining([
        "flowId",
        "ownerUserId",
        "commandId",
        "sourceGraphSchemaVersion",
        "targetGraphSchemaVersion",
        "sourceVersionId",
        "sourceRevision",
        "sourceGraphHash",
        "targetRevision",
        "migratedAt"
      ])
    );
  });

  it("defines owner indexes, immutable version uniqueness and value checks", () => {
    const flowConfig = getTableConfig(flows);
    const versionConfig = getTableConfig(flowVersions);
    const commandConfig = getTableConfig(flowDefinitionCommands);
    const outcomeConfig = getTableConfig(flowDefinitionCommandOutcomes);
    const migrationConfig = getTableConfig(flowDefinitionMigrations);

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
    expect(migrationConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_definition_migrations_flow_target_revision_unique",
        "flow_definition_migrations_owner_migrated_idx"
      ])
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
        "flow_versions_graph_object_check",
        "flow_versions_presentation_object_check"
      ])
    );
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
    expect(migrationConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flow_definition_migrations_schema_versions_check",
        "flow_definition_migrations_revision_check",
        "flow_definition_migrations_graph_hash_check"
      ])
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
    expect(migrationConfig.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "flow_definition_migrations_flow_owner_fk",
        "flow_definition_migrations_source_version_owner_fk",
        "flow_definition_migrations_command_resource_owner_fk"
      ])
    );

    expect(flowDefinitionCommandScopeValues).toEqual([
      "flows.definition.create.v2",
      "flows.definition.update-draft.v2",
      "flows.definition.publish.v2",
      "flows.definition.create-next-draft.v2",
      "flows.definition.migrate.v2"
    ]);
    expect(flowDefinitionRouteTemplateValues).toEqual([
      "/flows",
      "/flows/:flowId/draft",
      "/flows/:flowId/publish",
      "/flows/:flowId/next-draft",
      "/flows/:flowId/migrations/v2"
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
    expect(getTableConfig(flowRuntimeEvents).indexes.map((index) => index.config.name)).toContain(
      "flow_runtime_events_owner_dedupe_unique"
    );
    expect(getTableConfig(flowRuns).indexes.map((index) => index.config.name)).toContain(
      "flow_runs_owner_flow_event_unique"
    );
    expect(getTableConfig(flowSuppressions).indexes.map((index) => index.config.name)).toContain(
      "flow_suppressions_owner_flow_event_reason_unique"
    );
    expect(getTableConfig(flowRuns).foreignKeys.map((key) => key.getName())).toContain(
      "flow_runs_flow_version_owner_fk"
    );
    expect(getTableConfig(flowStepRuns).foreignKeys.map((key) => key.getName())).toContain(
      "flow_step_runs_run_owner_fk"
    );
    expect(getTableConfig(flowApprovals).foreignKeys.map((key) => key.getName())).toContain(
      "flow_approvals_run_owner_fk"
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
    const migration = readFileSync(baselineMigrationFile, "utf8");

    expect(migration).toContain('CREATE TABLE "flows"');
    expect(migration).toContain('CREATE TABLE "flow_versions"');
    expect(migration).toContain('CREATE TABLE "flow_definition_commands"');
    expect(migration).toContain('CREATE TABLE "flow_definition_command_outcomes"');
    expect(migration).toContain('CREATE TABLE "flow_definition_migrations"');
    expect(migration).toContain("flows_status_check");
    expect(migration).toContain("flow_versions_flow_version_unique");
    expect(migration).toContain("flow_versions_flow_source_revision_unique");
    expect(migration).toContain("flow_definition_commands_scope_key_unique");
    expect(migration).toContain("flow_definition_commands_terminal_state_check");
    expect(migration).toContain("flow_definition_command_outcomes_response_check");
    expect(migration).toContain("flow_definition_migrations_revision_check");
    expect(migration).toContain("flows_graph_origin_check");
    expect(migration).toContain("flow_versions_flow_id_id_owner_published_unique");

    for (const table of [
      "flow_runtime_events",
      "flow_runs",
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
      "flow_step_runs_id_owner_unique",
      "flow_step_runs_id_run_owner_unique",
      "flow_versions_flow_owner_fk",
      "flow_runs_flow_owner_fk",
      "flow_runs_flow_version_owner_fk",
      "flow_runs_runtime_event_owner_fk",
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
    expect(migration).toContain('CREATE TRIGGER "flow_definition_migrations_immutable"');
  });
});
