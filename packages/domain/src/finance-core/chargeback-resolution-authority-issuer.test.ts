import { describe, expect, it } from "vitest";

import { hashFinanceCommandPayload } from "../finance-authorization";
import {
  ChargebackResolutionAuthorityIssuanceError,
  issueVerifiedChargebackResolutionAuthority,
  type ChargebackResolutionDecisionAuthorizationPayload
} from "./chargeback-resolution-authority-issuer";

const digest = `sha256:${"a".repeat(64)}` as const;
const payload: ChargebackResolutionDecisionAuthorizationPayload = {
  chargebackCaseId: "chargeback-case-1",
  chargebackCaseVersion: 1,
  outcomeWebhookEventId: "arc-outcome-event-1",
  resolution: "won",
  currency: "RUB"
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    authorization: {
      status: "consumed" as const,
      actionKind: "chargeback_resolution" as const,
      aggregateId: payload.chargebackCaseId,
      expectedVersion: payload.chargebackCaseVersion,
      payloadHash: hashFinanceCommandPayload(payload),
      actorUserId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      authorizationId: "33333333-3333-4333-8333-333333333333",
      verifiedAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "2026-08-10T00:10:00.000Z"
    },
    chargebackCaseId: payload.chargebackCaseId,
    chargebackCaseVersion: payload.chargebackCaseVersion,
    outcomeWebhookEventId: payload.outcomeWebhookEventId,
    resolution: payload.resolution,
    providerAccount: {
      seriesId: "arc-pay-client-orders",
      providerAccountId: "merchant-1",
      identityVersion: 1
    },
    providerPaymentId: "payment-1",
    cumulativePrincipalMinor: "199900",
    outcomeArtifact: { artifactId: "artifact-1", sha256Digest: digest, byteLength: 512 },
    observedAt: "2026-08-10T00:00:00.000Z",
    decidedAt: "2026-08-10T00:01:00.000Z",
    ...overrides
  };
}

describe("issueVerifiedChargebackResolutionAuthority", () => {
  it("binds a terminal decision to the consumed passkey proof and sealed signed webhook", () => {
    const authority = issueVerifiedChargebackResolutionAuthority(input());

    expect(authority).toMatchObject({
      kind: "verified_chargeback_resolution_authority",
      chargebackCaseId: "chargeback-case-1",
      expectedChargebackVersion: 1,
      resolution: "won",
      cumulativePrincipalMinor: "199900",
      providerEvidence: {
        kind: "verified_chargeback_provider_evidence",
        lifecycleFact: "won",
        artifact: { artifactId: "artifact-1", sha256Digest: digest, byteLength: 512 }
      }
    });
    expect(authority.allocationAuthorityId).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("rejects an authorization for another outcome or an unsealed invalid artifact", () => {
    expect(() =>
      issueVerifiedChargebackResolutionAuthority(
        input({ resolution: "lost" })
      )
    ).toThrow(ChargebackResolutionAuthorityIssuanceError);
    expect(() =>
      issueVerifiedChargebackResolutionAuthority(
        input({ outcomeArtifact: { artifactId: "artifact-1", sha256Digest: digest, byteLength: -1 } })
      )
    ).toThrow(ChargebackResolutionAuthorityIssuanceError);
  });
});
