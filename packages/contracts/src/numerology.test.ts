import { describe, expect, it } from "vitest";
import {
  createNumerologyCalculationRequestSchema,
  numerologyCalculationResponseSchema
} from "./numerology";

const subjectManualParticipant = {
  role: "subject",
  source: "manual",
  clientId: null,
  displayName: "Maria",
  fullName: "Maria Ivanova",
  birthDate: "1990-03-14"
} as const;

const partnerManualParticipant = {
  role: "partner",
  source: "manual",
  clientId: null,
  displayName: "Alex",
  fullName: "Alex Petrov",
  birthDate: "1988-11-02"
} as const;

const pythagoreanSettings = {
  masterNumbers: { mode: "preserve_selected", values: [11, 22] },
  nameNormalization: { yoPolicy: "separate", shortIPolicy: "as_i" },
  includeNameNumbers: true,
  includePsychomatrix: true,
  includeStrengthLines: true,
  forecastDate: "2026-07-06"
} as const;

const individualRequest = {
  mode: "individual",
  methodCode: "pythagorean",
  title: "Maria numerology",
  participants: [subjectManualParticipant],
  settings: pythagoreanSettings
} as const;

const calculationResponse = {
  calculation: {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    currentMethodVersion: "pythagorean-v1",
    title: "Maria numerology",
    status: "calculated",
    participants: [
      {
        role: "subject",
        source: "manual",
        clientId: null,
        displayName: "Maria",
        birthDate: "1990-03-14",
        inputSnapshot: {
          fullName: "Maria Ivanova",
          birthDate: "1990-03-14"
        },
        manuallyOverridden: false
      }
    ],
    versions: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        versionNumber: 1,
        methodVersion: "pythagorean-v1",
        settingsSnapshot: pythagoreanSettings,
        inputSnapshot: individualRequest,
        resultSnapshot: {
          methodCode: "pythagorean",
          methodVersion: "pythagorean-v1",
          participant: {
            fullName: "Maria Ivanova",
            birthDate: "1990-03-14"
          },
          keyNumbers: { lifePath: 9, birthday: 5 },
          strengthLines: []
        },
        resultSummary: {
          lifePath: 9
        },
        resultChecksum: "checksum-1",
        createdAt: "2026-07-06T00:00:00.000Z"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z"
  },
  currentVersion: {
    id: "33333333-3333-4333-8333-333333333333",
    versionNumber: 1,
    methodVersion: "pythagorean-v1",
    settingsSnapshot: pythagoreanSettings,
    inputSnapshot: individualRequest,
    resultSnapshot: {
      methodCode: "pythagorean",
      methodVersion: "pythagorean-v1",
      participant: {
        fullName: "Maria Ivanova",
        birthDate: "1990-03-14"
      },
      keyNumbers: { lifePath: 9, birthday: 5 },
      strengthLines: []
    },
    resultSummary: {
      lifePath: 9
    },
    resultChecksum: "checksum-1",
    createdAt: "2026-07-06T00:00:00.000Z"
  },
  resultSnapshot: {
    methodCode: "pythagorean",
    methodVersion: "pythagorean-v1",
    participant: {
      fullName: "Maria Ivanova",
      birthDate: "1990-03-14"
    },
    keyNumbers: { lifePath: 9, birthday: 5 },
    strengthLines: []
  },
  settingsSnapshot: pythagoreanSettings,
  inputSnapshot: individualRequest
} as const;

describe("numerology contracts", () => {
  it("parses a valid Pythagorean individual request", () => {
    expect(createNumerologyCalculationRequestSchema.parse(individualRequest)).toMatchObject({
      mode: "individual",
      methodCode: "pythagorean",
      participants: [{ role: "subject" }]
    });
  });

  it("rejects future birth dates", () => {
    expect(() =>
      createNumerologyCalculationRequestSchema.parse({
        ...individualRequest,
        participants: [
          {
            ...subjectManualParticipant,
            birthDate: "2999-01-01"
          }
        ]
      })
    ).toThrow();

    expect(() =>
      createNumerologyCalculationRequestSchema.parse({
        ...individualRequest,
        participants: [
          {
            ...subjectManualParticipant,
            birthDate: "1990-02-31"
          }
        ]
      })
    ).toThrow();
  });

  it("parses a valid compatibility request with exactly subject and partner", () => {
    const parsed = createNumerologyCalculationRequestSchema.parse({
      ...individualRequest,
      mode: "compatibility",
      participants: [subjectManualParticipant, partnerManualParticipant]
    });

    expect(parsed.participants.map((participant) => participant.role)).toEqual([
      "subject",
      "partner"
    ]);
  });

  it("rejects invalid individual participant count or role", () => {
    expect(() =>
      createNumerologyCalculationRequestSchema.parse({
        ...individualRequest,
        participants: [subjectManualParticipant, partnerManualParticipant]
      })
    ).toThrow();

    expect(() =>
      createNumerologyCalculationRequestSchema.parse({
        ...individualRequest,
        participants: [partnerManualParticipant]
      })
    ).toThrow();
  });

  it("rejects invalid compatibility roles", () => {
    expect(() =>
      createNumerologyCalculationRequestSchema.parse({
        ...individualRequest,
        mode: "compatibility",
        participants: [
          subjectManualParticipant,
          { ...partnerManualParticipant, role: "subject" }
        ]
      })
    ).toThrow();
  });

  it("requires manual participant fullName and birthDate", () => {
    expect(() =>
      createNumerologyCalculationRequestSchema.parse({
        ...individualRequest,
        participants: [
          {
            ...subjectManualParticipant,
            fullName: undefined
          }
        ]
      })
    ).toThrow();

    expect(() =>
      createNumerologyCalculationRequestSchema.parse({
        ...individualRequest,
        participants: [
          {
            ...subjectManualParticipant,
            birthDate: undefined
          }
        ]
      })
    ).toThrow();
  });

  it("requires CRM participant clientId, displayName, fullName, and birthDate", () => {
    const crmParticipant = {
      ...subjectManualParticipant,
      source: "crm_client",
      clientId: "44444444-4444-4444-8444-444444444444"
    } as const;

    expect(createNumerologyCalculationRequestSchema.parse({
      ...individualRequest,
      participants: [crmParticipant]
    }).participants[0]).toMatchObject({
      source: "crm_client",
      clientId: "44444444-4444-4444-8444-444444444444"
    });

    for (const field of ["clientId", "displayName", "fullName", "birthDate"] as const) {
      expect(() =>
        createNumerologyCalculationRequestSchema.parse({
          ...individualRequest,
          participants: [
            {
              ...crmParticipant,
              [field]: field === "clientId" ? null : undefined
            }
          ]
        })
      ).toThrow();
    }
  });

  it("rejects future method codes for create requests", () => {
    expect(() =>
      createNumerologyCalculationRequestSchema.parse({
        ...individualRequest,
        methodCode: "vedic"
      })
    ).toThrow();
  });

  it("keeps numerology response snapshots structured and strict enough for API boundary", () => {
    const parsed = numerologyCalculationResponseSchema.parse(calculationResponse);

    expect(parsed.currentVersion.id).toBe(calculationResponse.currentVersion.id);
    expect(parsed.resultSnapshot).toMatchObject({
      methodCode: "pythagorean",
      keyNumbers: { lifePath: 9 }
    });

    expect(() =>
      numerologyCalculationResponseSchema.parse({
        ...calculationResponse,
        resultSnapshot: "not-an-object"
      })
    ).toThrow();

    expect(() =>
      numerologyCalculationResponseSchema.parse({
        ...calculationResponse,
        unexpected: true
      })
    ).toThrow();
  });

  it("rejects non-numerology calculation modules in numerology responses", () => {
    expect(() =>
      numerologyCalculationResponseSchema.parse({
        ...calculationResponse,
        calculation: {
          ...calculationResponse.calculation,
          module: "chart"
        }
      })
    ).toThrow();
  });

  it("rejects arbitrary method codes in numerology responses", () => {
    expect(() =>
      numerologyCalculationResponseSchema.parse({
        ...calculationResponse,
        calculation: {
          ...calculationResponse.calculation,
          methodCode: "unsupported-method"
        }
      })
    ).toThrow();
  });
});
