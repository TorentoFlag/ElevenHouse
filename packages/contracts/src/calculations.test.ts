import { describe, expect, it } from "vitest";
import {
  calculationIdParamSchema,
  calculationRecordResponseSchema,
  listCalculationsQuerySchema,
  listCalculationsResponseSchema,
  publishCalculationRequestSchema,
  saveCalculationInterpretationRequestSchema
} from "./calculations";

const calculationRecordResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  module: "numerology",
  mode: "individual",
  methodCode: "pythagorean",
  title: "Голубев Антон, психоматрица",
  status: "calculated",
  requestFingerprint: `sha256:${"a".repeat(64)}`,
  inputData: {
    participant: {
      calculationName: "Голубев Антон",
      calculationNameSource: "crm_display_name",
      birthDate: "2000-08-19"
    }
  },
  resultData: {
    methodCode: "pythagorean",
    mode: "individual",
    keyNumbers: { lifePath: 2 }
  },
  resultSummary: { lifePath: 2 },
  resultChecksum: `sha256:${"b".repeat(64)}`,
  participants: [
    {
      role: "subject",
      source: "crm_client",
      clientId: "44444444-4444-4444-8444-444444444444",
      displayName: "Голубев Антон"
    }
  ],
  links: [
    {
      clientId: "44444444-4444-4444-8444-444444444444",
      visibility: "private_to_astrologer",
      linkedAt: "2026-07-06T00:00:00.000Z",
      publishedAt: null
    }
  ],
  interpretations: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      source: "ai",
      status: "draft",
      text: "Structured interpretation",
      modelId: "gpt-5",
      promptVersion: "numerology-v1",
      approvedAt: null
    }
  ],
  artifacts: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      mediaAssetId: "77777777-7777-4777-8777-777777777777",
      artifactType: "pdf",
      status: "ready"
    }
  ],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z"
} as const;

describe("calculation contracts", () => {
  it("parses one current result without algorithm or result versions", () => {
    const parsed = calculationRecordResponseSchema.parse(calculationRecordResponse);

    expect(parsed.resultData).toMatchObject({
      methodCode: "pythagorean",
      keyNumbers: { lifePath: 2 }
    });
    expect(parsed).not.toHaveProperty("versions");
    expect(parsed).not.toHaveProperty("currentMethodVersion");
    expect(parsed.participants[0]).not.toHaveProperty("birthDate");
    expect(parsed.participants[0]).not.toHaveProperty("inputSnapshot");
    expect(parsed.participants[0]).not.toHaveProperty("manuallyOverridden");
    expect(parsed.interpretations[0]).not.toHaveProperty("versionId");
    expect(parsed.artifacts[0]).not.toHaveProperty("versionId");
  });

  it("requires canonical sha256 digests and plain JSON object payloads", () => {
    expect(() =>
      calculationRecordResponseSchema.parse({
        ...calculationRecordResponse,
        requestFingerprint: "checksum-1"
      })
    ).toThrow();
    expect(() =>
      calculationRecordResponseSchema.parse({
        ...calculationRecordResponse,
        resultData: "not-an-object"
      })
    ).toThrow();
    expect(() =>
      calculationRecordResponseSchema.parse({
        ...calculationRecordResponse,
        resultData: { generatedAt: new Date("2026-07-06T00:00:00.000Z") }
      })
    ).toThrow();
  });

  it("enforces participant source and client identity without duplicating method input", () => {
    expect(() =>
      calculationRecordResponseSchema.parse({
        ...calculationRecordResponse,
        participants: [
          {
            ...calculationRecordResponse.participants[0],
            source: "manual",
            clientId: calculationRecordResponse.participants[0].clientId
          }
        ]
      })
    ).toThrow();
    expect(() =>
      calculationRecordResponseSchema.parse({
        ...calculationRecordResponse,
        participants: [
          {
            ...calculationRecordResponse.participants[0],
            clientId: null
          }
        ]
      })
    ).toThrow();
  });

  it("accepts interpretation save and checksum-bound publication without version ids", () => {
    expect(saveCalculationInterpretationRequestSchema.parse({ text: "Ручная трактовка" })).toEqual({
      text: "Ручная трактовка"
    });
    expect(
      publishCalculationRequestSchema.parse({
        clientId: calculationRecordResponse.participants[0].clientId,
        expectedResultChecksum: calculationRecordResponse.resultChecksum
      })
    ).toEqual({
      clientId: calculationRecordResponse.participants[0].clientId,
      expectedResultChecksum: calculationRecordResponse.resultChecksum
    });
  });

  it("parses list query defaults, lists and strict calculation params", () => {
    expect(listCalculationsQuerySchema.parse({})).toEqual({
      module: "all",
      status: "all",
      limit: 50,
      offset: 0
    });
    expect(
      listCalculationsResponseSchema.parse({
        calculations: [calculationRecordResponse],
        total: 1
      })
    ).toMatchObject({ total: 1 });
    expect(
      calculationIdParamSchema.parse({ calculationId: calculationRecordResponse.id })
    ).toEqual({ calculationId: calculationRecordResponse.id });
    expect(() =>
      calculationIdParamSchema.parse({
        calculationId: calculationRecordResponse.id,
        unexpected: true
      })
    ).toThrow();
  });
});
