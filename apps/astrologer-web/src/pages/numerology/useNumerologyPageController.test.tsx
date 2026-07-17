import type {
  CalculationPdfJob,
  CalculationRecordResponse,
  NumerologyCalculationResponse,
  NumerologyPreviewResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../common/http/HttpError";
import { createInitialNumerologyForm } from "../../features/numerology/model/numerologyFormModel";
import {
  executeNumerologyEditorSubmission,
  executeNumerologyPdfAction,
  requestNumerologyAiDraft
} from "./useNumerologyPageController";

const checksum = `sha256:${"a".repeat(64)}`;
const calculation = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "calculated",
  resultChecksum: checksum,
  interpretations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      status: "draft",
      text: "Сохранённый текст"
    }
  ]
} as CalculationRecordResponse;
const response = { calculation } as NumerologyCalculationResponse;

describe("Numerology editor submission", () => {
  it("previews a new manual calculation without persisting it", async () => {
    const previewResponse = { result: { mode: "individual" } } as NumerologyPreviewResponse;
    const preview = vi.fn(async () => previewResponse);
    const recalculate = vi.fn();

    await expect(
      executeNumerologyEditorSubmission({
        editor: {
          kind: "create",
          calculationId: null,
          form: manualEditorForm()
        },
        preview,
        recalculate
      })
    ).resolves.toEqual({
      kind: "preview",
      response: previewResponse,
      form: manualEditorForm()
    });
    expect(preview).toHaveBeenCalledWith({
      mode: "individual",
      methodCode: "pythagorean",
      periodRequest: { kind: "current_year" },
      participants: [
        {
          role: "subject",
          source: "manual",
          clientId: null,
          displayName: "Антон Голубев",
          calculationName: "Антон Голубев",
          calculationNameSource: "manual_entry",
          birthDate: "1990-01-02"
        }
      ]
    });
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("keeps recalculation on the persisted mutation", async () => {
    const preview = vi.fn();
    const recalculate = vi.fn(async () => response);
    const form = { ...manualEditorForm(), title: "Обновлённый расчёт" };

    await expect(
      executeNumerologyEditorSubmission({
        editor: {
          kind: "recalculate",
          calculationId: calculation.id,
          form
        },
        preview,
        recalculate
      })
    ).resolves.toEqual({ kind: "recalculated", response });
    expect(preview).not.toHaveBeenCalled();
    expect(recalculate).toHaveBeenCalledWith({
      calculationId: calculation.id,
      body: expect.objectContaining({ title: "Обновлённый расчёт" })
    });
  });
});

describe("Numerology AI draft controller", () => {
  it("sends the selected calculation id and current result checksum", async () => {
    const mutate = vi.fn(async () => response);

    await expect(
      requestNumerologyAiDraft({
        calculation,
        editorText: "Сохранённый текст",
        isBusy: false,
        mutate
      })
    ).resolves.toEqual({ kind: "success", response });
    expect(mutate).toHaveBeenCalledWith({
      calculationId: calculation.id,
      body: { expectedResultChecksum: checksum }
    });
  });

  it("does not invoke generation for dirty or busy state", async () => {
    const mutate = vi.fn(async () => response);

    await expect(
      requestNumerologyAiDraft({
        calculation,
        editorText: "Несохранённый текст",
        isBusy: false,
        mutate
      })
    ).resolves.toEqual({ kind: "skipped" });
    await expect(
      requestNumerologyAiDraft({
        calculation,
        editorText: "Сохранённый текст",
        isBusy: true,
        mutate
      })
    ).resolves.toEqual({ kind: "skipped" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("returns a safe explicit error without replacing the current response", async () => {
    const mutate = vi.fn(async () => {
      throw new HttpError(503, null);
    });

    await expect(
      requestNumerologyAiDraft({
        calculation,
        editorText: "Сохранённый текст",
        isBusy: false,
        mutate
      })
    ).resolves.toEqual({
      kind: "error",
      message: "AI временно недоступен. Повторите позже"
    });
  });
});

describe("Numerology PDF controller action", () => {
  it("enqueues the current result in the active interface locale", async () => {
    const enqueue = vi.fn(async () => undefined);

    await expect(
      executeNumerologyPdfAction({
        calculation,
        locale: "en",
        kind: "request",
        job: null,
        enqueue,
        download: vi.fn(),
        openUrl: vi.fn()
      })
    ).resolves.toBe("enqueued");
    expect(enqueue).toHaveBeenCalledWith({
      calculationId: calculation.id,
      body: { expectedResultChecksum: checksum, locale: "en" }
    });
  });

  it("opens only the backend-provided private URL for a ready job", async () => {
    const job = pdfJob("ready");
    const openUrl = vi.fn();
    const download = vi.fn(async () => ({
      url: "https://objects.example.test/private/report.pdf?signature=signed",
      expiresAt: "2026-07-15T00:10:00.000Z"
    }));

    await expect(
      executeNumerologyPdfAction({
        calculation,
        locale: "ru",
        kind: "download",
        job,
        enqueue: vi.fn(),
        download,
        openUrl
      })
    ).resolves.toBe("downloaded");
    expect(download).toHaveBeenCalledWith({ calculationId: calculation.id, jobId: job.id });
    expect(openUrl).toHaveBeenCalledWith(
      "https://objects.example.test/private/report.pdf?signature=signed"
    );
  });

  it("does nothing for disabled and pending actions", async () => {
    const enqueue = vi.fn();
    const download = vi.fn();

    await expect(
      executeNumerologyPdfAction({
        calculation,
        locale: "ru",
        kind: "pending",
        job: pdfJob("processing"),
        enqueue,
        download,
        openUrl: vi.fn()
      })
    ).resolves.toBe("skipped");
    expect(enqueue).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("does not leak a raw HTTP error when the PDF endpoint is unavailable", async () => {
    await expect(
      executeNumerologyPdfAction({
        calculation,
        locale: "ru",
        kind: "request",
        job: null,
        enqueue: vi.fn(async () => {
          throw new HttpError(404, null);
        }),
        download: vi.fn(),
        openUrl: vi.fn()
      })
    ).rejects.toThrow("PDF-экспорт временно недоступен. Повторите позже");
  });
});

function pdfJob(status: CalculationPdfJob["status"]): CalculationPdfJob {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    calculationId: calculation.id,
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

function manualEditorForm() {
  const initial = createInitialNumerologyForm();
  return {
    ...initial,
    subject: {
      ...initial.subject,
      displayName: "Антон Голубев",
      fullName: "Антон Голубев",
      birthDate: "1990-01-02"
    }
  };
}
