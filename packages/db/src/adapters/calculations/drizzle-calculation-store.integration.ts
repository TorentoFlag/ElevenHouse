import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveCalculationInterpretation,
  archiveCalculation,
  createCalculation,
  linkCalculationToClient,
  publishCalculationToClient,
  recalculateCalculation,
  saveCalculationInterpretation,
  type CalculationParticipant
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleCalculationStore } from "./index";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("calculations Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({
    DATABASE_URL: databaseUrl
  });

  const ownerUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
    } finally {
      await runtime.close();
    }
  });

  it("persists and hydrates owner-scoped calculation records", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    ownerUserIds.push(ownerUserId, otherOwnerUserId);
    const clientId = randomUUID();
    const otherClientId = randomUUID();

    const created = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "compatibility",
      methodCode: "pythagorean-matrix",
      methodVersion: "2026.07",
      title: "Compatibility matrix",
      participants: createParticipants(clientId, otherClientId),
      settingsSnapshot: { locale: "ru" },
      inputSnapshot: { participants: 2 },
      resultSnapshot: { score: 84 },
      resultSummary: { headline: "strong match" },
      resultChecksum: "checksum-v1",
      idGenerator: randomUUID,
      versionIdGenerator: randomUUID,
      now: new Date("2026-07-06T10:00:00.000Z")
    });

    expect(created).toMatchObject({
      ownerUserId,
      module: "numerology",
      mode: "compatibility",
      methodCode: "pythagorean-matrix",
      currentMethodVersion: "2026.07",
      title: "Compatibility matrix",
      status: "calculated"
    });
    expect(created.participants).toMatchObject([
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "Alice",
        birthDate: "1990-01-02",
        manuallyOverridden: false
      },
      {
        role: "partner",
        source: "crm_client",
        clientId: otherClientId,
        displayName: "Bob",
        birthDate: "1991-03-04",
        manuallyOverridden: true
      }
    ]);
    expect(created.versions).toMatchObject([
      {
        versionNumber: 1,
        methodVersion: "2026.07",
        settingsSnapshot: { locale: "ru" },
        inputSnapshot: { participants: 2 },
        resultSnapshot: { score: 84 },
        resultSummary: { headline: "strong match" },
        resultChecksum: "checksum-v1"
      }
    ]);

    await expect(
      store.findByOwnerAndId({ ownerUserId: otherOwnerUserId, calculationId: created.id })
    ).resolves.toBeNull();
    await expect(
      store.findByOwnerAndId({ ownerUserId, calculationId: created.id })
    ).resolves.toMatchObject({
      id: created.id,
      participants: [{ clientId }, { clientId: otherClientId }],
      versions: [{ versionNumber: 1 }],
      links: [],
      interpretations: [],
      artifacts: []
    });
    await expect(
      store.listByOwner({ ownerUserId, status: "all", limit: 10, offset: 0 })
    ).resolves.toMatchObject({
      total: 1,
      calculations: [{ id: created.id }]
    });

    const linkedToFirstClient = await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T10:05:00.000Z")
    });
    await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId: otherClientId,
      now: new Date("2026-07-06T10:06:00.000Z")
    });
    expect(linkedToFirstClient.status).toBe("linked");

    const firstInterpretation = await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      versionId: created.versions[0]?.id ?? raise("Expected initial version"),
      source: "ai",
      text: "Draft text",
      modelId: "gpt-test",
      promptVersion: "calc-v1",
      interpretationIdGenerator: randomUUID,
      now: new Date("2026-07-06T10:07:00.000Z")
    });
    const firstInterpretationId =
      firstInterpretation.interpretations[0]?.id ?? raise("Expected interpretation");
    await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      interpretationId: firstInterpretationId,
      now: new Date("2026-07-06T10:08:00.000Z")
    });
    const publishedFirstClient = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T10:09:00.000Z")
    });
    await expect(
      store.linkClient({
        ownerUserId,
        calculationId: created.id,
        clientId,
        now: "2026-07-06T10:09:30.000Z"
      })
    ).resolves.toMatchObject({
      status: "linked",
      links: [{ clientId, visibility: "private_to_astrologer", publishedAt: null }]
    });
    expect(linkByClient(publishedFirstClient, clientId)).toMatchObject({
      visibility: "visible_to_client",
      publishedAt: "2026-07-06T10:09:00.000Z"
    });
    expect(linkByClient(publishedFirstClient, otherClientId)).toMatchObject({
      visibility: "private_to_astrologer",
      publishedAt: null
    });

    const recalculated = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      methodVersion: "2026.08",
      settingsSnapshot: { locale: "en" },
      inputSnapshot: { participants: 2, recalculated: true },
      resultSnapshot: { score: 91 },
      resultSummary: { headline: "stronger match" },
      resultChecksum: "checksum-v2",
      versionIdGenerator: randomUUID,
      now: new Date("2026-07-06T10:10:00.000Z")
    });
    expect(recalculated.status).toBe("linked");
    expect(recalculated.currentMethodVersion).toBe("2026.08");
    expect(recalculated.versions.map((version) => version.versionNumber)).toEqual([1, 2]);
    expect(linkByClient(recalculated, clientId)).toMatchObject({
      visibility: "private_to_astrologer",
      publishedAt: null
    });

    const latestVersion = recalculated.versions[1] ?? raise("Expected recalculated version");
    const secondInterpretation = await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      versionId: latestVersion.id,
      source: "manual",
      text: "Approved manual interpretation",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: randomUUID,
      now: new Date("2026-07-06T10:11:00.000Z")
    });
    const secondInterpretationId =
      secondInterpretation.interpretations.find(
        (interpretation) => interpretation.versionId === latestVersion.id
      )?.id ?? raise("Expected latest interpretation");
    await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      interpretationId: secondInterpretationId,
      now: new Date("2026-07-06T10:12:00.000Z")
    });
    const publishedSecondClient = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId: otherClientId,
      now: new Date("2026-07-06T10:13:00.000Z")
    });

    expect(linkByClient(publishedSecondClient, clientId)).toMatchObject({
      visibility: "private_to_astrologer",
      publishedAt: null
    });
    expect(linkByClient(publishedSecondClient, otherClientId)).toMatchObject({
      visibility: "visible_to_client",
      publishedAt: "2026-07-06T10:13:00.000Z"
    });

    const archived = await archiveCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      now: new Date("2026-07-06T10:20:00.000Z")
    });
    expect(archived.status).toBe("archived");
    expect(archived.versions).toHaveLength(2);
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );

    return result.rows[0]?.id ?? raise("Expected user insert to return id");
  }
});

function createParticipants(
  clientId: string,
  otherClientId: string
): readonly CalculationParticipant[] {
  return [
    {
      role: "subject",
      source: "crm_client",
      clientId,
      displayName: "Alice",
      birthDate: "1990-01-02",
      inputSnapshot: { city: "Moscow" },
      manuallyOverridden: false
    },
    {
      role: "partner",
      source: "crm_client",
      clientId: otherClientId,
      displayName: "Bob",
      birthDate: "1991-03-04",
      inputSnapshot: { city: "London" },
      manuallyOverridden: true
    }
  ];
}

function linkByClient(
  record: Awaited<ReturnType<typeof publishCalculationToClient>>,
  clientId: string
) {
  return record.links.find((link) => link.clientId === clientId) ?? raise("Expected client link");
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  }

  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
