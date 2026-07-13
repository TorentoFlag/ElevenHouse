import { describe, expect, it } from "vitest";
import {
  createNumerologyAiDraftRequestSchema,
  numerologyCalculationResponseSchema,
  numerologyPreviewResponseSchema,
  persistNumerologyCalculationRequestSchema,
  previewNumerologyRequestSchema,
  recalculateNumerologyCalculationRequestSchema
} from "./numerology";

const clientId = "44444444-4444-4444-8444-444444444444";
const partnerClientId = "55555555-5555-4555-8555-555555555555";
const digest = (character: string) => `sha256:${character.repeat(64)}`;

const individualPreviewRequest = {
  mode: "individual",
  methodCode: "pythagorean",
  participants: [{ role: "subject", source: "crm_client", clientId }],
  periodRequest: { kind: "current_year" }
} as const;

const individualResult = {
  methodCode: "pythagorean",
  mode: "individual",
  participant: {
    calculationName: "Голубев Антон",
    calculationNameSource: "crm_display_name",
    birthDate: "2000-08-19"
  },
  keyNumbers: { lifePath: 2, birthday: 1, expression: 6, soul: 6, personality: 9 },
  periods: { personalYear: { year: 2026, value: 1 } },
  psychomatrix: {
    sourceDigits: [1, 9, 0, 8, 2, 0, 0, 0],
    workingNumbers: { first: 20, second: 2, third: 18, fourth: 9 },
    cells: {
      "1": "11",
      "2": "222",
      "3": "",
      "4": "",
      "5": "",
      "6": "",
      "7": "",
      "8": "88",
      "9": "99"
    }
  },
  strengthLines: [
    {
      code: "goal",
      label: "Целеустремлённость",
      cells: ["1", "4", "7"],
      value: 2,
      level: "moderate",
      levelLabel: "Умеренная выраженность"
    },
    {
      code: "family",
      label: "Семейность",
      cells: ["2", "5", "8"],
      value: 5,
      level: "strong",
      levelLabel: "Сильная линия"
    },
    {
      code: "stability",
      label: "Стабильность",
      cells: ["3", "6", "9"],
      value: 2,
      level: "moderate",
      levelLabel: "Умеренная выраженность"
    },
    {
      code: "self_esteem",
      label: "Самооценка",
      cells: ["1", "2", "3"],
      value: 5,
      level: "strong",
      levelLabel: "Сильная линия"
    },
    {
      code: "material",
      label: "Быт и материальность",
      cells: ["4", "5", "6"],
      value: 0,
      level: "absent",
      levelLabel: "Линия не выражена"
    },
    {
      code: "talent",
      label: "Талант",
      cells: ["7", "8", "9"],
      value: 4,
      level: "strong",
      levelLabel: "Сильная линия"
    },
    {
      code: "spirituality",
      label: "Духовность",
      cells: ["1", "5", "9"],
      value: 4,
      level: "strong",
      levelLabel: "Сильная линия"
    },
    {
      code: "temperament",
      label: "Темперамент",
      cells: ["3", "5", "7"],
      value: 0,
      level: "absent",
      levelLabel: "Линия не выражена"
    }
  ]
} as const;

const calculationResponse = {
  calculation: {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    title: "Голубев Антон, психоматрица",
    status: "calculated",
    requestFingerprint: digest("a"),
    inputData: {
      mode: "individual",
      methodCode: "pythagorean",
      participants: [individualResult.participant],
      periods: { personalYear: { year: 2026 } }
    },
    resultData: individualResult,
    resultSummary: { lifePath: 2 },
    resultChecksum: digest("b"),
    participants: [
      { role: "subject", source: "crm_client", clientId, displayName: "Голубев Антон" }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z"
  },
  result: individualResult
} as const;

describe("numerology contracts", () => {
  it("accepts CRM hydration input and current-year intent without client-supplied snapshots", () => {
    expect(previewNumerologyRequestSchema.parse(individualPreviewRequest)).toEqual(
      individualPreviewRequest
    );
    expect(
      previewNumerologyRequestSchema.parse({
        ...individualPreviewRequest,
        periodRequest: {
          kind: "explicit",
          personalMonths: { year: 2027 }
        }
      })
    ).toMatchObject({ periodRequest: { kind: "explicit" } });

    for (const field of [
      "displayName",
      "calculationName",
      "birthDate",
      "settings",
      "result"
    ] as const) {
      expect(() =>
        previewNumerologyRequestSchema.parse({ ...individualPreviewRequest, [field]: {} })
      ).toThrow();
    }
  });

  it("accepts strict manual input but rejects missing names and future birth dates", () => {
    const manual = {
      mode: "individual",
      methodCode: "pythagorean",
      participants: [
        {
          role: "subject",
          source: "manual",
          clientId: null,
          displayName: "Антон",
          calculationName: "Голубев Антон",
          calculationNameSource: "manual_entry",
          birthDate: "2000-08-19"
        }
      ],
      periodRequest: { kind: "explicit", personalYear: { year: 2027 } }
    } as const;
    expect(previewNumerologyRequestSchema.parse(manual)).toEqual(manual);
    expect(() =>
      previewNumerologyRequestSchema.parse({
        ...manual,
        participants: [{ ...manual.participants[0], calculationName: undefined }]
      })
    ).toThrow();
    expect(() =>
      previewNumerologyRequestSchema.parse({
        ...manual,
        participants: [{ ...manual.participants[0], birthDate: "2999-01-01" }]
      })
    ).toThrow();
  });

  it("enforces mode roles, unique CRM clients, supported method and explicit period validity", () => {
    expect(() =>
      previewNumerologyRequestSchema.parse({ ...individualPreviewRequest, methodCode: "vedic" })
    ).toThrow();
    expect(() =>
      previewNumerologyRequestSchema.parse({
        ...individualPreviewRequest,
        mode: "compatibility",
        participants: [
          individualPreviewRequest.participants[0],
          { role: "partner", source: "crm_client", clientId }
        ]
      })
    ).toThrow();
    expect(
      previewNumerologyRequestSchema.parse({
        ...individualPreviewRequest,
        mode: "compatibility",
        participants: [
          individualPreviewRequest.participants[0],
          { role: "partner", source: "crm_client", clientId: partnerClientId }
        ]
      })
    ).toMatchObject({ mode: "compatibility" });
    expect(() =>
      previewNumerologyRequestSchema.parse({
        ...individualPreviewRequest,
        periodRequest: { kind: "explicit" }
      })
    ).toThrow();
    expect(() =>
      previewNumerologyRequestSchema.parse({
        ...individualPreviewRequest,
        periodRequest: { kind: "explicit", personalDay: { date: "2027-02-31" } }
      })
    ).toThrow();
    expect(
      previewNumerologyRequestSchema.parse({
        ...individualPreviewRequest,
        periodRequest: { kind: "explicit", personalDay: { date: "2029-12-31" } }
      })
    ).toBeDefined();
  });

  it("separates preview, persist, recalculate and current-result AI commands", () => {
    expect(
      persistNumerologyCalculationRequestSchema.parse({
        ...individualPreviewRequest,
        title: "Голубев Антон, психоматрица"
      })
    ).toMatchObject({ title: "Голубев Антон, психоматрица" });
    expect(recalculateNumerologyCalculationRequestSchema.parse(individualPreviewRequest)).toEqual(
      individualPreviewRequest
    );
    expect(createNumerologyAiDraftRequestSchema.parse({})).toEqual({});
    expect(() => createNumerologyAiDraftRequestSchema.parse({ versionId: clientId })).toThrow();
  });

  it("parses typed preview and checksum-bound current calculation responses", () => {
    expect(numerologyPreviewResponseSchema.parse({ result: individualResult })).toMatchObject({
      result: { keyNumbers: { lifePath: 2 } }
    });
    expect(numerologyCalculationResponseSchema.parse(calculationResponse)).toMatchObject({
      calculation: { resultChecksum: digest("b") },
      result: { keyNumbers: { expression: 6 } }
    });
    expect(() =>
      numerologyCalculationResponseSchema.parse({
        ...calculationResponse,
        result: { ...individualResult, keyNumbers: { ...individualResult.keyNumbers, lifePath: 9 } }
      })
    ).toThrow();
    expect(() =>
      numerologyCalculationResponseSchema.parse({
        ...calculationResponse,
        calculation: { ...calculationResponse.calculation, mode: "compatibility" }
      })
    ).toThrow();
  });
});
