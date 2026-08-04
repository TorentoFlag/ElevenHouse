import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  augmentConsentAiBaseline,
  consentAiIntegritySql,
  consentAiIndeterminateUpgradeSql,
  consentAiPersistenceBaselineDdl
} from "./augment-consent-ai-baseline";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("consent and AI baseline augmenter", () => {
  it("adds canonical immutable-evidence triggers exactly once", async () => {
    const migrationPath = await createFixture(canonicalFixture);

    await augmentConsentAiBaseline(migrationPath);
    await augmentConsentAiBaseline(migrationPath);

    const migration = await readFile(migrationPath, "utf8");
    for (const statement of [
      'CREATE TRIGGER "client_data_consents_immutable_evidence"',
      'CREATE TRIGGER "ai_usage_records_one_way_lifecycle"',
      'CREATE TRIGGER "ai_usage_consent_records_immutable_evidence"'
    ]) {
      expect(migration.split(statement)).toHaveLength(2);
    }
  });

  it("fails closed when the generated consent-to-relationship identity is not canonical", async () => {
    const migrationPath = await createFixture(
      canonicalFixture.replace(
        'FOREIGN KEY ("relationship_id","client_user_id","astrologer_user_id")',
        'FOREIGN KEY ("relationship_id","client_user_id")'
      )
    );

    await expect(augmentConsentAiBaseline(migrationPath)).rejects.toThrow(
      "canonical consent relationship identity"
    );
  });

  it("rejects a partial or divergent owned integrity block", async () => {
    const migrationPath = await createFixture(
      `${canonicalFixture}\nCREATE TRIGGER "ai_usage_records_one_way_lifecycle" BEFORE UPDATE ON ai_usage_records;`
    );

    await expect(augmentConsentAiBaseline(migrationPath)).rejects.toThrow(
      "partial or divergent consent/AI integrity objects"
    );
  });

  it("upgrades the prior terminal-only integrity block to permit indeterminate evidence", async () => {
    const previousIntegrity = consentAiIntegritySql.replace(
      "'succeeded', 'failed', 'indeterminate'",
      "'succeeded', 'failed'"
    );
    const migrationPath = await createFixture(
      `${canonicalFixture}\n-- ElevenHouse consent and AI evidence integrity objects: begin\n${previousIntegrity}\n-- ElevenHouse consent and AI evidence integrity objects: end`
    );

    await augmentConsentAiBaseline(migrationPath);

    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("CHECK (status IN ('started', 'succeeded', 'failed', 'indeterminate'))");
    expect(migration).toContain("NEW.status NOT IN ('succeeded', 'failed', 'indeterminate')");
    expect(migration).not.toContain("NEW.status NOT IN ('succeeded', 'failed') THEN");
  });

  it("defines an additive production contour without fabricating consent or usage history", () => {
    for (const statement of [
      "CREATE TABLE client_data_consents",
      "CREATE TABLE ai_usage_records",
      "CREATE TABLE ai_usage_consent_records",
      'CREATE TRIGGER "client_data_consents_immutable_evidence"',
      'CREATE TRIGGER "ai_usage_records_one_way_lifecycle"',
      'CREATE TRIGGER "ai_usage_consent_records_immutable_evidence"'
    ]) {
      expect(consentAiPersistenceBaselineDdl).toContain(statement);
    }
    expect(consentAiPersistenceBaselineDdl).toContain("'indeterminate'");
    expect(consentAiPersistenceBaselineDdl).toContain("'AI_USAGE_OUTCOME_INDETERMINATE'");
    expect(consentAiPersistenceBaselineDdl).not.toMatch(
      /INSERT\s+INTO\s+(client_data_consents|ai_usage_records|ai_usage_consent_records)/i
    );
    expect(consentAiPersistenceBaselineDdl).not.toMatch(
      /UPDATE\s+(client_data_consents|ai_usage_records|ai_usage_consent_records)/i
    );
  });

  it("upgrades the previous terminal lifecycle without rewriting usage history", () => {
    expect(consentAiIndeterminateUpgradeSql).toContain(
      "CHECK (status IN ('started', 'succeeded', 'failed', 'indeterminate'))"
    );
    expect(consentAiIndeterminateUpgradeSql).toContain(
      "safe_error_code = 'AI_USAGE_OUTCOME_INDETERMINATE'"
    );
    expect(consentAiIndeterminateUpgradeSql).toContain(
      "CREATE OR REPLACE FUNCTION elevenhouse_guard_ai_usage_record_mutation()"
    );
    expect(consentAiIndeterminateUpgradeSql).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE\s+ai_usage_records|DELETE\s+FROM)/i
    );
  });
});

const canonicalFixture = `
CREATE TABLE "client_data_consents" (
  "id" uuid PRIMARY KEY NOT NULL,
  "relationship_id" uuid NOT NULL,
  "client_user_id" uuid NOT NULL,
  "astrologer_user_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "policy_version" text NOT NULL,
  "processor_code" text NOT NULL,
  "notice_locale" text NOT NULL,
  "notice_sha256" text NOT NULL,
  "granted_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "client_data_consents_revocation_time_check" CHECK ("revoked_at" is null or "revoked_at" >= "granted_at")
);
CREATE TABLE "ai_usage_records" (
  "id" uuid PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "feature" text NOT NULL,
  "prompt_id" text NOT NULL,
  "prompt_version" integer NOT NULL,
  "provider" text NOT NULL,
  "owner_safety_id" text NOT NULL,
  "processing_authority_version" text,
  "resource_type" text,
  "resource_id" uuid,
  "source_checksum" text,
  "model" text,
  "finish_reason" text,
  "safe_error_code" text,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "total_tokens" integer,
  "duration_ms" integer,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "ai_usage_records_lifecycle_check" CHECK (status in ('started', 'succeeded', 'failed'))
);
CREATE TABLE "ai_usage_consent_records" (
  "usage_record_id" uuid NOT NULL,
  "consent_record_id" uuid NOT NULL,
  CONSTRAINT "ai_usage_consent_records_pk" PRIMARY KEY("usage_record_id","consent_record_id")
);
ALTER TABLE "client_data_consents" ADD CONSTRAINT "client_data_consents_relationship_identity_fk"
  FOREIGN KEY ("relationship_id","client_user_id","astrologer_user_id")
  REFERENCES "public"."client_astrologer_relationships"("id","client_user_id","astrologer_user_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ai_usage_consent_records" ADD CONSTRAINT "ai_usage_consent_records_usage_record_id_ai_usage_records_id_fk"
  FOREIGN KEY ("usage_record_id") REFERENCES "public"."ai_usage_records"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ai_usage_consent_records" ADD CONSTRAINT "ai_usage_consent_records_consent_record_id_client_data_consents_id_fk"
  FOREIGN KEY ("consent_record_id") REFERENCES "public"."client_data_consents"("id") ON DELETE restrict ON UPDATE no action;
`;

async function createFixture(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "elevenhouse-consent-ai-baseline-"));
  temporaryDirectories.push(directory);
  const migrationPath = join(directory, "0000_fixture.sql");
  await writeFile(migrationPath, contents.trimStart(), "utf8");
  return migrationPath;
}
