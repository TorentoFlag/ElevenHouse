import { describe, expect, it } from "vitest";
import {
  calculationIdParamSchema,
  calculationRecordResponseSchema,
  listCalculationsQuerySchema,
  listCalculationsResponseSchema
} from "./calculations";

const calculationRecordResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  module: "numerology",
  mode: "individual",
  methodCode: "pythagorean",
  currentMethodVersion: "pythagorean-v1",
  title: "Maria",
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
      settingsSnapshot: {
        masterNumbers: { mode: "preserve_all" }
      },
      inputSnapshot: {
        participant: {
          fullName: "Maria Ivanova",
          birthDate: "1990-03-14"
        }
      },
      resultSnapshot: {
        methodCode: "pythagorean",
        keyNumbers: { lifePath: 9 }
      },
      resultSummary: {
        headline: "Life path 9"
      },
      resultChecksum: "checksum-1",
      createdAt: "2026-07-06T00:00:00.000Z"
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
      versionId: "33333333-3333-4333-8333-333333333333",
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
      versionId: "33333333-3333-4333-8333-333333333333",
      mediaAssetId: "77777777-7777-4777-8777-777777777777",
      artifactType: "pdf",
      status: "ready"
    }
  ],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z"
} as const;

describe("calculation contracts", () => {
  it("parses list query defaults and coerces limit/offset", () => {
    expect(listCalculationsQuerySchema.parse({})).toEqual({
      module: "all",
      status: "all",
      limit: 50,
      offset: 0
    });

    expect(
      listCalculationsQuerySchema.parse({
        module: "numerology",
        status: "published",
        limit: "25",
        offset: "10"
      })
    ).toEqual({
      module: "numerology",
      status: "published",
      limit: 25,
      offset: 10
    });

    expect(() => listCalculationsQuerySchema.parse({ limit: "101" })).toThrow();
    expect(() => listCalculationsQuerySchema.parse({ offset: "-1" })).toThrow();
  });

  it("keeps calculation response snapshots structured behind strict envelopes", () => {
    const parsed = calculationRecordResponseSchema.parse(calculationRecordResponse);

    expect(parsed.versions[0]?.resultSnapshot).toMatchObject({
      methodCode: "pythagorean",
      keyNumbers: { lifePath: 9 }
    });

    expect(() =>
      calculationRecordResponseSchema.parse({
        ...calculationRecordResponse,
        unexpected: true
      })
    ).toThrow();

    expect(() =>
      calculationRecordResponseSchema.parse({
        ...calculationRecordResponse,
        versions: [
          {
            ...calculationRecordResponse.versions[0],
            resultSnapshot: "not-an-object"
          }
        ]
      })
    ).toThrow();
  });

  it("rejects invalid or future participant birth dates in responses", () => {
    expect(() =>
      calculationRecordResponseSchema.parse({
        ...calculationRecordResponse,
        participants: [
          {
            ...calculationRecordResponse.participants[0],
            birthDate: "1990-02-31"
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
            birthDate: "2999-01-01"
          }
        ]
      })
    ).toThrow();
  });

  it("parses a calculation list response", () => {
    expect(
      listCalculationsResponseSchema.parse({
        calculations: [calculationRecordResponse],
        total: 1
      })
    ).toMatchObject({
      total: 1,
      calculations: [{ id: calculationRecordResponse.id }]
    });
  });

  it("parses calculationId params as strict UUID objects", () => {
    expect(
      calculationIdParamSchema.parse({
        calculationId: calculationRecordResponse.id
      })
    ).toEqual({
      calculationId: calculationRecordResponse.id
    });

    expect(() => calculationIdParamSchema.parse({ calculationId: "not-a-uuid" })).toThrow();
    expect(() =>
      calculationIdParamSchema.parse({
        calculationId: calculationRecordResponse.id,
        unexpected: true
      })
    ).toThrow();
  });
});
