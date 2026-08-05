import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  completeAiUsageAttempt,
  failAiUsageAttempt,
  reconcileStaleAiUsageAttempts,
  startAiUsageAttempt
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleAiUsageStore } from "./drizzle-ai-usage-store";

const databaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const ownerSafetyId = `eh_${"a".repeat(61)}`;

describe("AI usage Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const usageIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (usageIds.length > 0) {
        await runtime.pool.query("delete from ai_usage_records where id = any($1)", [usageIds]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("persists terminal technical usage evidence with exact replay", async () => {
    const store = createDrizzleAiUsageStore(runtime.database);
    const id = randomUUID();
    usageIds.push(id);
    const started = await startAiUsageAttempt({
      store,
      idGenerator: () => id,
      feature: "dictionary.aiDraft",
      promptId: "dictionary.entryDraft",
      promptVersion: 1,
      provider: "openai",
      ownerSafetyId,
      resourceEvidence: null,
      now: new Date("2026-08-03T12:00:00.000Z")
    });
    expect(started).toMatchObject({ status: "started", resourceId: null });
    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => id,
        feature: "dictionary.aiDraft",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        provider: "openai",
        ownerSafetyId,
        resourceEvidence: null,
        now: new Date("2026-08-03T12:00:00.000Z")
      })
    ).resolves.toEqual(started);

    const completion = {
      store,
      attemptId: id,
      model: "gpt-5.4-mini",
      finishReason: "completed",
      durationMs: 75,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      now: new Date("2026-08-03T12:00:00.075Z")
    } as const;
    const completed = await completeAiUsageAttempt(completion);
    await expect(completeAiUsageAttempt(completion)).resolves.toEqual(completed);
    await expect(
      failAiUsageAttempt({
        store,
        attemptId: id,
        safeErrorCode: "AI_PROVIDER_TIMEOUT",
        durationMs: 100,
        now: new Date("2026-08-03T12:00:00.100Z")
      })
    ).rejects.toThrow("Failed AI usage evidence does not match its command");
  });

  it("persists chart resource evidence without any consent relation", async () => {
    const store = createDrizzleAiUsageStore(runtime.database);
    const id = randomUUID();
    usageIds.push(id);
    await expect(
      startAiUsageAttempt({
        store,
        idGenerator: () => id,
        feature: "chart.interpretationDraft",
        promptId: "chart.interpretationDraft",
        promptVersion: 3,
        provider: "openai",
        ownerSafetyId,
        resourceEvidence: {
          resourceType: "chart_calculation",
          resourceId: id,
          sourceChecksum: `sha256:${"c".repeat(64)}`
        },
        now: new Date("2026-08-03T12:20:00.000Z")
      })
    ).resolves.toMatchObject({
      id,
      resourceType: "chart_calculation",
      resourceId: id,
      sourceChecksum: `sha256:${"c".repeat(64)}`
    });
    await expect(
      runtime.pool.query("update ai_usage_records set source_checksum = $2 where id = $1", [
        id,
        `sha256:${"e".repeat(64)}`
      ])
    ).rejects.toMatchObject({ code: "55000", constraint: "ai_usage_records_one_way_lifecycle" });
  });

  it("claims stale attempts without overlap and records only indeterminate evidence", async () => {
    const leftStore = createDrizzleAiUsageStore(runtime.database);
    const rightStore = createDrizzleAiUsageStore(runtime.database);
    const staleIds: readonly [string, string] = [randomUUID(), randomUUID()];
    const freshId = randomUUID();
    usageIds.push(...staleIds, freshId);
    for (const [id, startedAt] of [
      [staleIds[0], "2026-08-03T12:00:00.000Z"],
      [staleIds[1], "2026-08-03T12:01:00.000Z"],
      [freshId, "2026-08-03T12:10:00.000Z"]
    ] as const) {
      await startAiUsageAttempt({
        store: leftStore,
        idGenerator: () => id,
        feature: "dictionary.aiDraft",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        provider: "openai",
        ownerSafetyId,
        resourceEvidence: null,
        now: new Date(startedAt)
      });
    }
    const reconciliation = {
      startedBefore: new Date("2026-08-03T12:05:00.000Z"),
      now: new Date("2026-08-03T12:11:00.000Z"),
      limit: 1
    } as const;
    const claims = await Promise.all([
      reconcileStaleAiUsageAttempts({ store: leftStore, ...reconciliation }),
      reconcileStaleAiUsageAttempts({ store: rightStore, ...reconciliation })
    ]);
    expect(new Set(claims.flat().map(({ id }) => id))).toEqual(new Set(staleIds));
  });
});

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}
