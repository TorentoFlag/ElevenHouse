import { describe, expect, it } from "vitest";
import type { ClientConsentAuthorizationEvidence } from "@elevenhouse/domain";
import { ClientConsentIntegrityError } from "@elevenhouse/domain";
import { selectRelationshipConsentEvidence } from "./drizzle-client-consent-store";

const relationship = {
  id: "11111111-1111-4111-8111-111111111111",
  clientUserId: "22222222-2222-4222-8222-222222222222",
  astrologerUserId: "33333333-3333-4333-8333-333333333333",
  publicHandle: "alice-vega",
  publicName: "Alice Vega",
  status: "active" as const
};

describe("selectRelationshipConsentEvidence", () => {
  it("prefers the single current consent over a later-dated revoked history row", () => {
    const current = evidence({
      id: "44444444-4444-4444-8444-444444444444",
      grantedAt: "2026-08-03T12:00:00.000Z",
      revokedAt: null
    });
    const futureDatedHistory = evidence({
      id: "55555555-5555-4555-8555-555555555555",
      grantedAt: "2026-08-04T12:00:00.000Z",
      revokedAt: "2026-08-05T12:00:00.000Z"
    });

    expect(
      selectRelationshipConsentEvidence([futureDatedHistory, current])
    ).toEqual([current]);
  });

  it("fails closed when persistence returns more than one current consent", () => {
    expect(() =>
      selectRelationshipConsentEvidence([
        evidence({
          id: "44444444-4444-4444-8444-444444444444",
          grantedAt: "2026-08-03T12:00:00.000Z",
          revokedAt: null
        }),
        evidence({
          id: "55555555-5555-4555-8555-555555555555",
          grantedAt: "2026-08-04T12:00:00.000Z",
          revokedAt: null
        })
      ])
    ).toThrow(ClientConsentIntegrityError);
  });
});

function evidence(
  input: Pick<NonNullable<ClientConsentAuthorizationEvidence["consent"]>, "id" | "grantedAt" | "revokedAt">
): ClientConsentAuthorizationEvidence {
  return {
    relationship,
    consent: {
      ...input,
      relationshipId: relationship.id,
      clientUserId: relationship.clientUserId,
      astrologerUserId: relationship.astrologerUserId,
      purpose: "chart_ai_interpretation",
      policyVersion: "chart-ai-consent.v1",
      processorCode: "openai",
      noticeLocale: "ru",
      noticeSha256: `sha256:${"a".repeat(64)}`
    }
  };
}
