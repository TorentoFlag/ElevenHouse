import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildHumanDesignIndividualBaseResult,
  createCalculation,
  type CalculationParticipant
} from "@elevenhouse/domain";
import { HUMAN_DESIGN_APPROVED_FIXTURES } from "../../../../domain/src/human-design/fixtures/approved-fixtures";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleCalculationStore } from "./index";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("Human Design approved fixture persistence", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const ownerUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (ownerUserIds.length > 0) {
        await runtime.pool.query("delete from calculation_records where owner_user_id = any($1)", [
          ownerUserIds
        ]);
        await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("persists approved fixtures as Human Design calculation records and hydrates exact result data", async () => {
    expect(HUMAN_DESIGN_APPROVED_FIXTURES.length).toBeGreaterThanOrEqual(2);

    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);

    for (const [index, fixture] of HUMAN_DESIGN_APPROVED_FIXTURES.entries()) {
      const result = buildHumanDesignIndividualBaseResult(fixture.input);
      const clientId = randomUUID();
      const participants: readonly CalculationParticipant[] = [
        {
          role: "subject",
          source: "crm_client",
          clientId,
          displayName: `HD fixture ${index + 1}`
        }
      ];

      const created = await createCalculation({
        store,
        ownerUserId,
        module: "human_design",
        mode: "individual",
        methodCode: "human_design_classic",
        title: `Human Design fixture ${fixture.id}`,
        participants,
        linkClientIds: [clientId],
        requestFingerprint: result.inputFingerprint.value,
        inputData: {
          fixtureId: fixture.id,
          source: fixture.source,
          resolvedLongitudes: fixture.input
        },
        resultData: result,
        resultSummary: {
          type: result.type,
          authority: result.authority,
          profile: result.profile.code,
          definition: result.definition,
          definedChannels: result.definedChannels.map((channel) => channel.code)
        },
        resultChecksum: result.resultChecksum.value,
        idGenerator: randomUUID,
        now: new Date("2026-07-22T19:30:00.000Z")
      });

      const persisted = await store.findByOwnerAndId({
        ownerUserId,
        calculationId: created.id
      });

      expect(persisted).toMatchObject({
        module: "human_design",
        mode: "individual",
        methodCode: "human_design_classic",
        status: "linked",
        requestFingerprint: result.inputFingerprint.value,
        resultChecksum: result.resultChecksum.value,
        resultData: result,
        resultSummary: {
          type: fixture.expected.type,
          authority: fixture.expected.derivedAuthority,
          profile: fixture.expected.profile,
          definition: fixture.expected.derivedDefinition
        },
        participants,
        links: [{ clientId, visibility: "private_to_astrologer" }]
      });
    }
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user insert to return id");
  }
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
