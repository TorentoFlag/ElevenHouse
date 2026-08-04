import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertConsentAiRelationshipIdentity,
  canonicalConsentAiRelationshipIdentityCatalog,
  matchesConsentAiRelationshipIdentityCatalog,
  readConsentAiRelationshipIdentityCatalog,
  reconcileConsentAiRelationshipIdentity
} from "../scripts/consent-ai-schema-catalog";

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;

describeWithDatabase("consent relationship identity production reconciliation", () => {
  const databaseName = `elevenhouse_consent_identity_${randomUUID().replaceAll("-", "")}`;
  let adminClient: Client;
  let databaseClient: Client;

  beforeAll(async () => {
    const sourceUrl = new URL(integrationDatabaseUrl!);
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = "/postgres";
    const databaseUrl = new URL(sourceUrl);
    databaseUrl.pathname = `/${databaseName}`;

    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE ${databaseName}`);

    databaseClient = new Client({ connectionString: databaseUrl.toString() });
    await databaseClient.connect();
  }, 30_000);

  beforeEach(async () => {
    await databaseClient.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await databaseClient.query(`
      CREATE TABLE client_astrologer_relationships (
        id uuid PRIMARY KEY,
        client_user_id uuid NOT NULL,
        astrologer_user_id uuid NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await databaseClient?.end();
    if (adminClient) {
      await adminClient.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await adminClient.end();
    }
  });

  it("upgrades only the exact predecessor identity catalog and is idempotent", async () => {
    await databaseClient.query("BEGIN");
    await reconcileConsentAiRelationshipIdentity(databaseClient);
    await databaseClient.query("COMMIT");

    const current = await readConsentAiRelationshipIdentityCatalog(databaseClient);
    expect(
      matchesConsentAiRelationshipIdentityCatalog(
        current,
        canonicalConsentAiRelationshipIdentityCatalog
      )
    ).toBe(true);
    await expect(assertConsentAiRelationshipIdentity(databaseClient)).resolves.toBeUndefined();

    await databaseClient.query("BEGIN");
    await reconcileConsentAiRelationshipIdentity(databaseClient);
    await databaseClient.query("COMMIT");
    await expect(readConsentAiRelationshipIdentityCatalog(databaseClient)).resolves.toEqual(
      current
    );
  });

  it("rejects a misleading same-name constraint without replacing it", async () => {
    await databaseClient.query(`
      ALTER TABLE client_astrologer_relationships
        ADD CONSTRAINT client_astrologer_relationships_identity_unique
        UNIQUE (id, client_user_id)
    `);
    const before = await readConsentAiRelationshipIdentityCatalog(databaseClient);

    await databaseClient.query("BEGIN");
    await expect(reconcileConsentAiRelationshipIdentity(databaseClient)).rejects.toThrow(
      /partial or drifted/
    );
    await databaseClient.query("ROLLBACK");

    await expect(readConsentAiRelationshipIdentityCatalog(databaseClient)).resolves.toEqual(before);
  });

  it("requires the exact current identity catalog during assertion", async () => {
    await expect(assertConsentAiRelationshipIdentity(databaseClient)).rejects.toThrow(
      /identity catalog drifted/
    );
  });
});
