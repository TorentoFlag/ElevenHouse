import { HttpException } from "@nestjs/common";
import { matrixReportDraftPromptV1 } from "@elevenhouse/ai";
import {
  LADINI_22_GOLDEN_FIXTURES,
  sha256CanonicalJson,
  type CalculationRecord,
  type CanonicalJson,
  type MatrixNoteStore,
  type MatrixReportDraft,
  type MatrixReportStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { SystemClock } from "../clock/system-clock.service";
import { MatrixReportService } from "./matrix-report.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const reportId = "00000000-0000-4000-8000-000000000003";
const checksum = sha256CanonicalJson(
  LADINI_22_GOLDEN_FIXTURES[0]!.expected as unknown as CanonicalJson
);
const nextChecksum = `sha256:${"b".repeat(64)}`;
const now = new Date("2026-07-14T12:00:00.000Z");

describe("MatrixReportService", () => {
  it("returns the current report with staleness derived from the saved calculation", async () => {
    const harness = createHarness({ report: report({ resultChecksum: nextChecksum }) });
    await expect(harness.service.get(calculationId, request())).resolves.toMatchObject({
      currentResultChecksum: checksum,
      report: { id: reportId, stale: true }
    });
  });

  it("saves normalized manual content against the current checksum", async () => {
    const harness = createHarness();
    await harness.service.save(
      calculationId,
      { locale: "ru", status: "ready", content: content(), expectedResultChecksum: checksum },
      request()
    );
    expect(harness.reportStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        calculationId,
        source: "manual",
        status: "ready",
        expectedResultChecksum: checksum,
        resultChecksum: checksum
      })
    );
  });

  it("sends only minimized selected current data to AI and saves its output as a draft", async () => {
    const harness = createHarness();
    await harness.service.generateAiDraft(
      calculationId,
      {
        locale: "ru",
        noteIds: ["00000000-0000-4000-8000-000000000011"],
        projectionYear: null,
        expectedResultChecksum: checksum
      },
      request()
    );
    const generateInput = harness.aiGeneration.generate.mock.calls[0]![0] as unknown as {
      readonly prompt: unknown;
      readonly feature: string;
      readonly input: unknown;
    };
    expect(generateInput.prompt).toBe(matrixReportDraftPromptV1);
    expect(generateInput.feature).toBe("matrix.reportDraft");
    const serialized = JSON.stringify(generateInput.input);
    expect(serialized).toContain("Проверить границы");
    expect(serialized).not.toContain("1990-03-14");
    expect(serialized).not.toContain("Краснова");
    expect(harness.reportStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ai",
        status: "draft",
        modelId: "gpt-5.5",
        promptVersion: "matrix.reportDraft@1"
      })
    );
  });

  it("does not overwrite the current report when AI generation fails", async () => {
    const harness = createHarness();
    harness.aiGeneration.generate.mockRejectedValueOnce(new HttpException("provider", 503));
    await expect(
      harness.service.generateAiDraft(
        calculationId,
        { locale: "ru", noteIds: [], projectionYear: null, expectedResultChecksum: checksum },
        request()
      )
    ).rejects.toBeInstanceOf(HttpException);
    expect(harness.reportStore.upsert).not.toHaveBeenCalled();
  });
});

function createHarness(input: { readonly report?: MatrixReportDraft } = {}) {
  const currentReport = input.report ?? report();
  const calculation = calculationRecord();
  const calculationStore = {
    findByOwnerAndId: vi.fn(async () => calculation)
  };
  const reportStore: MatrixReportStore = {
    findByCalculation: vi.fn(async () => currentReport),
    upsert: vi.fn(async (upsert) => ({
      ...currentReport,
      source: upsert.source,
      status: upsert.status,
      locale: upsert.locale,
      content: upsert.content,
      plainText: upsert.plainText,
      resultChecksum: upsert.resultChecksum,
      modelId: upsert.modelId,
      promptVersion: upsert.promptVersion,
      revision: currentReport.revision + 1
    }))
  };
  const noteStore: MatrixNoteStore = {
    listByCalculation: vi.fn(async () => [
      {
        id: "00000000-0000-4000-8000-000000000011",
        calculationId,
        ownerUserId,
        text: "Проверить границы",
        resultChecksum: checksum,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    ]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  };
  const aiGeneration = {
    generate: vi.fn(async (input: unknown) => {
      void input;
      return {
        output: content(),
        provider: "openai" as const,
        model: "gpt-5.5" as const,
        finishReason: "completed" as const
      };
    })
  };
  const clock: SystemClock = { now: () => now };
  const service = new MatrixReportService(
    calculationStore as never,
    reportStore,
    noteStore,
    aiGeneration as never,
    { projection: vi.fn() } as never,
    clock,
    () => reportId
  );
  return { service, reportStore, aiGeneration };
}

function report(overrides: Partial<MatrixReportDraft> = {}): MatrixReportDraft {
  return {
    id: reportId,
    calculationId,
    ownerUserId,
    source: "manual",
    status: "ready",
    locale: "ru",
    content: content(),
    plainText: "Отчёт",
    resultChecksum: checksum,
    revision: 2,
    modelId: null,
    promptVersion: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function calculationRecord(): CalculationRecord {
  const result = LADINI_22_GOLDEN_FIXTURES[0]!.expected;
  return {
    id: calculationId,
    ownerUserId,
    module: "matrix",
    mode: "individual",
    methodCode: "ladini_22",
    title: "Марина — Матрица судьбы",
    status: "linked",
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId: "00000000-0000-4000-8000-000000000021",
        displayName: "Марина Краснова"
      }
    ],
    requestFingerprint: `sha256:${"c".repeat(64)}`,
    inputData: {},
    resultData: result,
    resultSummary: {},
    resultChecksum: checksum,
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function content() {
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
    practicalSteps: ["Выбрать один шаг."],
    disclaimer: "Матрица — инструмент рефлексии."
  };
}

function request() {
  return {
    headers: {},
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as never;
}
