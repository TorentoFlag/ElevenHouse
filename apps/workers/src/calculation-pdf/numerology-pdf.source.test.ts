import { pythagoreanRuEngine } from "@elevenhouse/domain";
import type {
  CalculationInterpretation,
  CalculationPdfJob,
  CalculationRecord
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { CalculationPdfPermanentError } from "./calculation-pdf.registry";
import { createNumerologyPdfSource } from "./numerology-pdf.source";

describe("Numerology PDF source", () => {
  it("loads the strict current result and locator-selected approved interpretation", async () => {
    const current = calculation();
    const source = createNumerologyPdfSource({
      findByOwnerAndId: vi.fn(async () => current)
    } as never);

    await expect(source.load(pdfJob())).resolves.toMatchObject({
      kind: "numerology",
      locale: "ru",
      calculationTitle: "Голубев Антон",
      approvedInterpretation: "Текущая подтверждённая интерпретация",
      result: { mode: "individual", methodCode: "pythagorean" }
    });
  });

  it("allows a null locator only while no approved interpretation exists", async () => {
    const current = calculation({
      interpretations: [interpretation({ status: "draft", approvedAt: null })]
    });
    const source = createNumerologyPdfSource({
      findByOwnerAndId: vi.fn(async () => current)
    } as never);

    await expect(
      source.load(
        pdfJob({ sourceLocator: { kind: "approved_interpretation", interpretationId: null } })
      )
    ).resolves.toMatchObject({ approvedInterpretation: null });
  });

  it("rejects stale locators, invalid result JSON and non-Pythagorean records", async () => {
    const stale = createNumerologyPdfSource({
      findByOwnerAndId: vi.fn(async () => calculation())
    } as never);
    await expect(
      stale.load(
        pdfJob({
          sourceLocator: {
            kind: "approved_interpretation",
            interpretationId: "00000000-0000-4000-8000-000000000099"
          }
        })
      )
    ).rejects.toMatchObject({ code: "stale_source" });

    const invalid = createNumerologyPdfSource({
      findByOwnerAndId: vi.fn(async () => calculation({ resultData: { mode: "individual" } }))
    } as never);
    await expect(invalid.load(pdfJob())).rejects.toMatchObject({ code: "invalid_source" });

    const wrongMethod = createNumerologyPdfSource({
      findByOwnerAndId: vi.fn(async () => calculation({ methodCode: "vedic" }))
    } as never);
    await expect(wrongMethod.load(pdfJob())).rejects.toBeInstanceOf(CalculationPdfPermanentError);
  });

  it("loads a complete compatibility result", async () => {
    const result = compatibilityResult();
    const current = calculation({ mode: "compatibility", resultData: result });
    const source = createNumerologyPdfSource({
      findByOwnerAndId: vi.fn(async () => current)
    } as never);

    await expect(source.load(pdfJob())).resolves.toMatchObject({
      result: { mode: "compatibility", pairNumber: 7 }
    });
  });
});

export function individualResult() {
  return pythagoreanRuEngine.calculateIndividual({
    participant: {
      calculationName: "Голубев Антон",
      calculationNameSource: "crm_display_name",
      birthDate: "2000-08-19"
    },
    periods: {
      personalYear: { year: 2026 },
      personalMonths: { year: 2026 },
      personalDay: { date: "2026-07-15" }
    }
  });
}

export function compatibilityResult() {
  return pythagoreanRuEngine.calculateCompatibility({
    participants: {
      first: individualResult().participant,
      second: {
        calculationName: "Кошкина Яна Владимировна",
        calculationNameSource: "crm_display_name",
        birthDate: "2002-03-16"
      }
    },
    periods: {
      personalYear: { year: 2026 },
      personalMonths: { year: 2026 },
      personalDay: { date: "2026-07-15" }
    }
  });
}

function pdfJob(overrides: Partial<CalculationPdfJob> = {}): CalculationPdfJob {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    calculationId: "00000000-0000-4000-8000-000000000002",
    ownerUserId: "00000000-0000-4000-8000-000000000003",
    module: "numerology",
    methodCode: "pythagorean",
    resultChecksum: `sha256:${"a".repeat(64)}`,
    locale: "ru",
    sourceLocator: {
      kind: "approved_interpretation",
      interpretationId: "00000000-0000-4000-8000-000000000004"
    },
    documentFingerprint: `sha256:${"b".repeat(64)}`,
    status: "processing",
    artifactId: "00000000-0000-4000-8000-000000000005",
    mediaAssetId: "00000000-0000-4000-8000-000000000006",
    failureCode: null,
    failureReason: null,
    pageCount: null,
    createdAt: "2026-07-15T12:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z",
    ...overrides
  };
}

function calculation(overrides: Partial<CalculationRecord> = {}): CalculationRecord {
  return {
    id: pdfJob().calculationId,
    ownerUserId: pdfJob().ownerUserId,
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    title: "Голубев Антон",
    status: "linked",
    participants: [],
    requestFingerprint: `sha256:${"c".repeat(64)}`,
    inputData: {},
    resultData: individualResult(),
    resultSummary: {},
    resultChecksum: pdfJob().resultChecksum,
    links: [],
    interpretations: [
      interpretation({
        id: "00000000-0000-4000-8000-000000000007",
        approvedAt: null,
        status: "draft"
      }),
      interpretation({
        id: "00000000-0000-4000-8000-000000000008",
        approvedAt: "2026-07-15T10:00:00.000Z"
      }),
      interpretation()
    ],
    artifacts: [],
    createdAt: pdfJob().createdAt,
    updatedAt: pdfJob().updatedAt,
    ...overrides
  };
}

function interpretation(
  overrides: Partial<CalculationInterpretation> = {}
): CalculationInterpretation {
  return {
    id: "00000000-0000-4000-8000-000000000004",
    source: "manual",
    status: "approved",
    text: "Текущая подтверждённая интерпретация",
    modelId: null,
    promptVersion: null,
    approvedAt: "2026-07-15T11:00:00.000Z",
    updatedAt: "2026-07-15T11:00:00.000Z",
    ...overrides
  };
}
