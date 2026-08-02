import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { CHART_CALCULATION_REQUESTED_EVENT } from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import {
  calculationParticipants,
  calculationRecords,
  chartCalculationJobs,
  outboxEvents
} from "../../schema";
import {
  createDrizzleChartCalculationCommandStore,
  createDrizzleChartCalculationJobStore,
  createDrizzleChartWorkerJobStore
} from "./drizzle-chart-calculation-job-store";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const digest = (character: string) => `sha256:${character.repeat(64)}`;

describe("chart calculation job Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const ownerUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (ownerUserIds.length > 0) {
        await runtime.pool.query(
          `delete from outbox_events
           where event_type = $1
             and aggregate_id in (
               select id from chart_calculation_jobs where owner_user_id = any($2)
             )`,
          [CHART_CALCULATION_REQUESTED_EVENT, ownerUserIds]
        );
        await runtime.pool.query(
          "delete from chart_calculation_jobs where owner_user_id = any($1)",
          [ownerUserIds]
        );
        await runtime.pool.query("delete from calculation_records where owner_user_id = any($1)", [
          ownerUserIds
        ]);
        await runtime.pool.query("delete from client_profiles where user_id = any($1)", [
          ownerUserIds
        ]);
        await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("reuses an active job for the same owner and fingerprint", async () => {
    const store = createDrizzleChartCalculationJobStore(runtime.database);
    const ownerUserId = await createClientUser();
    ownerUserIds.push(ownerUserId);
    const input = createInput(ownerUserId);

    const first = await store.createOrReuseNatalJob(input);
    const second = await store.createOrReuseNatalJob(input);

    expect(first.kind).toBe("active_job");
    expect(second).toEqual(first);
  });

  it("does not require calculation record before success", async () => {
    const store = createDrizzleChartCalculationJobStore(runtime.database);
    const ownerUserId = await createClientUser();
    ownerUserIds.push(ownerUserId);

    const created = await store.createOrReuseNatalJob(createInput(ownerUserId));
    if (created.kind !== "active_job") throw new Error("Expected active job");
    const row = await runtime.database.query.chartCalculationJobs.findFirst({
      where: eq(chartCalculationJobs.id, created.jobId)
    });

    expect(row?.resultCalculationId).toBeNull();
  });

  it("creates the calculation request outbox event with only job id payload", async () => {
    const commandStore = createDrizzleChartCalculationCommandStore(runtime.database);
    const ownerUserId = await createClientUser();
    ownerUserIds.push(ownerUserId);

    const created = await commandStore.createOrReuseNatalJobAndRequestCalculation({
      ...createInput(ownerUserId),
      now: "2026-07-20T12:00:00.000Z"
    });
    if (created.kind !== "active_job") throw new Error("Expected active job");
    const row = await runtime.database.query.outboxEvents.findFirst({
      where: eq(outboxEvents.aggregateId, created.jobId)
    });

    expect(row).toMatchObject({
      eventType: CHART_CALCULATION_REQUESTED_EVENT,
      aggregateId: created.jobId,
      payload: { jobId: created.jobId },
      status: "pending"
    });
  });

  it("persists the current calculation record only after successful processing", async () => {
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const ownerUserId = await createClientUser();
    ownerUserIds.push(ownerUserId);
    const created = await jobStore.createOrReuseNatalJob(createInput(ownerUserId));
    if (created.kind !== "active_job") throw new Error("Expected active job");
    const claim = await workerStore.claimForProcessing({
      jobId: created.jobId,
      now: "2026-07-20T12:00:00.000Z"
    });

    expect(claim?.id).toBe(created.jobId);
    await expect(
      workerStore.complete({
        jobId: created.jobId,
        result: chartResult(),
        resultChecksum: digest("b"),
        now: "2026-07-20T12:00:05.000Z"
      })
    ).resolves.toBe(true);

    const row = await runtime.database.query.chartCalculationJobs.findFirst({
      where: eq(chartCalculationJobs.id, created.jobId)
    });
    expect(row?.status).toBe("succeeded");
    expect(row?.resultCalculationId).toEqual(expect.any(String));
    const participants = await runtime.database
      .select()
      .from(calculationParticipants)
      .where(
        eq(
          calculationParticipants.calculationId,
          row?.resultCalculationId ?? raise("Expected result calculation id")
        )
      )
      .orderBy(calculationParticipants.order);
    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({
      role: "subject",
      source: "crm_client",
      clientId: ownerUserId,
      displayName: "Chart Client",
      order: 0
    });
    await expect(
      workerStore.complete({
        jobId: created.jobId,
        result: chartResult(),
        resultChecksum: digest("b"),
        now: "2026-07-20T12:00:10.000Z"
      })
    ).resolves.toBe(true);
    const participantsAfterRetry = await runtime.database
      .select()
      .from(calculationParticipants)
      .where(
        eq(
          calculationParticipants.calculationId,
          row?.resultCalculationId ?? raise("Expected result calculation id")
        )
      );
    expect(participantsAfterRetry).toHaveLength(1);
    await expect(
      jobStore.getOwnerScopedResult({
        ownerUserId,
        calculationId: row?.resultCalculationId ?? raise("Expected result calculation id")
      })
    ).resolves.toMatchObject({ schemaVersion: "chart-result.v1" });
  });

  it("persists solar return calculation records with dual-wheel summary", async () => {
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const ownerUserId = await createClientUser();
    ownerUserIds.push(ownerUserId);
    const created = await jobStore.createOrReuseChartJob(createSolarReturnInput(ownerUserId));
    if (created.kind !== "active_job") throw new Error("Expected active job");

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        result: solarReturnChartResult(),
        resultChecksum: digest("c"),
        now: "2026-07-20T12:00:05.000Z"
      })
    ).resolves.toBe(true);

    const job = await runtime.database.query.chartCalculationJobs.findFirst({
      where: eq(chartCalculationJobs.id, created.jobId)
    });
    const calculation = await runtime.database.query.calculationRecords.findFirst({
      where: eq(
        calculationRecords.id,
        job?.resultCalculationId ?? raise("Expected result calculation id")
      )
    });

    expect(calculation).toMatchObject({
      methodCode: "solar_return",
      title: "Solar return chart",
      resultSummary: {
        provider: "kerykeion",
        natalPointCount: 14,
        solarReturnPointCount: 14,
        solarReturnAspectCount: 0,
        resolvedAt: "2026-07-15T01:20:01.000Z"
      }
    });
  });

  it("persists composite calculation records with single-wheel relationship summary", async () => {
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const ownerUserId = await createClientUser();
    ownerUserIds.push(ownerUserId);
    const created = await jobStore.createOrReuseChartJob(createCompositeInput(ownerUserId));
    if (created.kind !== "active_job") throw new Error("Expected active job");

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        result: compositeChartResult(),
        resultChecksum: digest("9"),
        now: "2026-07-20T12:00:05.000Z"
      })
    ).resolves.toBe(true);

    const job = await runtime.database.query.chartCalculationJobs.findFirst({
      where: eq(chartCalculationJobs.id, created.jobId)
    });
    const calculation = await runtime.database.query.calculationRecords.findFirst({
      where: eq(
        calculationRecords.id,
        job?.resultCalculationId ?? raise("Expected result calculation id")
      )
    });

    expect(calculation).toMatchObject({
      methodCode: "composite",
      title: "Composite chart",
      resultSummary: {
        provider: "kerykeion",
        pointCount: 14,
        houseCount: 12,
        aspectCount: 0
      }
    });
  });

  it("persists progression calculation records with dual-wheel summary", async () => {
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const ownerUserId = await createClientUser();
    ownerUserIds.push(ownerUserId);
    const created = await jobStore.createOrReuseChartJob(createProgressionInput(ownerUserId));
    if (created.kind !== "active_job") throw new Error("Expected active job");

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        result: progressionChartResult(),
        resultChecksum: digest("e"),
        now: "2026-07-20T12:00:05.000Z"
      })
    ).resolves.toBe(true);

    const job = await runtime.database.query.chartCalculationJobs.findFirst({
      where: eq(chartCalculationJobs.id, created.jobId)
    });
    const calculation = await runtime.database.query.calculationRecords.findFirst({
      where: eq(
        calculationRecords.id,
        job?.resultCalculationId ?? raise("Expected result calculation id")
      )
    });

    expect(calculation).toMatchObject({
      methodCode: "progression",
      title: "Progression chart",
      resultSummary: {
        provider: "kerykeion",
        natalPointCount: 14,
        progressedPointCount: 14,
        progressionAspectCount: 0,
        targetDate: "2026-07-23",
        symbolicDate: "1990-08-20",
        ageDays: 36
      }
    });
  });

  it("persists horary calculation records with question summary", async () => {
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const ownerUserId = await createClientUser();
    ownerUserIds.push(ownerUserId);
    const created = await jobStore.createOrReuseChartJob(createHoraryInput(ownerUserId));
    if (created.kind !== "active_job") throw new Error("Expected active job");

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        result: horaryChartResult(),
        resultChecksum: digest("7"),
        now: "2026-07-20T12:00:05.000Z"
      })
    ).resolves.toBe(true);

    const job = await runtime.database.query.chartCalculationJobs.findFirst({
      where: eq(chartCalculationJobs.id, created.jobId)
    });
    const calculation = await runtime.database.query.calculationRecords.findFirst({
      where: eq(
        calculationRecords.id,
        job?.resultCalculationId ?? raise("Expected result calculation id")
      )
    });

    expect(calculation).toMatchObject({
      methodCode: "horary",
      title: "Horary chart",
      resultSummary: {
        provider: "kerykeion",
        pointCount: 14,
        houseCount: 12,
        aspectCount: 0,
        question: "Стоит ли принимать предложение?",
        category: "career",
        date: "2026-07-23",
        time: "14:30",
        timezone: "Europe/Moscow"
      }
    });
  });

  async function createClientUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    const userId = result.rows[0]?.id ?? raise("Expected user insert to return id");
    await runtime.pool.query(
      "insert into client_profiles (user_id, display_name_snapshot, created_at, updated_at) values ($1, 'Chart Client', now(), now())",
      [userId]
    );
    return userId;
  }
});

function createInput(ownerUserId: string) {
  return {
    ownerUserId,
    clientId: ownerUserId,
    inputFingerprint: digest("a"),
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    settingsSnapshot: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    }
  };
}

function createSolarReturnInput(ownerUserId: string) {
  const input = createInput(ownerUserId);
  return {
    ...input,
    method: "solar_return" as const,
    inputFingerprint: digest("d"),
    inputSnapshot: {
      inputSnapshot: input.inputSnapshot,
      solarReturnSnapshot: {
        year: 2026,
        returnType: "solar",
        location: {
          timezone: "Europe/Rome",
          latitude: 41.9028,
          longitude: 12.4964
        }
      }
    }
  };
}

function createCompositeInput(ownerUserId: string) {
  const input = createInput(ownerUserId);
  return {
    ...input,
    method: "composite" as const,
    inputFingerprint: digest("8"),
    inputSnapshot: {
      inputSnapshot: input.inputSnapshot,
      partnerInputSnapshot: {
        birthDate: "1992-08-11",
        birthTime: "22:15",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173,
        birthTimePrecision: "exact"
      },
      relationshipSnapshot: {
        primaryClientId: ownerUserId,
        partnerClientId: ownerUserId
      }
    }
  };
}

function createProgressionInput(ownerUserId: string) {
  const input = createInput(ownerUserId);
  return {
    ...input,
    method: "progression" as const,
    inputFingerprint: digest("f"),
    inputSnapshot: {
      inputSnapshot: input.inputSnapshot,
      progressionSnapshot: {
        targetDate: "2026-07-23",
        progressionType: "secondary"
      }
    }
  };
}

function createHoraryInput(ownerUserId: string) {
  const input = createInput(ownerUserId);
  return {
    ...input,
    method: "horary" as const,
    inputFingerprint: digest("6"),
    inputSnapshot: {
      questionSnapshot: horaryQuestion()
    }
  };
}

function chartResult() {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    },
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: {
      points: completePoints(),
      houses: completeHouses(),
      aspects: [],
      distributions: {
        elements: { fire: 0, earth: 0, air: 0, water: 0 },
        modalities: { cardinal: 0, fixed: 0, mutable: 0 },
        polarity: { masculine: 0, feminine: 0 }
      },
      warnings: []
    }
  };
}

function solarReturnChartResult() {
  const natal = chartResult();
  return {
    schemaVersion: "chart-result.v1",
    method: "solar_return",
    provider: natal.provider,
    settings: natal.settings,
    inputSnapshot: natal.inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar",
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      resolvedAt: "2026-07-15T01:20:01.000Z"
    },
    result: {
      natal: natal.result,
      solarReturn: natal.result,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function compositeChartResult() {
  const natal = chartResult();
  return {
    schemaVersion: "chart-result.v1",
    method: "composite",
    provider: natal.provider,
    settings: natal.settings,
    inputSnapshot: natal.inputSnapshot,
    partnerInputSnapshot: {
      birthDate: "1992-08-11",
      birthTime: "22:15",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      birthTimePrecision: "exact"
    },
    relationshipSnapshot: {
      primaryClientId: "00000000-0000-4000-8000-000000000001",
      partnerClientId: "00000000-0000-4000-8000-000000000002"
    },
    result: natal.result
  };
}

function progressionChartResult() {
  const natal = chartResult();
  return {
    schemaVersion: "chart-result.v1",
    method: "progression",
    provider: natal.provider,
    settings: natal.settings,
    inputSnapshot: natal.inputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary",
      calculationBasis: {
        symbolicDate: "1990-08-20",
        ageDays: 36,
        dayForYearRatio: 1
      }
    },
    result: {
      natal: natal.result,
      progressed: natal.result,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function horaryChartResult() {
  const natal = chartResult();
  return {
    schemaVersion: "chart-result.v1",
    method: "horary",
    provider: natal.provider,
    settings: natal.settings,
    questionSnapshot: horaryQuestion(),
    result: natal.result
  };
}

function horaryQuestion() {
  return {
    question: "Стоит ли принимать предложение?",
    category: "career",
    date: "2026-07-23",
    time: "14:30",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  };
}

function completePoints() {
  return [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "ascendant",
    "midheaven",
    "north_node",
    "south_node"
  ].map((id, index) => ({
    id,
    label: id,
    longitude: index * 20,
    sign: "aries",
    signDegree: index % 29,
    house: index < 12 ? index + 1 : null,
    retrograde: false
  }));
}

function completeHouses() {
  return Array.from({ length: 12 }, (_, index) => ({
    number: index + 1,
    longitude: index * 30,
    sign: "aries",
    signDegree: 0
  }));
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
