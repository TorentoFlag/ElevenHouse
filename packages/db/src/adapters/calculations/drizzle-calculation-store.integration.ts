import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveCalculationInterpretation,
  archiveCalculation,
  CALCULATION_PDF_DELETE_REQUESTED_EVENT,
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
import { createDrizzleCalculationPdfJobStore, createDrizzleCalculationStore } from "./index";

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
        await runtime.pool.query("delete from calculation_records where owner_user_id = any($1)", [
          ownerUserIds
        ]);
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
    await expect(
      saveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: created.id,
        expectedResultChecksum: digest("c"),
        source: "manual",
        text: "Stale interpretation",
        modelId: null,
        promptVersion: null,
        interpretationIdGenerator: randomUUID,
        now: new Date("2026-07-06T10:05:30.000Z")
      })
    ).rejects.toThrow("Calculation changed while interpretation was being saved");
    const draft = await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      expectedResultChecksum: created.resultChecksum,
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

  it("invalidates current PDFs and schedules delayed private object cleanup on recalculation", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const pdfStore = createDrizzleCalculationPdfJobStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const participant = createParticipants(randomUUID()).slice(0, 1);
    const calculation = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean_ru",
      title: "Current PDF cleanup",
      participants: participant,
      linkClientIds: [],
      requestFingerprint: digest("4"),
      inputData: { name: "Current" },
      resultData: { lifePath: 4 },
      resultSummary: { lifePath: 4 },
      resultChecksum: digest("5"),
      idGenerator: randomUUID,
      now: new Date("2026-07-15T12:00:00.000Z")
    });
    const unrelated = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean_ru",
      title: "Unrelated PDF",
      participants: participant,
      linkClientIds: [],
      requestFingerprint: digest("6"),
      inputData: { name: "Unrelated" },
      resultData: { lifePath: 6 },
      resultSummary: { lifePath: 6 },
      resultChecksum: digest("7"),
      idGenerator: randomUUID,
      now: new Date("2026-07-15T12:00:00.000Z")
    });

    const currentMediaIds: string[] = [];
    for (const [locale, fingerprint] of [
      ["ru", digest("8")],
      ["en", digest("9")]
    ] as const) {
      const ids = candidatePdfIds();
      currentMediaIds.push(ids.mediaAssetId);
      await pdfStore.enqueue({
        ...ids,
        ownerUserId,
        calculationId: calculation.id,
        module: "numerology",
        methodCode: "pythagorean_ru",
        resultChecksum: calculation.resultChecksum,
        locale,
        sourceLocator: { kind: "approved_interpretation", interpretationId: null },
        documentFingerprint: fingerprint,
        privateStorageBucket: "calculation-pdfs",
        storageKey: `owners/${ownerUserId}/calculation-pdfs/${ids.id}.pdf`,
        originalFileName: "numerology.pdf",
        now: "2026-07-15T12:01:00.000Z"
      });
    }
    const unrelatedIds = candidatePdfIds();
    await pdfStore.enqueue({
      ...unrelatedIds,
      ownerUserId,
      calculationId: unrelated.id,
      module: "numerology",
      methodCode: "pythagorean_ru",
      resultChecksum: unrelated.resultChecksum,
      locale: "ru",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null },
      documentFingerprint: digest("0"),
      privateStorageBucket: "calculation-pdfs",
      storageKey: `owners/${ownerUserId}/calculation-pdfs/${unrelatedIds.id}.pdf`,
      originalFileName: "numerology.pdf",
      now: "2026-07-15T12:01:00.000Z"
    });

    await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      participants: calculation.participants,
      requestFingerprint: digest("d"),
      inputData: { recalculated: true },
      resultData: { lifePath: 9 },
      resultSummary: { lifePath: 9 },
      resultChecksum: digest("e"),
      now: new Date("2026-07-15T12:10:00.000Z")
    });

    const state = await runtime.pool.query<{
      current_jobs: string;
      current_artifacts: string;
      current_media: string;
      unrelated_jobs: string;
    }>(
      `select
         (select count(*) from calculation_pdf_jobs where calculation_id = $1) as current_jobs,
         (select count(*) from calculation_artifacts where calculation_id = $1) as current_artifacts,
         (select count(*) from media_assets where id = any($2)) as current_media,
         (select count(*) from calculation_pdf_jobs where calculation_id = $3) as unrelated_jobs`,
      [calculation.id, currentMediaIds, unrelated.id]
    );
    expect(state.rows[0]).toEqual({
      current_jobs: "0",
      current_artifacts: "0",
      current_media: "2",
      unrelated_jobs: "1"
    });
    const cleanupEvents = await runtime.pool.query<{
      aggregate_id: string;
      payload: { mediaAssetId: string };
      available_at: Date;
    }>(
      `select aggregate_id, payload, available_at
       from outbox_events
       where event_type = $1 and aggregate_id = any($2)
       order by aggregate_id`,
      [CALCULATION_PDF_DELETE_REQUESTED_EVENT, currentMediaIds]
    );
    expect(cleanupEvents.rows).toHaveLength(2);
    expect(cleanupEvents.rows.map((event) => event.aggregate_id).sort()).toEqual(
      [...currentMediaIds].sort()
    );
    expect(cleanupEvents.rows.map((event) => event.payload.mediaAssetId).sort()).toEqual(
      [...currentMediaIds].sort()
    );
    expect(
      cleanupEvents.rows.every(
        (event) => event.available_at.toISOString() === "2026-07-15T13:10:00.000Z"
      )
    ).toBe(true);
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

function candidatePdfIds() {
  return {
    id: randomUUID(),
    mediaAssetId: randomUUID(),
    artifactId: randomUUID(),
    outboxEventId: randomUUID()
  };
}
