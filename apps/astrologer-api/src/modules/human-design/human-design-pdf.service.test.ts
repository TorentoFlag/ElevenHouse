import type { CalculationRecord, CalculationStore } from "@elevenhouse/domain";
import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CalculationPdfResultChangedError } from "../calculations/pdf/calculation-pdf.errors";
import type { CalculationPdfService } from "../calculations/pdf/calculation-pdf.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { HumanDesignPdfService } from "./human-design-pdf.service";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const calculationId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";

describe("HumanDesignPdfService", () => {
  it("reads the latest owner-scoped Human Design PDF job", async () => {
    const { service, calculationPdf } = createService();

    await expect(service.latest(calculationId, { locale: "ru" }, request())).resolves.toEqual({
      job: null,
      currentResultChecksum: `sha256:${"a".repeat(64)}`
    });

    expect(calculationPdf.latest).toHaveBeenCalledWith({
      ownerUserId,
      calculationId,
      locale: "ru"
    });
  });

  it("enqueues a checksum-bound Human Design PDF with current approved interpretation locator", async () => {
    const { service, calculationPdf } = createService({
      calculation: calculation({
        interpretations: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            source: "ai",
            status: "approved",
            text: "Approved interpretation",
            modelId: "gpt-5.5",
            promptVersion: "humanDesign@1",
            approvedAt: "2026-07-23T12:00:00.000Z",
            updatedAt: "2026-07-23T12:00:00.000Z"
          }
        ]
      })
    });

    await service.enqueue(
      calculationId,
      { expectedResultChecksum: `sha256:${"a".repeat(64)}`, locale: "en" },
      request()
    );

    expect(calculationPdf.request).toHaveBeenCalledWith({
      ownerUserId,
      calculationId,
      expectedResultChecksum: `sha256:${"a".repeat(64)}`,
      locale: "en",
      sourceLocator: {
        kind: "approved_interpretation",
        interpretationId: "44444444-4444-4444-8444-444444444444"
      },
      renderContract: "human-design-classic-v1",
      originalFileName: "Human Design.pdf"
    });
  });

  it("downloads only owned Human Design PDF jobs", async () => {
    const { service, calculationPdf } = createService();

    await expect(service.download(calculationId, jobId, request())).resolves.toEqual({
      url: "https://storage.example.test/report.pdf",
      expiresAt: "2026-07-23T13:00:00.000Z"
    });

    expect(calculationPdf.download).toHaveBeenCalledWith({ ownerUserId, calculationId, jobId });
  });

  it("maps stale PDF requests to Human Design integrity errors", async () => {
    const { service } = createService({
      calculationPdf: {
        request: vi.fn(async () => {
          throw new CalculationPdfResultChangedError();
        })
      }
    });

    await expectHttp(
      service.enqueue(
        calculationId,
        { expectedResultChecksum: `sha256:${"b".repeat(64)}`, locale: "ru" },
        request()
      ),
      409,
      "HUMAN_DESIGN_RESULT_INTEGRITY_FAILED"
    );
  });

  it("rejects archived or non-Human Design calculations", async () => {
    const archived = createService({ calculation: calculation({ status: "archived" }) });
    const wrongModule = createService({ calculation: calculation({ module: "numerology" }) });

    await expectHttp(
      archived.service.latest(calculationId, { locale: "ru" }, request()),
      409,
      "HUMAN_DESIGN_CALCULATION_MISMATCH"
    );
    await expectHttp(
      wrongModule.service.latest(calculationId, { locale: "ru" }, request()),
      409,
      "HUMAN_DESIGN_CALCULATION_MISMATCH"
    );
  });
});

function createService(
  input: {
    readonly calculation?: CalculationRecord;
    readonly calculationPdf?: Partial<CalculationPdfService>;
  } = {}
) {
  const calculationStore: CalculationStore = {
    findByOwnerAndId: vi.fn(async () => input.calculation ?? calculation())
  } as unknown as CalculationStore;
  const calculationPdf = {
    latest: vi.fn(async () => ({
      job: null,
      currentResultChecksum: `sha256:${"a".repeat(64)}`
    })),
    request: vi.fn(async () => ({
      job: {
        id: jobId,
        calculationId,
        resultChecksum: `sha256:${"a".repeat(64)}`,
        locale: "ru",
        status: "queued",
        artifactId: null,
        mediaAssetId: null,
        failureReason: null,
        createdAt: "2026-07-23T12:00:00.000Z",
        updatedAt: "2026-07-23T12:00:00.000Z"
      },
      currentResultChecksum: `sha256:${"a".repeat(64)}`
    })),
    download: vi.fn(async () => ({
      url: "https://storage.example.test/report.pdf",
      expiresAt: "2026-07-23T13:00:00.000Z"
    })),
    ...input.calculationPdf
  } as unknown as CalculationPdfService;

  return {
    service: new HumanDesignPdfService(calculationStore, calculationPdf),
    calculationPdf
  };
}

function calculation(overrides: Partial<CalculationRecord> = {}): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "human_design",
    mode: "individual",
    interpretationMode: null,
    methodCode: "human_design_classic",
    title: "Марина Краснова — Дизайн человека",
    status: "linked",
    requestFingerprint: `sha256:${"c".repeat(64)}`,
    inputData: { mode: "individual" },
    resultData: { mode: "individual" },
    resultSummary: { type: "generator" },
    resultChecksum: `sha256:${"a".repeat(64)}`,
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId: "55555555-5555-4555-8555-555555555555",
        displayName: "Марина Краснова"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-23T12:00:00.000Z",
    updatedAt: "2026-07-23T12:00:00.000Z",
    ...overrides
  };
}

function request(): AstrologerSessionRequest {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as AstrologerSessionRequest;
}

async function expectHttp(promise: Promise<unknown>, status: number, code: string): Promise<void> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  expect((error as HttpException).getResponse()).toMatchObject({ code });
}
