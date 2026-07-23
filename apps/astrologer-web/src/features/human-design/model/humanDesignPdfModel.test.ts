import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { buildHumanDesignPdfAction, executeHumanDesignPdfAction } from "./humanDesignPdfModel";

const calculationId = "11111111-1111-4111-8111-111111111111";
const resultChecksum = `sha256:${"a".repeat(64)}`;

describe("Human Design PDF model", () => {
  it("enables request, pending, download and retry states for current saved results", () => {
    expect(
      buildHumanDesignPdfAction({
        calculationId: null,
        resultChecksum: null,
        currentResultChecksum: null,
        job: null,
        isBusy: false,
        isTransitMode: false
      })
    ).toMatchObject({ kind: "disabled", disabled: true });
    expect(
      buildHumanDesignPdfAction({
        calculationId,
        resultChecksum,
        currentResultChecksum: resultChecksum,
        job: null,
        isBusy: false,
        isTransitMode: false
      })
    ).toMatchObject({ kind: "request", label: "PDF", disabled: false });
    expect(
      buildHumanDesignPdfAction({
        calculationId,
        resultChecksum,
        currentResultChecksum: resultChecksum,
        job: job("processing"),
        isBusy: false,
        isTransitMode: false
      })
    ).toMatchObject({ kind: "pending", disabled: true });
    expect(
      buildHumanDesignPdfAction({
        calculationId,
        resultChecksum,
        currentResultChecksum: resultChecksum,
        job: job("ready"),
        isBusy: false,
        isTransitMode: false
      })
    ).toMatchObject({ kind: "download", label: "Скачать PDF", disabled: false });
    expect(
      buildHumanDesignPdfAction({
        calculationId,
        resultChecksum,
        currentResultChecksum: resultChecksum,
        job: job("failed"),
        isBusy: false,
        isTransitMode: false
      })
    ).toMatchObject({ kind: "retry", errorMessage: expect.stringContaining("PDF") });
  });

  it("does not offer PDF for transit overlays", () => {
    expect(
      buildHumanDesignPdfAction({
        calculationId,
        resultChecksum,
        currentResultChecksum: resultChecksum,
        job: null,
        isBusy: false,
        isTransitMode: true
      })
    ).toMatchObject({ kind: "disabled", disabled: true });
  });

  it("enqueues and downloads through injected operations", async () => {
    const enqueue = vi.fn(async () => undefined);
    const download = vi.fn(async () => ({
      url: "https://storage.example.test/report.pdf",
      expiresAt: "2026-07-23T13:00:00.000Z"
    }));
    const openUrl = vi.fn();

    await expect(
      executeHumanDesignPdfAction({
        calculationId,
        resultChecksum,
        locale: "ru",
        kind: "request",
        job: null,
        enqueue,
        download,
        openUrl
      })
    ).resolves.toBe("enqueued");
    expect(enqueue).toHaveBeenCalledWith({
      calculationId,
      body: { expectedResultChecksum: resultChecksum, locale: "ru" }
    });

    await expect(
      executeHumanDesignPdfAction({
        calculationId,
        resultChecksum,
        locale: "ru",
        kind: "download",
        job: job("ready"),
        enqueue,
        download,
        openUrl
      })
    ).resolves.toBe("downloaded");
    expect(openUrl).toHaveBeenCalledWith("https://storage.example.test/report.pdf");
  });

  it("maps backend failures to stable copy", async () => {
    await expect(
      executeHumanDesignPdfAction({
        calculationId,
        resultChecksum,
        locale: "ru",
        kind: "request",
        job: null,
        enqueue: vi.fn(async () => {
          throw new HttpError(409, null);
        }),
        download: vi.fn(),
        openUrl: vi.fn()
      })
    ).rejects.toThrow("Расчёт Human Design изменился");
  });
});

function job(status: "queued" | "processing" | "ready" | "failed") {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    calculationId,
    resultChecksum,
    locale: "ru" as const,
    status,
    artifactId: null,
    mediaAssetId: null,
    failureReason: status === "failed" ? "renderer failed" : null,
    createdAt: "2026-07-23T12:00:00.000Z",
    updatedAt: "2026-07-23T12:00:00.000Z"
  };
}
