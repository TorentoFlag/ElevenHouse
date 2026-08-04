import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ChartAiDraftIdempotencyKeyReuseError,
  buildChartAiDraftCommandRequestHash
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleChartAiDraftCommandStore } from "./drizzle-chart-ai-draft-command-store";

const databaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const isolatedDatabaseName = `elevenhouse_chart_ai_command_${process.pid}_${randomUUID()
  .replaceAll("-", "")
  .slice(0, 8)}`;
const isolatedDatabaseUrl = withDatabaseName(databaseUrl, isolatedDatabaseName);
const actorUserId = randomUUID();
const calculationId = randomUUID();
const expectedResultChecksum = `sha256:${"a".repeat(64)}`;

describe("chart AI draft durable command Drizzle/PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: databaseUrl });
  const runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
  const store = createDrizzleChartAiDraftCommandStore(runtime.database);

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${isolatedDatabaseName}"`);
    await runtime.pool.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
    await runtime.pool.query("insert into users (id, status) values ($1, 'active')", [actorUserId]);
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime.close();
    } finally {
      try {
        await adminClient.query(`DROP DATABASE IF EXISTS "${isolatedDatabaseName}" WITH (FORCE)`);
      } finally {
        await adminClient.end();
      }
    }
  }, 30_000);

  it("commits one acquisition and reports a concurrent duplicate as processing", async () => {
    const key = `chart-ai:${randomUUID()}`;
    const requestHash = requestHashFor(calculationId);
    const input = commandInput({ key, requestHash });

    const outcomes = await Promise.all([store.acquire(input), store.acquire(input)]);

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["acquired", "processing"]);
    expect(new Set(outcomes.map(({ commandId }) => commandId)).size).toBe(1);
    await expect(
      store.acquire(
        commandInput({
          key,
          requestHash: requestHashFor(randomUUID())
        })
      )
    ).rejects.toBeInstanceOf(ChartAiDraftIdempotencyKeyReuseError);
  });

  it("replays a terminal known failure without reopening processing", async () => {
    const key = `chart-ai:${randomUUID()}`;
    const input = commandInput({ key, requestHash: requestHashFor(calculationId) });
    const acquired = await store.acquire(input);
    if (acquired.kind !== "acquired") throw new Error("Expected acquired command");

    await expect(
      store.completeKnownFailure({
        commandId: acquired.commandId,
        actorUserId,
        failure: {
          statusCode: 422,
          code: "AI_PROVIDER_REFUSED",
          message: "AI generation was refused for this input"
        },
        now: "2026-08-03T12:01:00.000Z"
      })
    ).resolves.toMatchObject({ kind: "known_failure", statusCode: 422 });
    await expect(store.acquire(input)).resolves.toMatchObject({
      kind: "completed",
      commandId: acquired.commandId,
      result: {
        kind: "known_failure",
        statusCode: 422,
        code: "AI_PROVIDER_REFUSED"
      }
    });
  });

  it("removes an expired terminal tombstone and permits a new request identity", async () => {
    const key = `chart-ai:${randomUUID()}`;
    const firstInput = commandInput({ key, requestHash: requestHashFor(calculationId) });
    const first = await store.acquire(firstInput);
    if (first.kind !== "acquired") throw new Error("Expected acquired command");
    await store.completeKnownFailure({
      commandId: first.commandId,
      actorUserId,
      failure: {
        statusCode: 422,
        code: "AI_PROVIDER_REFUSED",
        message: "AI generation was refused for this input"
      },
      now: "2026-08-03T12:01:00.000Z"
    });

    const next = await store.acquire(
      commandInput({
        key,
        requestHash: requestHashFor(randomUUID()),
        now: "2026-08-04T12:00:00.000Z",
        expiresAt: "2026-08-05T12:00:00.000Z"
      })
    );

    expect(next).toMatchObject({ kind: "acquired" });
    expect(next.commandId).not.toBe(first.commandId);
  });

  it("terminalizes an expired processing command as unknown instead of repeating provider cost", async () => {
    const key = `chart-ai:${randomUUID()}`;
    const requestHash = requestHashFor(calculationId);
    const first = await store.acquire(commandInput({ key, requestHash }));
    if (first.kind !== "acquired") throw new Error("Expected acquired command");
    const renewedInput = commandInput({
      key,
      requestHash,
      now: "2026-08-04T12:00:00.000Z",
      expiresAt: "2026-08-05T12:00:00.000Z"
    });

    const outcomes = await Promise.all([store.acquire(renewedInput), store.acquire(renewedInput)]);

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["completed", "completed"]);
    expect(new Set(outcomes.map(({ commandId }) => commandId))).toHaveLength(1);
    expect(outcomes[0]?.commandId).toBe(first.commandId);
    expect(outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "completed",
          result: expect.objectContaining({
            kind: "unknown_outcome",
            code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN"
          })
        })
      ])
    );
  });

  it("recovers a crash after deterministic interpretation save and replays success", async () => {
    const key = `chart-ai:${randomUUID()}`;
    const input = commandInput({ key, requestHash: requestHashFor(calculationId) });
    const acquired = await store.acquire(input);
    if (acquired.kind !== "acquired") throw new Error("Expected acquired command");

    await runtime.pool.query(
      `insert into calculation_records
        (id, owner_user_id, module, mode, method_code, title, status,
         request_fingerprint, input_data, result_data, result_summary, result_checksum,
         created_at, updated_at)
       values ($1, $2, 'chart', 'individual', 'natal', 'Recovery chart', 'calculated',
         $3, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $4, now(), now())`,
      [calculationId, actorUserId, `sha256:${"b".repeat(64)}`, expectedResultChecksum]
    );
    await runtime.pool.query(
      `insert into calculation_interpretations
        (id, calculation_id, source, status, text, model_id, prompt_version,
         approved_at, created_at, updated_at)
       values ($1, $2, 'ai', 'draft', 'Recovered draft', 'gpt-test',
         'chart.interpretationDraft@3', null, now(), now())`,
      [acquired.commandId, calculationId]
    );

    await expect(
      store.completeSuccess({
        commandId: acquired.commandId,
        actorUserId,
        calculationId,
        expectedResultChecksum,
        now: "2026-08-03T12:02:00.000Z"
      })
    ).resolves.toMatchObject({
      kind: "success",
      calculationId,
      interpretationId: acquired.commandId
    });
    await expect(store.acquire(input)).resolves.toMatchObject({
      kind: "completed",
      result: {
        kind: "success",
        calculationId,
        interpretationId: acquired.commandId
      }
    });
  });

  it("periodically terminalizes expired processing commands using the database clock", async () => {
    const key = `chart-ai:${randomUUID()}`;
    const input = commandInput({
      key,
      requestHash: requestHashFor(calculationId),
      now: "2000-01-01T00:00:00.000Z",
      expiresAt: "2000-01-02T00:00:00.000Z"
    });
    const acquired = await store.acquire(input);
    if (acquired.kind !== "acquired") throw new Error("Expected acquired command");

    await expect(
      store.reconcileExpiredProcessing({ retentionMs: 86_400_000, limit: 100 })
    ).resolves.toBe(1);
    await expect(
      store.acquire(
        commandInput({
          key,
          requestHash: input.requestHash,
          now: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString()
        })
      )
    ).resolves.toMatchObject({
      kind: "completed",
      commandId: acquired.commandId,
      result: { kind: "unknown_outcome", code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN" }
    });
  });
});

function requestHashFor(requestCalculationId: string): `sha256:${string}` {
  return buildChartAiDraftCommandRequestHash({
    actorUserId,
    calculationId: requestCalculationId,
    body: { expectedResultChecksum }
  });
}

function commandInput(input: {
  readonly key: string;
  readonly requestHash: string;
  readonly now?: string;
  readonly expiresAt?: string;
}) {
  return {
    actorUserId,
    key: input.key,
    requestHash: input.requestHash,
    now: input.now ?? "2026-08-03T12:00:00.000Z",
    expiresAt: input.expiresAt ?? "2026-08-04T12:00:00.000Z"
  };
}

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value);
}

function withDatabaseName(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}
