import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CALCULATION_PDF_DELETE_REQUESTED_EVENT,
  CALCULATION_PDF_REQUESTED_EVENT
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleCalculationStore } from "./drizzle-calculation-store";
import { createDrizzleCalculationPdfJobStore } from "./drizzle-calculation-pdf-job-store";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const digest = (character: string) => `sha256:${character.repeat(64)}`;

describe("calculation PDF Drizzle/PostgreSQL integration", () => {
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

  it("creates one atomic private job identity and completes its artifact", async () => {
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const calculation = await createCalculation(ownerUserId);
    const store = createDrizzleCalculationPdfJobStore(runtime.database);
    const identity = {
      ownerUserId,
      calculationId: calculation.id,
      module: "numerology" as const,
      methodCode: "pythagorean",
      resultChecksum: calculation.resultChecksum,
      locale: "ru" as const,
      sourceLocator: {
        kind: "approved_interpretation" as const,
        interpretationId: null
      },
      documentFingerprint: digest("c"),
      privateStorageBucket: "calculation-pdfs",
      originalFileName: "numerology-report.pdf",
      now: "2026-07-15T10:00:00.000Z"
    };
    const firstIds = candidateIds();
    const secondIds = candidateIds();

    const [first, replay] = await Promise.all([
      store.enqueue({
        ...identity,
        ...firstIds,
        storageKey: `owners/${ownerUserId}/calculation-pdfs/${firstIds.id}.pdf`
      }),
      store.enqueue({
        ...identity,
        ...secondIds,
        storageKey: `owners/${ownerUserId}/calculation-pdfs/${secondIds.id}.pdf`
      })
    ]);

    expect(first).not.toBeNull();
    expect(replay?.id).toBe(first?.id);
    expect(first).toMatchObject({
      ownerUserId,
      calculationId: calculation.id,
      module: "numerology",
      methodCode: "pythagorean",
      status: "queued",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null }
    });
    await expect(
      store.findLatestByCalculation({ ownerUserId, calculationId: calculation.id, locale: "ru" })
    ).resolves.toMatchObject({ id: first?.id });
    await expect(
      store.findById({
        ownerUserId: randomUUID(),
        calculationId: calculation.id,
        jobId: first?.id ?? ""
      })
    ).resolves.toBeNull();

    const databaseState = await runtime.pool.query<{
      media_count: string;
      artifact_count: string;
      outbox_count: string;
      payload: { jobId: string };
    }>(
      `select
         (select count(*) from media_assets where owner_user_id = $1 and purpose = 'calculation_report_pdf') as media_count,
         (select count(*) from calculation_artifacts where calculation_id = $2) as artifact_count,
         count(*) as outbox_count,
         max(payload::text)::jsonb as payload
       from outbox_events
       where event_type = $3 and aggregate_id = $4`,
      [ownerUserId, calculation.id, CALCULATION_PDF_REQUESTED_EVENT, first?.id]
    );
    expect(databaseState.rows[0]).toMatchObject({
      media_count: "1",
      artifact_count: "1",
      outbox_count: "1",
      payload: { jobId: first?.id }
    });

    await expect(
      store.claimForRendering({
        jobId: first?.id ?? "",
        now: "2026-07-15T10:01:00.000Z"
      })
    ).resolves.toMatchObject({ status: "processing" });
    await expect(
      store.complete({
        jobId: first?.id ?? "",
        checksumSha256: "d".repeat(64),
        sizeBytes: 12_345,
        pageCount: 4,
        now: "2026-07-15T10:02:00.000Z"
      })
    ).resolves.toMatchObject({ status: "ready", pageCount: 4 });
  });

  it("permits a new identity after the previous job fails", async () => {
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const calculation = await createCalculation(ownerUserId);
    const store = createDrizzleCalculationPdfJobStore(runtime.database);
    const firstIds = candidateIds();
    const first = await store.enqueue({
      ...firstIds,
      ownerUserId,
      calculationId: calculation.id,
      module: "numerology",
      methodCode: "pythagorean",
      resultChecksum: calculation.resultChecksum,
      locale: "en",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null },
      documentFingerprint: digest("e"),
      privateStorageBucket: "calculation-pdfs",
      storageKey: `owners/${ownerUserId}/calculation-pdfs/${firstIds.id}.pdf`,
      originalFileName: "numerology-report.pdf",
      now: "2026-07-15T11:00:00.000Z"
    });
    await store.fail({
      jobId: first?.id ?? "",
      code: "invalid_source",
      reason: "Internal source validation detail",
      now: "2026-07-15T11:01:00.000Z"
    });
    const nextIds = candidateIds();
    const next = await store.enqueue({
      ...nextIds,
      ownerUserId,
      calculationId: calculation.id,
      module: "numerology",
      methodCode: "pythagorean",
      resultChecksum: calculation.resultChecksum,
      locale: "en",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null },
      documentFingerprint: digest("e"),
      privateStorageBucket: "calculation-pdfs",
      storageKey: `owners/${ownerUserId}/calculation-pdfs/${nextIds.id}.pdf`,
      originalFileName: "numerology-report.pdf",
      now: "2026-07-15T11:02:00.000Z"
    });

    expect(next?.id).not.toBe(first?.id);
    expect(next?.status).toBe("queued");
  });

  it("removes a replaced ready PDF from active records and schedules its object cleanup", async () => {
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const calculation = await createCalculation(ownerUserId);
    const store = createDrizzleCalculationPdfJobStore(runtime.database);
    const firstIds = candidateIds();
    const first = await store.enqueue({
      ...firstIds,
      ownerUserId,
      calculationId: calculation.id,
      module: "numerology",
      methodCode: "pythagorean",
      resultChecksum: calculation.resultChecksum,
      locale: "ru",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null },
      documentFingerprint: digest("f"),
      privateStorageBucket: "calculation-pdfs",
      storageKey: `owners/${ownerUserId}/calculation-pdfs/${firstIds.id}.pdf`,
      originalFileName: "numerology-report.pdf",
      now: "2026-07-15T12:00:00.000Z"
    });
    await store.claimForRendering({
      jobId: first?.id ?? "",
      now: "2026-07-15T12:01:00.000Z"
    });
    await store.complete({
      jobId: first?.id ?? "",
      checksumSha256: "a".repeat(64),
      sizeBytes: 1_000,
      pageCount: 1,
      now: "2026-07-15T12:02:00.000Z"
    });

    const replacementIds = candidateIds();
    const replacement = await store.enqueue({
      ...replacementIds,
      ownerUserId,
      calculationId: calculation.id,
      module: "numerology",
      methodCode: "pythagorean",
      resultChecksum: calculation.resultChecksum,
      locale: "ru",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null },
      documentFingerprint: digest("e"),
      privateStorageBucket: "calculation-pdfs",
      storageKey: `owners/${ownerUserId}/calculation-pdfs/${replacementIds.id}.pdf`,
      originalFileName: "numerology-report.pdf",
      now: "2026-07-15T12:03:00.000Z"
    });
    await store.claimForRendering({
      jobId: replacement?.id ?? "",
      now: "2026-07-15T12:04:00.000Z"
    });
    await store.complete({
      jobId: replacement?.id ?? "",
      checksumSha256: "b".repeat(64),
      sizeBytes: 2_000,
      pageCount: 2,
      now: "2026-07-15T12:05:00.000Z"
    });

    const state = await runtime.pool.query<{
      active_job_ids: string[];
      active_artifact_ids: string[];
      replaced_media_still_exists: string;
      cleanup_aggregate_id: string | null;
      cleanup_payload: { mediaAssetId: string } | null;
    }>(
      `select
         array(select id from calculation_pdf_jobs where calculation_id = $1 order by id) as active_job_ids,
         array(select id from calculation_artifacts where calculation_id = $1 order by id) as active_artifact_ids,
         (select count(*) from media_assets where id = $2) as replaced_media_still_exists,
         (select aggregate_id from outbox_events where event_type = $3 and aggregate_id = $2) as cleanup_aggregate_id,
         (select payload from outbox_events where event_type = $3 and aggregate_id = $2) as cleanup_payload`,
      [
        calculation.id,
        first?.mediaAssetId ?? "",
        CALCULATION_PDF_DELETE_REQUESTED_EVENT
      ]
    );
    expect(state.rows[0]).toEqual({
      active_job_ids: [replacement?.id],
      active_artifact_ids: [replacement?.artifactId],
      replaced_media_still_exists: "1",
      cleanup_aggregate_id: first?.mediaAssetId,
      cleanup_payload: { mediaAssetId: first?.mediaAssetId }
    });
  });

  it("cleans a rendering PDF that finishes after a newer document", async () => {
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const calculation = await createCalculation(ownerUserId);
    const store = createDrizzleCalculationPdfJobStore(runtime.database);
    const firstIds = candidateIds();
    const first = await store.enqueue({
      ...firstIds,
      ownerUserId,
      calculationId: calculation.id,
      module: "numerology",
      methodCode: "pythagorean",
      resultChecksum: calculation.resultChecksum,
      locale: "en",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null },
      documentFingerprint: digest("c"),
      privateStorageBucket: "calculation-pdfs",
      storageKey: `owners/${ownerUserId}/calculation-pdfs/${firstIds.id}.pdf`,
      originalFileName: "numerology-report.pdf",
      now: "2026-07-15T13:00:00.000Z"
    });
    await store.claimForRendering({
      jobId: first?.id ?? "",
      now: "2026-07-15T13:01:00.000Z"
    });

    const replacementIds = candidateIds();
    const replacement = await store.enqueue({
      ...replacementIds,
      ownerUserId,
      calculationId: calculation.id,
      module: "numerology",
      methodCode: "pythagorean",
      resultChecksum: calculation.resultChecksum,
      locale: "en",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null },
      documentFingerprint: digest("d"),
      privateStorageBucket: "calculation-pdfs",
      storageKey: `owners/${ownerUserId}/calculation-pdfs/${replacementIds.id}.pdf`,
      originalFileName: "numerology-report.pdf",
      now: "2026-07-15T13:02:00.000Z"
    });
    await store.claimForRendering({
      jobId: replacement?.id ?? "",
      now: "2026-07-15T13:03:00.000Z"
    });
    await expect(
      store.complete({
        jobId: replacement?.id ?? "",
        checksumSha256: "c".repeat(64),
        sizeBytes: 2_000,
        pageCount: 2,
        now: "2026-07-15T13:04:00.000Z"
      })
    ).resolves.toMatchObject({ id: replacement?.id, status: "ready" });
    await expect(
      store.complete({
        jobId: first?.id ?? "",
        checksumSha256: "d".repeat(64),
        sizeBytes: 1_000,
        pageCount: 1,
        now: "2026-07-15T13:05:00.000Z"
      })
    ).resolves.toBeNull();

    const state = await runtime.pool.query<{
      active_job_ids: string[];
      cleanup_aggregate_id: string | null;
      cleanup_payload: { mediaAssetId: string } | null;
    }>(
      `select
         array(select id from calculation_pdf_jobs where calculation_id = $1 order by id) as active_job_ids,
         (select aggregate_id from outbox_events where event_type = $2 and aggregate_id = $3) as cleanup_aggregate_id,
         (select payload from outbox_events where event_type = $2 and aggregate_id = $3) as cleanup_payload`,
      [
        calculation.id,
        CALCULATION_PDF_DELETE_REQUESTED_EVENT,
        first?.mediaAssetId ?? ""
      ]
    );
    expect(state.rows[0]).toEqual({
      active_job_ids: [replacement?.id],
      cleanup_aggregate_id: first?.mediaAssetId,
      cleanup_payload: { mediaAssetId: first?.mediaAssetId }
    });
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user insert to return id");
  }

  async function createCalculation(ownerUserId: string) {
    return createDrizzleCalculationStore(runtime.database).create({
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      title: "PDF integration",
      participants: [
        {
          role: "subject",
          source: "manual",
          clientId: null,
          displayName: "Тест"
        }
      ],
      linkClientIds: [],
      requestFingerprint: digest("a"),
      inputData: { name: "Тест" },
      resultData: { lifePath: 1 },
      resultSummary: { lifePath: 1 },
      resultChecksum: digest("b"),
      idGenerator: randomUUID,
      now: "2026-07-15T09:00:00.000Z"
    });
  }
});

function candidateIds() {
  return {
    id: randomUUID(),
    mediaAssetId: randomUUID(),
    artifactId: randomUUID(),
    outboxEventId: randomUUID()
  };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
