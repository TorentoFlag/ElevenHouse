import { describe, expect, it, vi } from "vitest";
import type {
  CalculationPdfJob,
  CalculationPdfJobStore,
  CalculationPdfSourceLocator,
  CalculationRecord,
  CalculationStore,
  MediaAssetStore,
  PrivateObjectStoragePort
} from "@elevenhouse/domain";
import { calculationPdfDocumentFingerprint } from "@elevenhouse/domain";
import type { SystemClock } from "../../clock/system-clock.service";
import {
  CalculationPdfNotFoundError,
  CalculationPdfNotReadyError,
  CalculationPdfResultChangedError
} from "./calculation-pdf.errors";
import { CalculationPdfService } from "./calculation-pdf.service";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const calculationId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const checksum = `sha256:${"a".repeat(64)}`;
const nextChecksum = `sha256:${"b".repeat(64)}`;
const now = new Date("2026-07-15T12:00:00.000Z");

describe("CalculationPdfService", () => {
  it("returns only the latest job for the requested locale and current result", async () => {
    const harness = createHarness();

    await expect(
      harness.service.latest({ ownerUserId, calculationId, locale: "ru" })
    ).resolves.toMatchObject({
      currentResultChecksum: checksum,
      job: { id: jobId, failureReason: null }
    });
    expect(harness.pdfStore.findLatestByCalculation).toHaveBeenCalledWith({
      ownerUserId,
      calculationId,
      locale: "ru"
    });
    await expect(
      harness.service.latestJob({ ownerUserId, calculationId, locale: "ru" })
    ).resolves.toMatchObject({
      calculation: { id: calculationId },
      job: {
        sourceLocator: { kind: "approved_interpretation", interpretationId: null }
      }
    });
  });

  it("ignores latest jobs with a stale document fingerprint for the requested source", async () => {
    const oldSourceLocator = { kind: "calculation_result" } as const;
    const currentSourceLocator = {
      kind: "approved_interpretation",
      interpretationId: "00000000-0000-4000-8000-000000000010"
    } as const;
    const renderContract = "chart-natal-v1";
    const harness = createHarness({
      job: {
        ...pdfJob(),
        sourceLocator: oldSourceLocator,
        documentFingerprint: fingerprint(oldSourceLocator, renderContract)
      }
    });

    await expect(
      harness.service.latest({
        ownerUserId,
        calculationId,
        locale: "ru",
        sourceLocator: currentSourceLocator,
        renderContract
      })
    ).resolves.toMatchObject({
      currentResultChecksum: checksum,
      job: null
    });
    await expect(
      harness.service.latestJob({
        ownerUserId,
        calculationId,
        locale: "ru",
        sourceLocator: currentSourceLocator,
        renderContract
      })
    ).resolves.toMatchObject({
      calculation: { id: calculationId },
      job: null
    });
  });

  it("rejects an archived calculation and a stale expected checksum", async () => {
    const archived = createHarness({ calculation: { ...calculation(), status: "archived" } });
    await expect(
      archived.service.request({
        ownerUserId,
        calculationId,
        expectedResultChecksum: checksum,
        locale: "ru",
        sourceLocator: { kind: "approved_interpretation", interpretationId: null },
        renderContract: "numerology-pythagorean",
        originalFileName: "Нумерология.pdf"
      })
    ).rejects.toBeInstanceOf(CalculationPdfNotFoundError);

    const stale = createHarness();
    await expect(
      stale.service.request({
        ownerUserId,
        calculationId,
        expectedResultChecksum: nextChecksum,
        locale: "ru",
        sourceLocator: { kind: "approved_interpretation", interpretationId: null },
        renderContract: "numerology-pythagorean",
        originalFileName: "Нумерология.pdf"
      })
    ).rejects.toBeInstanceOf(CalculationPdfResultChangedError);
    expect(stale.pdfStore.enqueue).not.toHaveBeenCalled();
  });

  it("atomically requests one private generic report identity", async () => {
    const harness = createHarness({ job: { ...pdfJob(), status: "queued" } });
    const response = await harness.service.request({
      ownerUserId,
      calculationId,
      expectedResultChecksum: checksum,
      locale: "en",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null },
      renderContract: "numerology-pythagorean",
      originalFileName: "Numerology.pdf"
    });

    expect(response.job).toMatchObject({ id: jobId, status: "queued" });
    expect(harness.pdfStore.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: jobId,
        ownerUserId,
        calculationId,
        module: "numerology",
        methodCode: "pythagorean",
        locale: "en",
        sourceLocator: { kind: "approved_interpretation", interpretationId: null },
        documentFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        privateStorageBucket: "elevenhouse-local-private",
        storageKey: `${ownerUserId}/calculation_report_pdf/${jobId}/report.pdf`,
        originalFileName: "Numerology.pdf"
      })
    );
  });

  it("requires a ready current-checksum private calculation report before signing", async () => {
    const stale = createHarness({ job: { ...pdfJob(), resultChecksum: nextChecksum } });
    await expect(
      stale.service.download({ ownerUserId, calculationId, jobId })
    ).rejects.toBeInstanceOf(CalculationPdfResultChangedError);
    expect(stale.privateStorage.createPresignedDownload).not.toHaveBeenCalled();

    const processing = createHarness({ job: { ...pdfJob(), status: "processing" } });
    await expect(
      processing.service.download({ ownerUserId, calculationId, jobId })
    ).rejects.toBeInstanceOf(CalculationPdfNotReadyError);

    const wrongPurpose = createHarness({ mediaPurpose: "product_cover" });
    await expect(
      wrongPurpose.service.download({ ownerUserId, calculationId, jobId })
    ).rejects.toBeInstanceOf(CalculationPdfNotFoundError);
  });

  it("rejects ready downloads whose document fingerprint no longer matches the requested source", async () => {
    const currentSourceLocator = {
      kind: "approved_interpretation",
      interpretationId: "00000000-0000-4000-8000-000000000010"
    } as const;
    const currentRenderContract = "chart-transit-overlay-wheel-v1";
    const stale = createHarness({
      job: {
        ...pdfJob(),
        documentFingerprint: fingerprint(
          { kind: "approved_interpretation", interpretationId: null },
          "chart-transit-v1"
        )
      }
    });

    await expect(
      stale.service.download({
        ownerUserId,
        calculationId,
        jobId,
        sourceLocator: currentSourceLocator,
        renderContract: currentRenderContract
      })
    ).rejects.toBeInstanceOf(CalculationPdfResultChangedError);
    expect(stale.privateStorage.createPresignedDownload).not.toHaveBeenCalled();
  });

  it("returns only a short-lived authorized URL for a ready current PDF", async () => {
    const harness = createHarness();

    await expect(harness.service.download({ ownerUserId, calculationId, jobId })).resolves.toEqual({
      url: "https://storage.example/private.pdf?signature=abc",
      expiresAt: "2026-07-15T12:05:00.000Z"
    });
    expect(harness.privateStorage.createPresignedDownload).toHaveBeenCalledWith({
      storageBucket: "elevenhouse-local-private",
      storageKey: "owner/calculation_report_pdf/job/report.pdf",
      fileName: "Нумерология.pdf"
    });
  });
});

function createHarness(
  input: {
    readonly calculation?: CalculationRecord;
    readonly job?: CalculationPdfJob;
    readonly mediaPurpose?: string;
  } = {}
) {
  const currentCalculation = input.calculation ?? calculation();
  const currentJob = input.job ?? pdfJob();
  const calculationStore = {
    findByOwnerAndId: vi.fn(async ({ ownerUserId: owner }: { ownerUserId: string }) =>
      owner === ownerUserId ? currentCalculation : null
    )
  } as unknown as CalculationStore;
  const pdfStore = {
    findLatestByCalculation: vi.fn(async () => currentJob),
    findById: vi.fn(async () => currentJob),
    findByJobId: vi.fn(async () => currentJob),
    enqueue: vi.fn(async () => currentJob),
    claimForRendering: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn()
  } satisfies CalculationPdfJobStore;
  const mediaStore = {
    createUploadingAsset: vi.fn(),
    findByOwnerAndId: vi.fn(async () => ({
      id: currentJob.mediaAssetId,
      ownerUserId,
      purpose: input.mediaPurpose ?? "calculation_report_pdf",
      status: "ready" as const,
      visibility: "private" as const,
      storageBucket: "elevenhouse-local-private",
      storageKey: "owner/calculation_report_pdf/job/report.pdf",
      originalFileName: "Нумерология.pdf",
      mimeType: "application/pdf" as const,
      sizeBytes: 42_000,
      checksumSha256: "c".repeat(64),
      width: null,
      height: null,
      altText: null,
      failureReason: null,
      variants: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    markReady: vi.fn(),
    markFailed: vi.fn()
  } as unknown as MediaAssetStore;
  const privateStorage: PrivateObjectStoragePort = {
    createPresignedDownload: vi.fn(async () => ({
      url: "https://storage.example/private.pdf?signature=abc",
      expiresAt: "2026-07-15T12:05:00.000Z"
    }))
  };
  const clock: SystemClock = { now: () => now };
  const ids = [
    jobId,
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000006"
  ];
  const service = new CalculationPdfService(
    calculationStore,
    pdfStore,
    mediaStore,
    privateStorage,
    { getOrThrow: vi.fn(() => ({ privateBucket: "elevenhouse-local-private" })) } as never,
    clock,
    () => ids.shift() ?? jobId
  );
  return { service, pdfStore, privateStorage };
}

function calculation(): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "numerology",
    mode: "individual",
    interpretationMode: null,
    methodCode: "pythagorean",
    title: "Голубев Антон",
    status: "linked",
    participants: [],
    requestFingerprint: `sha256:${"d".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: checksum,
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function pdfJob(): CalculationPdfJob {
  return {
    id: jobId,
    calculationId,
    ownerUserId,
    module: "numerology",
    methodCode: "pythagorean",
    resultChecksum: checksum,
    locale: "ru",
    sourceLocator: { kind: "approved_interpretation", interpretationId: null },
    documentFingerprint: `sha256:${"e".repeat(64)}`,
    status: "ready",
    artifactId: "00000000-0000-4000-8000-000000000005",
    mediaAssetId: "00000000-0000-4000-8000-000000000004",
    failureCode: null,
    failureReason: "internal detail",
    pageCount: 3,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function fingerprint(
  sourceLocator: CalculationPdfSourceLocator,
  renderContract: string
): `sha256:${string}` {
  return calculationPdfDocumentFingerprint({
    resultChecksum: checksum,
    locale: "ru",
    sourceLocator,
    renderContract
  });
}
