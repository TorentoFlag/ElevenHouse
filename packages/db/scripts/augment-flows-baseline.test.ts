import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { augmentFlowsBaseline } from "./augment-flows-baseline";

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
    ]) {
      expect(migration.split(statement)).toHaveLength(2);
    }
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
CREATE TABLE "flow_definition_migrations" (
  "id" uuid PRIMARY KEY,
  "flow_id" uuid NOT NULL,
  "command_id" uuid NOT NULL
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
