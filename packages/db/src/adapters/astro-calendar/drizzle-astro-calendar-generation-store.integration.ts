import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ElevenHouseDatabase } from "../../runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT } from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { astroCalendarGenerations, outboxEvents, users } from "../../schema";
import { createDrizzleAstroCalendarGenerationStore } from "./drizzle-astro-calendar-generation-store";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const ownerUserIds: string[] = [];
const generationIds: string[] = [];

describe("Astro Calendar generation Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (generationIds.length > 0) {
        await runtime.pool.query("delete from outbox_events where aggregate_id = any($1)", [
          generationIds
        ]);
      }
      if (ownerUserIds.length > 0) {
        await runtime.pool.query(
          "delete from astro_calendar_events where owner_user_id = any($1)",
          [ownerUserIds]
        );
        await runtime.pool.query(
          "delete from astro_calendar_generations where owner_user_id = any($1)",
          [ownerUserIds]
        );
        await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("reuses a generation for the same owner and fingerprint", async () => {
    const store = createDrizzleAstroCalendarGenerationStore(runtime.database);
    const ownerUserId = await createUser(runtime.database);
    const input = createGenerationInput(ownerUserId);

    const first = await store.createCalculating(input);
    const second = await store.createCalculating(input);
    generationIds.push(first.id);

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("calculating");
    await expect(readOutbox(runtime.database, first.id)).resolves.toMatchObject({
      eventType: ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT,
      aggregateId: first.id,
      status: "pending",
      payload: { generationId: first.id }
    });
  });

  it("marks a generation ready with chronological events", async () => {
    const store = createDrizzleAstroCalendarGenerationStore(runtime.database);
    const ownerUserId = await createUser(runtime.database);
    const generation = await store.createCalculating(createGenerationInput(ownerUserId, "b"));
    generationIds.push(generation.id);

    const ready = await store.markReady({
      ownerUserId,
      generationId: generation.id,
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      readinessSummary: generation.readinessSummary,
      summary: { eventCount: 2, globalEventCount: 2, clientEventCount: 0 },
      warnings: [],
      events: [
        createEvent("later", "2026-07-20T12:00:00.000Z"),
        createEvent("earlier", "2026-07-10T12:00:00.000Z")
      ],
      generatedAt: "2026-07-01T00:05:00.000Z",
      now: "2026-07-01T00:05:01.000Z"
    });

    expect(ready?.generation.status).toBe("ready");
    expect(ready?.generation.provider).toEqual({
      name: "kerykeion",
      version: "5.12.9",
      ephemeris: "swiss-ephemeris"
    });
    expect(ready?.events.map((event) => event.eventId)).toEqual(["earlier", "later"]);
    expect(await runtime.database.query.astroCalendarEvents.findMany()).toHaveLength(2);
  });

  it("marks failed and stale generations explicitly", async () => {
    const store = createDrizzleAstroCalendarGenerationStore(runtime.database);
    const ownerUserId = await createUser(runtime.database);
    const failedGeneration = await store.createCalculating(createGenerationInput(ownerUserId, "c"));
    const readyGeneration = await store.createCalculating(createGenerationInput(ownerUserId, "d"));
    generationIds.push(failedGeneration.id, readyGeneration.id);
    await store.markReady({
      ownerUserId,
      generationId: readyGeneration.id,
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      readinessSummary: readyGeneration.readinessSummary,
      summary: { eventCount: 0, globalEventCount: 0, clientEventCount: 0 },
      warnings: [],
      events: [],
      generatedAt: "2026-07-01T00:05:00.000Z",
      now: "2026-07-01T00:05:01.000Z"
    });

    const failed = await store.markFailed({
      ownerUserId,
      generationId: failedGeneration.id,
      errorCode: "CHART_ENGINE_UNAVAILABLE",
      errorMessage: "chart-engine request failed",
      now: "2026-07-01T00:06:00.000Z"
    });
    const staleCount = await store.markStaleByOwner({
      ownerUserId,
      now: "2026-07-01T00:07:00.000Z"
    });

    expect(failed).toMatchObject({
      status: "failed",
      errorCode: "CHART_ENGINE_UNAVAILABLE",
      errorMessage: "chart-engine request failed"
    });
    expect(staleCount).toBe(1);
    await expect(
      runtime.database.query.astroCalendarGenerations.findFirst({
        where: eq(astroCalendarGenerations.id, readyGeneration.id)
      })
    ).resolves.toMatchObject({ status: "stale" });

    const retried = await store.markCalculating({
      ownerUserId,
      generationId: failedGeneration.id,
      now: "2026-07-01T00:08:00.000Z"
    });
    expect(retried).toMatchObject({
      id: failedGeneration.id,
      status: "calculating",
      errorCode: null,
      errorMessage: null
    });
    await expect(readOutbox(runtime.database, failedGeneration.id)).resolves.toMatchObject({
      eventType: ASTRO_CALENDAR_GENERATION_REQUESTED_EVENT,
      aggregateId: failedGeneration.id,
      status: "pending",
      attempts: 0
    });
  });
});

async function readOutbox(database: ElevenHouseDatabase, generationId: string) {
  return database.query.outboxEvents.findFirst({
    where: eq(outboxEvents.aggregateId, generationId)
  });
}

async function createUser(database: ElevenHouseDatabase): Promise<string> {
  const id = randomUUID();
  ownerUserIds.push(id);
  await database.insert(users).values({ id, status: "active" });
  return id;
}

function createGenerationInput(ownerUserId: string, digest = "a") {
  return {
    ownerUserId,
    inputFingerprint: `sha256:${digest.repeat(64)}`,
    rangeStart: "2026-07-01",
    rangeEnd: "2026-07-30",
    timeZone: "Europe/Moscow",
    requestSnapshot: { start: "2026-07-01", end: "2026-07-30" },
    settingsSnapshot: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    },
    readinessSummary: {
      clientsTotal: 0,
      clientsReady: 0,
      clientsWithMissingBirthData: 0,
      clientsWithUnknownBirthTime: 0,
      clientsWithApproximateBirthTime: 0
    },
    warnings: [],
    now: "2026-07-01T00:00:00.000Z"
  };
}

function createEvent(eventId: string, startsAt: string) {
  return {
    eventId,
    source: "global" as const,
    type: "global.ingress" as const,
    startsAt,
    endsAt: null,
    payload: {
      id: eventId,
      source: "global",
      type: "global.ingress",
      startsAt,
      endsAt: null,
      timePrecision: "exact",
      title: eventId,
      subtitle: null,
      description: null,
      tone: "opportunity",
      points: ["Sun"],
      aspect: null,
      sign: "leo",
      clientRefs: [],
      chartLink: null,
      dictionaryCodes: ["astro_calendar.global.ingress.sun.leo"],
      warnings: []
    },
    dictionaryCodes: ["astro_calendar.global.ingress.sun.leo"]
  };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}
