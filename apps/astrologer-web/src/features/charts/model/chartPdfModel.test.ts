import type { CalculationPdfJob } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { buildChartPdfAction, executeChartPdfAction } from "./chartPdfModel";

const calculationId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const checksum = `sha256:${"a".repeat(64)}`;

describe("buildChartPdfAction", () => {
  it("blocks missing, stale and checksum-loading chart results", () => {
    expect(buildChartPdfAction(baseInput({ calculationId: null }))).toEqual({
      kind: "disabled",
      label: "PDF",
      disabled: true,
      title: "Сначала рассчитайте карту",
      errorMessage: null
    });
    expect(buildChartPdfAction(baseInput({ isResultStale: true }))).toMatchObject({
      kind: "disabled",
      title: "Сначала пересчитайте карту"
    });
    expect(buildChartPdfAction(baseInput({ currentResultChecksum: null }))).toMatchObject({
      kind: "disabled",
      title: "Загружаем состояние PDF"
    });
  });

  it("maps current PDF job states to toolbar actions", () => {
    expect(buildChartPdfAction(baseInput())).toMatchObject({
      kind: "request",
      label: "PDF",
      disabled: false
    });
    expect(buildChartPdfAction(baseInput({ job: pdfJob("processing") }))).toMatchObject({
      kind: "pending",
      label: "PDF готовится…",
      disabled: true
    });
    expect(buildChartPdfAction(baseInput({ job: pdfJob("ready") }))).toMatchObject({
      kind: "download",
      label: "Скачать PDF",
      disabled: false
    });
    expect(buildChartPdfAction(baseInput({ job: pdfJob("failed") }))).toMatchObject({
      kind: "retry",
      label: "Повторить"
    });
  });

  it("ignores stale jobs from replaced chart results", () => {
    expect(
      buildChartPdfAction({
        ...baseInput(),
        job: { ...pdfJob("ready"), resultChecksum: `sha256:${"b".repeat(64)}` }
      })
    ).toMatchObject({ kind: "request", label: "PDF" });
  });
});

describe("executeChartPdfAction", () => {
  it("enqueues with the current checksum and downloads ready private URLs", async () => {
    const enqueue = vi.fn(async () => undefined);
    const download = vi.fn(async () => ({
      url: "https://objects.example.test/chart.pdf?signature=signed",
      expiresAt: "2026-07-22T12:05:00.000Z"
    }));
    const openUrl = vi.fn();

    await expect(
      executeChartPdfAction({
        calculationId,
        locale: "ru",
        currentResultChecksum: checksum,
        kind: "request",
        job: null,
        enqueue,
        download,
        openUrl
      })
    ).resolves.toBe("enqueued");
    await expect(
      executeChartPdfAction({
        calculationId,
        locale: "ru",
        currentResultChecksum: checksum,
        kind: "download",
        job: pdfJob("ready"),
        enqueue,
        download,
        openUrl
      })
    ).resolves.toBe("downloaded");

    expect(enqueue).toHaveBeenCalledWith({
      calculationId,
      body: { expectedResultChecksum: checksum, locale: "ru" }
    });
    expect(download).toHaveBeenCalledWith({ calculationId, jobId });
    expect(openUrl).toHaveBeenCalledWith("https://objects.example.test/chart.pdf?signature=signed");
  });

  it("returns an actionable stale-result error for 409 responses", async () => {
    await expect(
      executeChartPdfAction({
        calculationId,
        locale: "ru",
        currentResultChecksum: checksum,
        kind: "request",
        job: null,
        enqueue: async () => {
          throw new HttpError(409, {});
        },
        download: async () => raise(),
        openUrl: () => undefined
      })
    ).rejects.toThrow("Карта изменилась. Пересчитайте её и сформируйте PDF заново");
  });
});

function baseInput(
  patch: Partial<Parameters<typeof buildChartPdfAction>[0]> = {}
): Parameters<typeof buildChartPdfAction>[0] {
  return {
    calculationId,
    currentResultChecksum: checksum,
    job: null,
    isBusy: false,
    isResultStale: false,
    ...patch
  };
}

function pdfJob(status: CalculationPdfJob["status"]): CalculationPdfJob {
  return {
    id: jobId,
    calculationId,
    resultChecksum: checksum,
    locale: "ru",
    status,
    artifactId: null,
    mediaAssetId: null,
    failureReason: null,
    createdAt: "2026-07-22T12:00:00.000Z",
    updatedAt: "2026-07-22T12:00:00.000Z"
  };
}

function raise(): never {
  throw new Error("unexpected");
}
