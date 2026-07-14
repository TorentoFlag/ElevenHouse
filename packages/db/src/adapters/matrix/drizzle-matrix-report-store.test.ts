import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createDrizzleMatrixReportStore } from "./drizzle-matrix-report-store";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const reportId = "00000000-0000-4000-8000-000000000003";
const checksum = `sha256:${"a".repeat(64)}`;
const now = new Date("2026-07-14T12:00:00.000Z");

describe("createDrizzleMatrixReportStore", () => {
  it("reads only the report owned through the calculation boundary", async () => {
    const fake = createFakeDatabase([row()]);
    const report = await createDrizzleMatrixReportStore(fake.database as never).findByCalculation({
      ownerUserId,
      calculationId
    });
    expect(report).toMatchObject({ id: reportId, ownerUserId, calculationId, revision: 2 });
    expect(render(fake.wheres[0])).toMatchObject({
      sql: expect.stringContaining('"owner_user_id" = $1'),
      params: [ownerUserId, calculationId]
    });
  });

  it("uses one atomic checksum-guarded upsert and increments revision in PostgreSQL", async () => {
    const fake = createFakeDatabase([], [row({ revision: 3 })]);
    const report = await createDrizzleMatrixReportStore(fake.database as never).upsert({
      id: reportId,
      ownerUserId,
      calculationId,
      source: "manual",
      status: "ready",
      locale: "ru",
      content: content(),
      plainText: "Текст",
      expectedResultChecksum: checksum,
      resultChecksum: checksum,
      modelId: null,
      promptVersion: null,
      now: now.toISOString()
    });
    expect(report?.revision).toBe(3);
    const query = render(fake.executed[0]);
    expect(query.sql).toContain("for update");
    expect(query.sql).toContain('on conflict ("calculation_id") do update');
    expect(query.sql).toContain('"revision" = "matrix_report_drafts"."revision" + 1');
    expect(query.params).toEqual(
      expect.arrayContaining([reportId, ownerUserId, calculationId, checksum, "manual", "ready", "ru"])
    );
  });

  it("returns null when the owned current Matrix checksum is no longer eligible", async () => {
    const fake = createFakeDatabase([], []);
    await expect(
      createDrizzleMatrixReportStore(fake.database as never).upsert({
        id: reportId,
        ownerUserId,
        calculationId,
        source: "manual",
        status: "draft",
        locale: "ru",
        content: content(),
        plainText: "Текст",
        expectedResultChecksum: checksum,
        resultChecksum: checksum,
        modelId: null,
        promptVersion: null,
        now: now.toISOString()
      })
    ).resolves.toBeNull();
  });
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: reportId,
    ownerUserId,
    calculationId,
    source: "manual",
    status: "ready",
    locale: "ru",
    content: content(),
    plainText: "Текст",
    resultChecksum: checksum,
    revision: 2,
    modelId: null,
    promptVersion: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function content() {
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

function createFakeDatabase(
  selectRows: readonly Record<string, unknown>[],
  executeRows: readonly Record<string, unknown>[] = []
) {
  const wheres: SQL[] = [];
  const executed: SQL[] = [];
  return {
    wheres,
    executed,
    database: {
      select: () => ({
        from: () => ({
          where: (where: SQL) => {
            wheres.push(where);
            return { limit: async () => selectRows };
          }
        })
      }),
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
