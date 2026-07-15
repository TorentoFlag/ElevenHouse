import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import {
  downloadNumerologyPdf,
  enqueueNumerologyPdf,
  getLatestNumerologyPdf
} from "./numerologyApi";

const calculationId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const checksum = `sha256:${"a".repeat(64)}`;
const now = "2026-07-15T00:00:00.000Z";

afterEach(() => vi.restoreAllMocks());

describe("numerology PDF API", () => {
  it("loads the latest job for the requested locale through the shared strict contract", async () => {
    const response = pdfResponse("queued");
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(getLatestNumerologyPdf({ calculationId, locale: "en" })).resolves.toEqual(
      response
    );
    expect(get).toHaveBeenCalledWith(
      `/numerology/calculations/${calculationId}/report/pdf?locale=en`
    );
  });

  it("enqueues a current-result PDF with CSRF protection", async () => {
    const response = pdfResponse("queued");
    const post = vi.spyOn(application.http, "post").mockResolvedValue(response);
    const body = { expectedResultChecksum: checksum, locale: "ru" as const };

    await expect(enqueueNumerologyPdf({ calculationId, body })).resolves.toEqual(response);
    expect(post).toHaveBeenCalledWith(
      `/numerology/calculations/${calculationId}/report/pdf`,
      body,
      { csrf: true }
    );
  });

  it("requests a private download URL for the selected job", async () => {
    const response = {
      url: "https://objects.example.test/private/report.pdf?signature=signed",
      expiresAt: now
    };
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(downloadNumerologyPdf({ calculationId, jobId })).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith(
      `/numerology/calculations/${calculationId}/report/pdf/${jobId}/download`
    );
  });
});

function pdfResponse(status: "queued" | "processing" | "ready" | "failed") {
  return {
    job: {
      id: jobId,
      calculationId,
      resultChecksum: checksum,
      locale: "en",
      status,
      artifactId: null,
      mediaAssetId: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now
    },
    currentResultChecksum: checksum
  };
}
