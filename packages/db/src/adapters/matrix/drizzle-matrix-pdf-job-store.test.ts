import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createDrizzleMatrixPdfJobStore } from "./drizzle-matrix-pdf-job-store";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const reportId = "00000000-0000-4000-8000-000000000003";
const jobId = "00000000-0000-4000-8000-000000000004";
const mediaAssetId = "00000000-0000-4000-8000-000000000005";
const artifactId = "00000000-0000-4000-8000-000000000006";
const outboxEventId = "00000000-0000-4000-8000-000000000007";
const checksum = `sha256:${"a".repeat(64)}`;
const now = new Date("2026-07-14T12:00:00.000Z");

describe("createDrizzleMatrixPdfJobStore", () => {
  it("enqueues media, artifact, job and outbox atomically behind locked eligibility", async () => {
    const fake = createFakeDatabase([jobRow()]);
    const job = await createDrizzleMatrixPdfJobStore(fake.database as never).enqueue({
      id: jobId,
      mediaAssetId,
      artifactId,
      outboxEventId,
      ownerUserId,
      calculationId,
      reportId,
      reportRevision: 2,
      resultChecksum: checksum,
      locale: "ru",
      privateStorageBucket: "elevenhouse-private",
      storageKey: `${ownerUserId}/matrix_report_pdf/${jobId}/report.pdf`,
      originalFileName: "Матрица судьбы.pdf",
      now: now.toISOString()
    });

    expect(job).toMatchObject({ id: jobId, status: "queued", reportRevision: 2 });
    const query = render(fake.executed[0]);
    expect(query.sql).toContain("for update of");
    expect(query.sql).toContain('insert into "media_assets"');
    expect(query.sql).toContain('insert into "calculation_artifacts"');
    expect(query.sql).toContain('insert into "matrix_pdf_jobs"');
    expect(query.sql).toContain('insert into "outbox_events"');
    expect(query.sql).toContain("matrix.pdf.requested.v1");
    expect(query.sql).toContain("not exists (select 1 from existing_job)");
  });

  it("maps an immutable render claim with private storage coordinates", async () => {
    const fake = createFakeDatabase([
      {
        ...jobRow({ status: "processing" }),
        reportContent: reportContent(),
        reportPlainText: "Текст отчёта",
        storageBucket: "elevenhouse-private",
        storageKey: "owner/matrix_report_pdf/job/report.pdf",
        originalFileName: "Матрица судьбы.pdf"
      }
    ]);
    const claim = await createDrizzleMatrixPdfJobStore(fake.database as never).claimForRendering({
      jobId,
      now: now.toISOString()
    });
    expect(claim).toEqual({
      job: expect.objectContaining({ id: jobId, status: "processing" }),
      report: { content: reportContent(), plainText: "Текст отчёта" },
      storageBucket: "elevenhouse-private",
      storageKey: "owner/matrix_report_pdf/job/report.pdf",
      originalFileName: "Матрица судьбы.pdf"
    });
    const query = render(fake.executed[0]);
    expect(query.sql).toContain('"status" in (\'queued\', \'processing\')');
    expect(query.sql).toContain('"matrix_report_drafts"."status" = \'ready\'');
    expect(query.sql).toContain('"calculation_records"."result_checksum"');
  });

  it("completes or fails all linked state in a single SQL statement", async () => {
    const completeFake = createFakeDatabase([jobRow({ status: "ready" })]);
    const completeStore = createDrizzleMatrixPdfJobStore(completeFake.database as never);
    await completeStore.complete({
      jobId,
      checksumSha256: "b".repeat(64),
      sizeBytes: 42_000,
      now: now.toISOString()
    });
    const completeSql = render(completeFake.executed[0]).sql;
    expect(completeSql).toContain('update "media_assets"');
    expect(completeSql).toContain('update "calculation_artifacts"');
    expect(completeSql).toContain('"status" = \'ready\'');

    const failFake = createFakeDatabase([jobRow({ status: "failed", failureReason: "render" })]);
    await createDrizzleMatrixPdfJobStore(failFake.database as never).fail({
      jobId,
      reason: "render",
      now: now.toISOString()
    });
    const failSql = render(failFake.executed[0]).sql;
    expect(failSql).toContain('update "media_assets"');
    expect(failSql).toContain('update "calculation_artifacts"');
    expect(failSql).toContain('"status" = \'failed\'');
  });
});

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: jobId,
    calculationId,
    ownerUserId,
    reportId,
    reportRevision: 2,
    resultChecksum: checksum,
    locale: "ru",
    status: "queued",
    artifactId,
    mediaAssetId,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function reportContent() {
  return {
    overview: "Обзор",
    corePortrait: "Портрет",
    strengthsAndTalents: "Сильные стороны",
    growthAreas: "Рост",
    moneyAndRealization: "Деньги",
    relationships: "Отношения",
    lineageThemes: "Род",
    purposes: "Предназначения",
    yearProjection: null,
    reflectionQuestions: ["Вопрос?"],
    practicalSteps: ["Шаг"],
    disclaimer: "Дисклеймер"
  };
}

function createFakeDatabase(executeRows: readonly Record<string, unknown>[]) {
  const executed: SQL[] = [];
  return {
    executed,
    database: {
      execute: async (query: SQL) => {
        executed.push(query);
        return { rows: executeRows };
      }
    }
  };
}

function render(query: SQL | undefined) {
  if (!query) throw new Error("Expected Drizzle SQL");
  return new PgDialect().sqlToQuery(query);
}
