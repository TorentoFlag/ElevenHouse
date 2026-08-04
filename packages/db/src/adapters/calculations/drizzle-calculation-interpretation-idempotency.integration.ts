import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createCalculation,
  recalculateCalculation,
  saveCalculationInterpretation,
  type CalculationRecord,
  type CalculationStore
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleCalculationStore } from "./drizzle-calculation-store";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const digest = (character: string) => `sha256:${character.repeat(64)}`;

describe("manual interpretation resource idempotency with PostgreSQL", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const ownerUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (ownerUserIds.length > 0) {
        await runtime.pool.query("delete from audit_log_entries where actor_user_id = any($1)", [
          ownerUserIds
        ]);
        await runtime.pool.query("delete from calculation_records where owner_user_id = any($1)", [
          ownerUserIds
        ]);
        await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("replays one exact resource without changing timestamps or appending another audit", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const calculation = await createTestCalculation(store, ownerUserId, "a");
    const interpretationId = randomUUID();
    const first = await save(store, calculation, interpretationId, {
      text: "Проверено",
      now: "2026-08-03T10:01:00.000Z"
    });
    const firstState = await persistedState(calculation.id, interpretationId);

    const replay = await save(store, calculation, interpretationId, {
      text: "Проверено",
      now: "2026-08-03T10:09:00.000Z"
    });

    expect(replay.interpretations.filter(({ id }) => id === interpretationId)).toHaveLength(1);
    expect(replay.updatedAt).toBe(first.updatedAt);
    expect(await persistedState(calculation.id, interpretationId)).toEqual(firstState);
    expect(firstState).toMatchObject({ interpretation_count: "1", audit_count: "1" });
  });

  it("serializes concurrent exact retries into one interpretation and one audit", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const calculation = await createTestCalculation(store, ownerUserId, "b");
    const interpretationId = randomUUID();

    const results = await Promise.all([
      save(store, calculation, interpretationId, {
        text: "Concurrent exact retry",
        now: "2026-08-03T10:10:00.000Z"
      }),
      save(store, calculation, interpretationId, {
        text: "Concurrent exact retry",
        now: "2026-08-03T10:11:00.000Z"
      })
    ]);

    expect(results.map(({ updatedAt }) => updatedAt)).toEqual([
      "2026-08-03T10:10:00.000Z",
      "2026-08-03T10:10:00.000Z"
    ]);
    await expect(persistedState(calculation.id, interpretationId)).resolves.toMatchObject({
      interpretation_count: "1",
      audit_count: "1"
    });
  });

  it("rejects key reuse across checksum, source, text, calculation and owner without mutation", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    ownerUserIds.push(ownerUserId, otherOwnerUserId);
    const calculation = await createTestCalculation(store, ownerUserId, "c");
    const otherCalculation = await createTestCalculation(store, ownerUserId, "d");
    const foreignCalculation = await createTestCalculation(store, otherOwnerUserId, "e");
    const interpretationId = randomUUID();
    await save(store, calculation, interpretationId, {
      text: "Canonical text",
      now: "2026-08-03T10:20:00.000Z"
    });
    const before = await persistedState(calculation.id, interpretationId);

    for (const attempt of [
      () =>
        save(store, calculation, interpretationId, {
          expectedResultChecksum: digest("f"),
          text: "Canonical text",
          now: "2026-08-03T10:21:00.000Z"
        }),
      () =>
        save(store, calculation, interpretationId, {
          source: "ai",
          text: "Canonical text",
          modelId: "model",
          promptVersion: "prompt.v1",
          now: "2026-08-03T10:22:00.000Z"
        }),
      () =>
        save(store, calculation, interpretationId, {
          text: "Different text",
          now: "2026-08-03T10:23:00.000Z"
        }),
      () =>
        save(store, otherCalculation, interpretationId, {
          text: "Canonical text",
          now: "2026-08-03T10:24:00.000Z"
        }),
      () =>
        save(store, foreignCalculation, interpretationId, {
          text: "Canonical text",
          now: "2026-08-03T10:25:00.000Z"
        })
    ]) {
      await expect(attempt()).rejects.toMatchObject({
        name: "CalculationInterpretationIdempotencyConflictError",
        code: "CALCULATION_INTERPRETATION_IDEMPOTENCY_CONFLICT"
      });
    }

    expect(await persistedState(calculation.id, interpretationId)).toEqual(before);
    const foreignRows = await runtime.pool.query<{ count: string }>(
      "select count(*) from calculation_interpretations where calculation_id = any($1)",
      [[otherCalculation.id, foreignCalculation.id]]
    );
    expect(foreignRows.rows[0]?.count).toBe("0");
  });

  it("keeps a resource UUID reserved after recalculation removes the old draft", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const calculation = await createTestCalculation(store, ownerUserId, "1");
    const interpretationId = randomUUID();
    await save(store, calculation, interpretationId, {
      text: "Old result interpretation",
      now: "2026-08-03T10:30:00.000Z"
    });
    const recalculated = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      participants: calculation.participants,
      requestFingerprint: digest("2"),
      inputData: { name: "Мария", revision: 2 },
      resultData: { lifePath: 8 },
      resultSummary: { lifePath: 8 },
      resultChecksum: digest("2"),
      now: new Date("2026-08-03T10:31:00.000Z")
    });

    await expect(
      save(store, recalculated, interpretationId, {
        text: "New result interpretation",
        now: "2026-08-03T10:32:00.000Z"
      })
    ).rejects.toMatchObject({
      name: "CalculationInterpretationIdempotencyConflictError",
      code: "CALCULATION_INTERPRETATION_IDEMPOTENCY_CONFLICT"
    });
    const state = await runtime.pool.query<{ interpretations: string; audits: string }>(
      `select
         (select count(*) from calculation_interpretations where calculation_id = $1) as interpretations,
         (select count(*) from audit_log_entries
          where action = 'calculation.interpretation.saved'
            and metadata ->> 'interpretationId' = $2) as audits`,
      [calculation.id, interpretationId]
    );
    expect(state.rows[0]).toEqual({ interpretations: "0", audits: "1" });
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user id");
  }

  async function persistedState(calculationId: string, interpretationId: string) {
    const result = await runtime.pool.query<{
      calculation_updated_at: Date;
      interpretation_updated_at: Date;
      interpretation_count: string;
      audit_count: string;
    }>(
      `select
         calculation_records.updated_at as calculation_updated_at,
         max(calculation_interpretations.updated_at) as interpretation_updated_at,
         count(distinct calculation_interpretations.id) as interpretation_count,
         count(distinct audit_log_entries.id) as audit_count
       from calculation_records
       left join calculation_interpretations
         on calculation_interpretations.calculation_id = calculation_records.id
        and calculation_interpretations.id = $2
       left join audit_log_entries
         on audit_log_entries.target_type = 'calculation'
        and audit_log_entries.target_id = calculation_records.id::text
        and audit_log_entries.action = 'calculation.interpretation.saved'
       where calculation_records.id = $1
       group by calculation_records.updated_at`,
      [calculationId, interpretationId]
    );
    const row = result.rows[0] ?? raise("Expected persisted calculation state");
    return {
      ...row,
      calculation_updated_at: row.calculation_updated_at.toISOString(),
      interpretation_updated_at: row.interpretation_updated_at.toISOString()
    };
  }
});

async function createTestCalculation(
  store: CalculationStore,
  ownerUserId: string,
  fingerprintCharacter: string
): Promise<CalculationRecord> {
  return createCalculation({
    store,
    ownerUserId,
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    title: "Manual interpretation idempotency",
    participants: [{ role: "subject", source: "manual", clientId: null, displayName: "Мария" }],
    linkClientIds: [],
    requestFingerprint: digest(fingerprintCharacter),
    inputData: { name: "Мария" },
    resultData: { lifePath: 7 },
    resultSummary: { lifePath: 7 },
    resultChecksum: digest(fingerprintCharacter),
    idGenerator: randomUUID,
    now: new Date("2026-08-03T10:00:00.000Z")
  });
}

function save(
  store: CalculationStore,
  calculation: CalculationRecord,
  interpretationId: string,
  overrides: {
    readonly expectedResultChecksum?: string;
    readonly source?: "manual" | "ai";
    readonly text: string;
    readonly modelId?: string | null;
    readonly promptVersion?: string | null;
    readonly now: string;
  }
) {
  return saveCalculationInterpretation({
    store,
    ownerUserId: calculation.ownerUserId,
    calculationId: calculation.id,
    expectedResultChecksum: overrides.expectedResultChecksum ?? calculation.resultChecksum,
    source: overrides.source ?? "manual",
    text: overrides.text,
    modelId: overrides.modelId ?? null,
    promptVersion: overrides.promptVersion ?? null,
    interpretationIdGenerator: () => interpretationId,
    now: new Date(overrides.now)
  });
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
