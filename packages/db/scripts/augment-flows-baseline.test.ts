import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  augmentFlowsBaseline,
  flowEnrollmentTraceConstraintIntegritySql
} from "./augment-flows-baseline";
import { flowWorkItemIntegritySql } from "../src/schema/flows/flow-work-items.schema";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("Flows baseline augmenter", () => {
  it("adds canonical integrity functions and triggers exactly once", async () => {
    const migrationPath = await createFixture(canonicalFixture);

    await augmentFlowsBaseline(migrationPath);
    await augmentFlowsBaseline(migrationPath);

    const migration = await readFile(migrationPath, "utf8");
    for (const statement of [
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
      'CREATE CONSTRAINT TRIGGER "flow_runtime_command_event_consistency"',
      'CREATE CONSTRAINT TRIGGER "flow_run_event_command_consistency"',
      'CREATE TRIGGER "flow_runs_enrollment_immutable"',
      'CREATE TRIGGER "flow_runtime_events_immutable"',
      'CREATE TRIGGER "flow_runtime_events_truncate_guard"',
      'CREATE TRIGGER "flow_execution_attempts_immutable"',
      'CREATE TRIGGER "flow_execution_attempts_truncate_guard"',
      'CREATE TRIGGER "flow_run_events_immutable"',
      'CREATE TRIGGER "flow_run_events_truncate_guard"',
      'CREATE TRIGGER "flow_work_items_transition_guard"',
      'CREATE TRIGGER "flow_work_items_truncate_guard"',
      'CREATE CONSTRAINT TRIGGER "flow_work_items_command_consistency"',
      'CREATE CONSTRAINT TRIGGER "flow_runtime_commands_work_item_consistency"',
      "create trigger flow_enrollment_commands_prepare",
      "create constraint trigger flow_enrollment_commands_outcome_consistency",
      "create constraint trigger flow_activation_epochs_command_provenance",
      "create constraint trigger flow_enrollment_controls_provenance",
      "create trigger flow_automation_quota_authorities_transition_guard",
      "create constraint trigger flow_automation_quota_authorities_consistency"
    ]) {
      expect(migration.split(statement)).toHaveLength(2);
    }
    expect(flowEnrollmentTraceConstraintIntegritySql).toContain(
      "ADD CONSTRAINT flow_execution_attempts_trace_summary_schema_check"
    );
    expect(flowEnrollmentTraceConstraintIntegritySql).toContain(
      "ADD CONSTRAINT flow_run_events_type_check"
    );
    expect(flowEnrollmentTraceConstraintIntegritySql).toContain("FLOW_WAITING_WORK_ITEM");
    expect(flowEnrollmentTraceConstraintIntegritySql).toContain("'run_enrolled'");
    expect(flowEnrollmentTraceConstraintIntegritySql).toContain(
      "'flow-enrollment-trace.v1'"
    );
    expect(migration).toContain("OLD.flow_run_id");
    expect(migration).toContain("flows.work-items.complete.v1");
    expect(migration).toContain("FLOW_WORK_ITEM_COMPLETED");
    expect(migration).toContain("attempt.trace_summary->>'reasonCode' = 'FLOW_BOOKING_CANCELED'");
    expect(migration).toContain(
      "OLD.status = 'pending' AND NEW.status IN ('in_progress', 'snoozed', 'expired', 'canceled')"
    );
    expect(migration).toContain(
      "OLD.status = 'in_progress' AND NEW.status IN ('snoozed', 'completed', 'expired', 'canceled')"
    );
    expect(migration).toContain(
      "OLD.status = 'snoozed' AND NEW.status IN ('snoozed', 'expired', 'canceled')"
    );
    expect(migration).toContain("succeeded flow command requires exactly one durable event");
    expect(migration).toContain("semantic_replay_event_count");
    expect(migration).toContain("current_outcome.response_body->'run'->>'status' = 'canceled'");
    expect(migration).toContain(flowEnrollmentTraceConstraintIntegritySql);
  });

  it("fails closed when the generated publication reference is not canonical", async () => {
    const migrationPath = await createFixture(
      canonicalFixture.replace(
        'FOREIGN KEY ("id","published_version_id","owner_user_id","published_at")',
        'FOREIGN KEY ("id","published_version_id","owner_user_id")'
      )
    );

    await expect(augmentFlowsBaseline(migrationPath)).rejects.toThrow(
      "canonical flows publication reference"
    );
  });

  it("reconciles an older complete managed block to the current integrity contract", async () => {
    const migrationPath = await createFixture(canonicalFixture);

    await augmentFlowsBaseline(migrationPath);
    await writeFile(
      migrationPath,
      (await readFile(migrationPath, "utf8")).replace(
        "or activation_command.target_version_id is distinct from new.flow_version_id then",
        "or activation_command.target_version_id <> new.flow_version_id then"
      ),
      "utf8"
    );

    await augmentFlowsBaseline(migrationPath);

    await expect(readFile(migrationPath, "utf8")).resolves.toContain(
      "or activation_command.target_version_id is distinct from new.flow_version_id then"
    );
  });

  it("adds newly owned integrity objects while upgrading a complete prior managed block", async () => {
    const migrationPath = await createFixture(canonicalFixture);

    await augmentFlowsBaseline(migrationPath);
    const currentMigration = await readFile(migrationPath, "utf8");
    const priorManagedMigration = currentMigration.replace(
      `\n--> statement-breakpoint\n${flowWorkItemIntegritySql.trim()}\n--> statement-breakpoint\n`,
      "\n--> statement-breakpoint\n"
    );
    expect(priorManagedMigration).not.toContain(
      'CREATE TRIGGER "flow_work_items_transition_guard"'
    );
    await writeFile(migrationPath, priorManagedMigration, "utf8");

    await augmentFlowsBaseline(migrationPath);

    await expect(readFile(migrationPath, "utf8")).resolves.toContain(
      'CREATE TRIGGER "flow_work_items_transition_guard"'
    );
  });

  it("rejects a partial or divergent owned integrity block", async () => {
    const migrationPath = await createFixture(
      `${canonicalFixture}\nCREATE TRIGGER "flow_versions_immutable_update" BEFORE UPDATE ON flow_versions;`
    );

    await expect(augmentFlowsBaseline(migrationPath)).rejects.toThrow(
      "partial or divergent Flows integrity objects"
    );
  });
});

const canonicalFixture = `
CREATE TABLE "flows" (
  "id" uuid PRIMARY KEY,
  "owner_user_id" uuid NOT NULL,
  "published_version_id" uuid,
  "published_at" timestamp with time zone
);
CREATE TABLE "flow_versions" (
  "id" uuid PRIMARY KEY,
  "flow_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "published_at" timestamp with time zone NOT NULL
);
CREATE TABLE "flow_definition_commands" (
  "id" uuid PRIMARY KEY,
  "owner_user_id" uuid NOT NULL,
  "state" text NOT NULL,
  "replay_until" timestamp with time zone NOT NULL
);
CREATE TABLE "flow_definition_command_outcomes" (
  "command_id" uuid PRIMARY KEY,
  "response_status" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE "flow_runtime_commands" (
  "id" uuid PRIMARY KEY,
  "owner_user_id" uuid NOT NULL,
  "state" text NOT NULL,
  "replay_until" timestamp with time zone NOT NULL
);
CREATE TABLE "flow_runtime_command_outcomes" (
  "command_id" uuid PRIMARY KEY,
  "response_status" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE TABLE "flow_runtime_events" (
  "id" uuid PRIMARY KEY,
  "owner_user_id" uuid NOT NULL
);
CREATE TABLE "flow_runs" (
  "id" uuid PRIMARY KEY,
  "owner_user_id" uuid NOT NULL
);
CREATE TABLE "flow_execution_attempts" (
  "id" uuid PRIMARY KEY,
  "owner_user_id" uuid NOT NULL,
  "flow_run_id" uuid NOT NULL
);
CREATE TABLE "flow_run_events" (
  "id" uuid PRIMARY KEY,
  "owner_user_id" uuid NOT NULL,
  "flow_run_id" uuid NOT NULL
);
CREATE TABLE "flow_work_items" (
  "id" uuid PRIMARY KEY,
  "owner_user_id" uuid NOT NULL,
  "flow_run_id" uuid NOT NULL,
  "last_command_id" uuid
);
CREATE TABLE "flow_activation_epochs" (
  "id" uuid PRIMARY KEY
);
CREATE TABLE "flow_enrollment_commands" (
  "id" uuid PRIMARY KEY,
  "request_schema_version" text NOT NULL,
  "expected_enrollment_revision" integer NOT NULL,
  "replay_until" timestamp with time zone NOT NULL
);
CREATE TABLE "flow_enrollment_command_outcomes" (
  "command_id" uuid PRIMARY KEY
);
CREATE TABLE "flow_enrollment_controls" (
  "flow_id" uuid PRIMARY KEY
);
CREATE TABLE "flow_automation_quota_authorities" (
  "owner_subject_id" uuid PRIMARY KEY
);
ALTER TABLE "flows" ADD CONSTRAINT "flows_published_version_owner_fk"
  FOREIGN KEY ("id","published_version_id","owner_user_id","published_at")
  REFERENCES "public"."flow_versions"("flow_id","id","owner_user_id","published_at");
`;

async function createFixture(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "elevenhouse-flows-baseline-"));
  temporaryDirectories.push(directory);
  const migrationPath = join(directory, "0000_fixture.sql");
  await writeFile(migrationPath, contents.trimStart(), "utf8");
  return migrationPath;
}
