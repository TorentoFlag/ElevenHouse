import type { CalculationPdfJob } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { buildNumerologyPdfAction } from "./numerologyPdfModel";

const checksum = `sha256:${"a".repeat(64)}`;

describe("buildNumerologyPdfAction", () => {
  it("blocks previews and inline editors with an explicit save-first tooltip", () => {
    expect(buildNumerologyPdfAction(baseInput({ calculationId: "" }))).toEqual({
      kind: "disabled",
      label: "PDF",
      disabled: true,
      title: "Сначала сохраните расчёт",
      errorMessage: null
    });
    expect(buildNumerologyPdfAction(baseInput({ editorOpen: true }))).toMatchObject({
      kind: "disabled",
      disabled: true,
      title: "Сначала сохраните расчёт"
    });
  });

  it("offers generation for a saved calculation without a job", () => {
    expect(buildNumerologyPdfAction(baseInput())).toEqual({
      kind: "request",
      label: "PDF",
      disabled: false,
      title: "Сформировать PDF",
      errorMessage: null
    });
  });

  it.each(["queued", "processing"] as const)(
    "polling status %s is visibly pending and cannot be enqueued twice",
    (status) => {
      expect(buildNumerologyPdfAction(baseInput({ job: pdfJob(status) }))).toEqual({
        kind: "pending",
        label: "PDF готовится…",
        disabled: true,
        title: "PDF формируется",
        errorMessage: null
      });
    }
  );

  it("offers the private download for a current ready job", () => {
    expect(buildNumerologyPdfAction(baseInput({ job: pdfJob("ready") }))).toEqual({
      kind: "download",
      label: "Скачать PDF",
      disabled: false,
      title: "Скачать готовый PDF",
      errorMessage: null
    });
  });

  it("makes a failed job retryable and exposes an actionable reason", () => {
    expect(
      buildNumerologyPdfAction({
        ...baseInput(),
        job: { ...pdfJob("failed"), failureReason: "Хранилище временно недоступно" }
      })
    ).toEqual({
      kind: "retry",
      label: "Повторить",
      disabled: false,
      title: "Повторить формирование PDF",
      errorMessage: "Не удалось сформировать PDF: Хранилище временно недоступно"
    });
  });

  it("ignores a stale cached job from a replaced result", () => {
    expect(
      buildNumerologyPdfAction({
        ...baseInput(),
        job: { ...pdfJob("ready"), resultChecksum: `sha256:${"b".repeat(64)}` }
      })
    ).toMatchObject({ kind: "request", label: "PDF", disabled: false });
  });
});

function baseInput(
  patch: Partial<Parameters<typeof buildNumerologyPdfAction>[0]> = {}
): Parameters<typeof buildNumerologyPdfAction>[0] {
  return {
    calculationId: "00000000-0000-4000-8000-000000000001",
    resultChecksum: checksum,
    currentResultChecksum: checksum,
    job: null,
    editorOpen: false,
    isBusy: false,
    ...patch
  };
}

function pdfJob(status: CalculationPdfJob["status"]): CalculationPdfJob {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    calculationId: "00000000-0000-4000-8000-000000000001",
    resultChecksum: checksum,
    locale: "ru",
    status,
    artifactId: null,
    mediaAssetId: null,
    failureReason: null,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
}
