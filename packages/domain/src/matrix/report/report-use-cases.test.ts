import { describe, expect, it, vi } from "vitest";
import type { MatrixReportStore } from "./report-store";
import type { MatrixReportContent, MatrixReportDraft } from "./report-types";
import {
  assertMatrixReportPdfEligible,
  getMatrixReport,
  saveMatrixReport,
  toMatrixReportPlainText
} from "./report-use-cases";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const reportId = "00000000-0000-4000-8000-000000000003";
const checksum = `sha256:${"a".repeat(64)}`;
const nextChecksum = `sha256:${"b".repeat(64)}`;
const now = new Date("2026-07-14T10:00:00.000Z");

describe("Matrix report use cases", () => {
  it("gets the current report through an owner-scoped calculation key", async () => {
    const store = createStore();
    await getMatrixReport({ store, ownerUserId, calculationId });
    expect(store.findByCalculation).toHaveBeenCalledWith({ ownerUserId, calculationId });
  });

  it("normalizes content and delegates revisioning to an owner-scoped upsert", async () => {
    const store = createStore();
    await saveMatrixReport({
      store,
      ownerUserId,
      calculationId,
      source: "manual",
      status: "ready",
      locale: "ru",
      content: content({ overview: "  Главный вывод.  ", reflectionQuestions: ["  Что важно? "] }),
      expectedResultChecksum: checksum,
      currentResultChecksum: checksum,
      idGenerator: () => reportId,
      now
    });

    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: reportId,
        ownerUserId,
        calculationId,
        source: "manual",
        status: "ready",
        locale: "ru",
        expectedResultChecksum: checksum,
        resultChecksum: checksum,
        modelId: null,
        promptVersion: null,
        now: now.toISOString(),
        content: expect.objectContaining({
          overview: "Главный вывод.",
          reflectionQuestions: ["Что важно?"]
        })
      })
    );
    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ plainText: expect.stringContaining("Главный вывод.") })
    );
  });

  it("rejects a concurrent result change before persisting", async () => {
    const store = createStore();
    await expect(
      saveMatrixReport({
        store,
        ownerUserId,
        calculationId,
        source: "manual",
        status: "draft",
        locale: "ru",
        content: content(),
        expectedResultChecksum: checksum,
        currentResultChecksum: nextChecksum,
        idGenerator: () => reportId,
        now
      })
    ).rejects.toMatchObject({ code: "MATRIX_RESULT_CHANGED" });
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects a result change detected atomically by the store", async () => {
    const store = createStore({ upsertResult: null });
    await expect(
      saveMatrixReport({
        store,
        ownerUserId,
        calculationId,
        source: "manual",
        status: "draft",
        locale: "ru",
        content: content(),
        expectedResultChecksum: checksum,
        currentResultChecksum: checksum,
        idGenerator: () => reportId,
        now
      })
    ).rejects.toMatchObject({ code: "MATRIX_RESULT_CHANGED" });
  });

  it("derives stale state without deleting or changing the stored report", async () => {
    const store = createStore();
    const report = await getMatrixReport({ store, ownerUserId, calculationId });
    expect(report).not.toBeNull();
    expect(report!.content.overview).toBe("Текущее описание");
    expect(report!.resultChecksum).toBe(checksum);
    expect(report!.resultChecksum === nextChecksum).toBe(false);
  });

  it("renders deterministic localized plain text", () => {
    const first = toMatrixReportPlainText({ locale: "ru", content: content() });
    expect(toMatrixReportPlainText({ locale: "ru", content: content() })).toBe(first);
    expect(first).toContain("ОБЩАЯ КАРТИНА");
    expect(first).toContain("ВОПРОСЫ ДЛЯ РЕФЛЕКСИИ\n1. Что хочется исследовать?");
    expect(toMatrixReportPlainText({ locale: "en", content: content() })).toContain("OVERVIEW");
  });

  it("allows PDF only for a ready report bound to the current result", () => {
    const report = storedReport();
    expect(assertMatrixReportPdfEligible({ report, currentResultChecksum: checksum })).toBe(report);
    expect(() =>
      assertMatrixReportPdfEligible({ report: { ...report, status: "draft" }, currentResultChecksum: checksum })
    ).toThrow("ready");
    expect(() =>
      assertMatrixReportPdfEligible({ report, currentResultChecksum: nextChecksum })
    ).toMatchErrorCode("MATRIX_REPORT_STALE");
    expect(() =>
      assertMatrixReportPdfEligible({ report: null, currentResultChecksum: checksum })
    ).toMatchErrorCode("MATRIX_REPORT_NOT_FOUND");
  });
});

expect.extend({
  toMatchErrorCode(received: () => unknown, expected: string) {
    try {
      received();
      return { pass: false, message: () => `Expected function to throw ${expected}` };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as { code: unknown }).code : null;
      return {
        pass: code === expected,
        message: () => `Expected error code ${expected}, received ${String(code)}`
      };
    }
  }
});

declare module "vitest" {
  interface Assertion<T = any> {
    toMatchErrorCode(expected: string): T;
  }
}

function content(overrides: Partial<MatrixReportContent> = {}): MatrixReportContent {
  return {
    overview: "Общая картина",
    corePortrait: "Ядро личности",
    strengthsAndTalents: "Сильные стороны",
    growthAreas: "Зоны роста",
    moneyAndRealization: "Деньги и реализация",
    relationships: "Отношения",
    lineageThemes: "Родовые темы",
    purposes: "Предназначения",
    yearProjection: null,
    reflectionQuestions: ["Что хочется исследовать?"],
    practicalSteps: ["Записать один наблюдаемый шаг."],
    disclaimer: "Матрица — инструмент рефлексии, а не предсказание.",
    ...overrides
  };
}

function storedReport(): MatrixReportDraft {
  return {
    id: reportId,
    calculationId,
    ownerUserId,
    source: "manual",
    status: "ready",
    locale: "ru",
    content: content({ overview: "Текущее описание" }),
    plainText: "Текущее описание",
    resultChecksum: checksum,
    revision: 2,
    modelId: null,
    promptVersion: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createStore(input: { readonly upsertResult?: null } = {}): MatrixReportStore {
  return {
    findByCalculation: vi.fn(async () => storedReport()),
    upsert: vi.fn(async (upsertInput) =>
      input.upsertResult === null
        ? null
        : {
            ...storedReport(),
            id: upsertInput.id,
            source: upsertInput.source,
            status: upsertInput.status,
            locale: upsertInput.locale,
            content: upsertInput.content,
            plainText: upsertInput.plainText,
            resultChecksum: upsertInput.resultChecksum,
            modelId: upsertInput.modelId,
            promptVersion: upsertInput.promptVersion,
            revision: 3,
            updatedAt: upsertInput.now
          }
    )
  };
}
