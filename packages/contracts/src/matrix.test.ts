import { describe, expect, it } from "vitest";
import {
  matrixCalculationResponseSchema,
  matrixPreviewResponseSchema,
  matrixProjectionResponseSchema,
  persistMatrixCalculationRequestSchema,
  previewMatrixRequestSchema,
  recalculateMatrixCalculationRequestSchema
} from "./matrix";

const clientA = "00000000-0000-4000-8000-000000000001";
const clientB = "00000000-0000-4000-8000-000000000002";
const calculationId = "00000000-0000-4000-8000-000000000003";
const ownerUserId = "00000000-0000-4000-8000-000000000004";
const digest = (character: string) => `sha256:${character.repeat(64)}`;

const matrix = {
  points: {
    A: 14,
    B: 3,
    C: 19,
    D: 9,
    E: 9,
    tl: 17,
    tr: 22,
    br: 10,
    bl: 5,
    A1: 5,
    B1: 12,
    C1: 10,
    D1: 18,
    tl1: 8,
    tr1: 4,
    br1: 19,
    bl1: 14
  },
  purposes: { earth: 6, sky: 12, male: 9, female: 9, personal: 18, social: 18, spiritual: 9 },
  zones: { purpose: 18, money: 19, love: 14, energy: 12 },
  energyMap: {
    rows: [
      { code: "sahasrara", physical: 3, energy: 12, emotions: 15 },
      { code: "ajna", physical: 22, energy: 4, emotions: 8 },
      { code: "vishuddha", physical: 19, energy: 10, emotions: 11 },
      { code: "anahata", physical: 10, energy: 19, emotions: 11 },
      { code: "manipura", physical: 9, energy: 18, emotions: 9 },
      { code: "svadhisthana", physical: 5, energy: 14, emotions: 19 },
      { code: "muladhara", physical: 14, energy: 5, emotions: 19 }
    ],
    totals: { physical: 10, energy: 10, emotions: 20 }
  }
} as const;

const result = {
  methodCode: "ladini_22",
  engineRevision: 1,
  interpretationRevision: 1,
  mode: "individual",
  participant: { displayName: "Марина Краснова", birthDate: "1990-03-14" },
  matrix
} as const;

describe("Matrix contracts", () => {
  it("accepts one CRM participant for individual preview", () => {
    expect(
      previewMatrixRequestSchema.parse({
        methodCode: "ladini_22",
        mode: "individual",
        participants: [{ role: "subject", source: "crm_client", clientId: clientA }],
        projection: { kind: "explicit_year", year: 2026 }
      })
    ).toMatchObject({ mode: "individual" });
  });

  it("rejects manual participants, caller birth dates and duplicate partners", () => {
    expect(() =>
      previewMatrixRequestSchema.parse({
        methodCode: "ladini_22",
        mode: "individual",
        participants: [
          { role: "subject", source: "manual", displayName: "Анна", birthDate: "1990-03-14" }
        ]
      })
    ).toThrow();
    expect(() =>
      previewMatrixRequestSchema.parse({
        methodCode: "ladini_22",
        mode: "individual",
        participants: [
          { role: "subject", source: "crm_client", clientId: clientA, birthDate: "1990-03-14" }
        ]
      })
    ).toThrow();
    expect(() =>
      persistMatrixCalculationRequestSchema.parse({
        methodCode: "ladini_22",
        mode: "compatibility",
        participants: [
          { role: "subject", source: "crm_client", clientId: clientA },
          { role: "partner", source: "crm_client", clientId: clientA }
        ]
      })
    ).toThrow();
  });

  it("keeps persistence projection-free and recalculation body empty", () => {
    expect(() =>
      persistMatrixCalculationRequestSchema.parse({
        methodCode: "ladini_22",
        mode: "individual",
        participants: [{ role: "subject", source: "crm_client", clientId: clientA }],
        projection: { kind: "current_year" }
      })
    ).toThrow();
    expect(recalculateMatrixCalculationRequestSchema.parse({})).toEqual({});
    expect(() => recalculateMatrixCalculationRequestSchema.parse({ force: true })).toThrow();
  });

  it("parses a full individual preview and derived projection", () => {
    const projection = {
      methodCode: "ladini_22",
      engineRevision: 1,
      timezone: "Europe/Moscow",
      currentDate: "2026-03-13",
      participant: result.participant,
      ageCycle: { age: 35, cycleAge: 35, decadeIndex: 3, pointCode: "tr", arcana: 22 },
      yearForecast: { year: 2026, personalYear: 9, challenge: 18, resource: 5 }
    } as const;
    expect(matrixPreviewResponseSchema.parse({ result, projection })).toEqual({
      result,
      projection
    });
    expect(
      matrixProjectionResponseSchema.parse({
        calculationId,
        resultChecksum: digest("b"),
        projection
      })
    ).toMatchObject({ calculationId });
  });

  it("requires calculation resultData to equal the typed result", () => {
    const response = {
      calculation: {
        id: calculationId,
        ownerUserId,
        module: "matrix",
        mode: "individual",
        interpretationMode: null,
        methodCode: "ladini_22",
        title: "Марина Краснова — Матрица судьбы",
        status: "linked",
        requestFingerprint: digest("a"),
        inputData: {
          methodCode: "ladini_22",
          engineRevision: 1,
          mode: "individual",
          participants: [
            {
              role: "subject",
              clientId: clientA,
              displayName: "Марина Краснова",
              birthDate: "1990-03-14"
            }
          ]
        },
        resultData: result,
        resultSummary: { center: 9, personalPurpose: 18, money: 19, love: 14 },
        resultChecksum: digest("b"),
        participants: [
          {
            role: "subject",
            source: "crm_client",
            clientId: clientA,
            displayName: "Марина Краснова"
          }
        ],
        links: [
          {
            clientId: clientA,
            visibility: "private_to_astrologer",
            linkedAt: "2026-07-14T00:00:00.000Z",
            publishedAt: null
          }
        ],
        interpretations: [],
        artifacts: [],
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z"
      },
      result
    } as const;
    expect(matrixCalculationResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      matrixCalculationResponseSchema.parse({
        ...response,
        result: { ...result, matrix: { ...matrix, zones: { ...matrix.zones, money: 20 } } }
      })
    ).toThrow("Matrix result must equal calculation resultData");
    expect(clientB).not.toBe(clientA);
  });
});
