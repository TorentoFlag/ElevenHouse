import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveCalculationInterpretation,
  archiveCalculation,
  CalculationAlreadyExistsError,
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
const digest = (character: string) => `sha256:${character.repeat(64)}`;

describe("calculations Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const ownerUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (ownerUserIds.length > 0) {
        await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("persists, hydrates and replaces one current result transactionally", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    ownerUserIds.push(ownerUserId, otherOwnerUserId);
    const clientId = randomUUID();
    const partnerClientId = randomUUID();
    const participants = createParticipants(clientId, partnerClientId);

    const created = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "compatibility",
      methodCode: "pythagorean",
      title: "Compatibility matrix",
      participants,
      linkClientIds: [],
      requestFingerprint: digest("a"),
      inputData: { participants: [{ name: "Alice" }, { name: "Bob" }] },
      resultData: { pairNumber: 7 },
      resultSummary: { overall: "mixed" },
      resultChecksum: digest("b"),
      idGenerator: randomUUID,
      now: new Date("2026-07-06T10:00:00.000Z")
    });

    expect(created).toMatchObject({
      ownerUserId,
      methodCode: "pythagorean",
      requestFingerprint: digest("a"),
      resultData: { pairNumber: 7 },
      participants: [{ clientId }, { clientId: partnerClientId }]
    });
    expect(created).not.toHaveProperty("versions");
    await expect(
      store.findByOwnerAndId({ ownerUserId: otherOwnerUserId, calculationId: created.id })
    ).resolves.toBeNull();
    await expect(
      store.findExact({
        ownerUserId,
        module: "numerology",
        mode: "compatibility",
        methodCode: "pythagorean",
        requestFingerprint: digest("a")
      })
    ).resolves.toMatchObject({ id: created.id });

    await store.ensureClientLinks({
      ownerUserId,
      calculationId: created.id,
      clientIds: [clientId, partnerClientId, clientId],
      now: "2026-07-06T10:05:00.000Z"
    });
    const draft = await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      source: "manual",
      text: "Approved interpretation",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: randomUUID,
      now: new Date("2026-07-06T10:06:00.000Z")
    });
    const interpretationId = draft.interpretations[0]?.id ?? raise("Expected interpretation");
    await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      interpretationId,
      now: new Date("2026-07-06T10:07:00.000Z")
    });
    const published = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      expectedResultChecksum: created.resultChecksum,
      now: new Date("2026-07-06T10:08:00.000Z")
    });
    expect(linkByClient(published, clientId).visibility).toBe("visible_to_client");

    const replaced = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      participants: participants.map((participant) => ({
        ...participant,
        displayName: `${participant.displayName} updated`
      })),
      requestFingerprint: digest("c"),
      inputData: { recalculated: true },
      resultData: { pairNumber: 8 },
      resultSummary: { overall: "attention" },
      resultChecksum: digest("d"),
      now: new Date("2026-07-06T10:10:00.000Z")
    });
    expect(replaced).toMatchObject({
      status: "linked",
      requestFingerprint: digest("c"),
      resultData: { pairNumber: 8 },
      interpretations: []
    });
    expect(replaced.links.every((link) => link.visibility === "private_to_astrologer")).toBe(true);
    expect(replaced.participants.map((participant) => participant.displayName)).toEqual([
      "Alice updated",
      "Bob updated"
    ]);

    const archived = await archiveCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      now: new Date("2026-07-06T10:20:00.000Z")
    });
    expect(archived.status).toBe("archived");
  });

  it("replays exact creates and rejects replacement collisions without mutation", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const clientId = randomUUID();
    const base = {
      store,
      ownerUserId,
      module: "numerology" as const,
      mode: "individual" as const,
      methodCode: "pythagorean",
      participants: createParticipants(clientId).slice(0, 1),
      linkClientIds: [],
      inputData: { name: "Alice" },
      resultData: { lifePath: 2 },
      resultSummary: { lifePath: 2 },
      resultChecksum: digest("f"),
      now: new Date("2026-07-06T11:00:00.000Z")
    };
    const [first, replay] = await Promise.all([
      createCalculation({
        ...base,
        title: "First",
        requestFingerprint: digest("e"),
        idGenerator: randomUUID
      }),
      createCalculation({
        ...base,
        title: "Replay",
        requestFingerprint: digest("e"),
        idGenerator: randomUUID
      })
    ]);
    expect(replay.id).toBe(first.id);

    const other = await createCalculation({
      ...base,
      title: "Other",
      requestFingerprint: digest("1"),
      resultChecksum: digest("2"),
      idGenerator: randomUUID
    });
    await expect(
      recalculateCalculation({
        store,
        ownerUserId,
        calculationId: first.id,
        participants: first.participants,
        requestFingerprint: other.requestFingerprint,
        inputData: { collision: true },
        resultData: { lifePath: 9 },
        resultSummary: {},
        resultChecksum: digest("3"),
        now: new Date("2026-07-06T11:10:00.000Z")
      })
    ).rejects.toBeInstanceOf(CalculationAlreadyExistsError);
    await expect(
      store.findByOwnerAndId({ ownerUserId, calculationId: first.id })
    ).resolves.toMatchObject({ requestFingerprint: digest("e"), resultData: { lifePath: 2 } });
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
  partnerClientId = randomUUID()
): readonly CalculationParticipant[] {
  return [
    { role: "subject", source: "crm_client", clientId, displayName: "Alice" },
    { role: "partner", source: "crm_client", clientId: partnerClientId, displayName: "Bob" }
  ];
}

function linkByClient(
  record: Awaited<ReturnType<typeof linkCalculationToClient>>,
  clientId: string
) {
  return record.links.find((link) => link.clientId === clientId) ?? raise("Expected client link");
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
