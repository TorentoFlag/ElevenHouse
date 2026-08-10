import { describe, expect, it } from "vitest";
import {
  beginFinanceAuthorizationRequestSchema,
  beginFinanceAuthorizationResponseSchema,
  financeSensitiveActionKindSchema,
  financeSensitiveActionKindValues,
  verifyFinanceAuthorizationRequestSchema,
  verifyFinanceAuthorizationResponseSchema
} from "./finance-authorization";
import { financeOperationKindValues } from "./finance-operations";

const aggregateId = "11111111-1111-4111-8111-111111111111";
const challengeId = "22222222-2222-4222-8222-222222222222";
const authorizationId = "33333333-3333-4333-8333-333333333333";
const base64Url32Bytes = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

const assertion = {
  id: "credential-id",
  rawId: "credential-id",
  type: "public-key" as const,
  response: {
    clientDataJSON: "client-data",
    authenticatorData: "authenticator-data",
    signature: "signature",
    userHandle: null
  },
  clientExtensionResults: {}
};

describe("finance authorization contracts", () => {
  it("defines exactly the approved sensitive subset of the shared finance operation enum", () => {
    expect(financeSensitiveActionKindValues).toEqual([
      "tariff_publish",
      "fiscal_policy_publish",
      "risk_policy_publish",
      "refund_execute",
      "chargeback_principal_allocate",
      "chargeback_resolution",
      "payout_destination_reveal",
      "payout_destination_change",
      "payout_approve",
      "payout_start_processing",
      "payout_confirm_paid",
      "bank_snapshot_attest",
      "bank_statement_match",
      "ledger_correction"
    ]);

    for (const operationKind of financeOperationKindValues) {
      const result = financeSensitiveActionKindSchema.safeParse(operationKind);
      expect(result.success).toBe(
        financeSensitiveActionKindValues.includes(operationKind as never)
      );
    }
  });

  it("strictly validates begin requests and the canonical command-payload value set", () => {
    const request = {
      actionKind: "payout_approve",
      aggregateId,
      expectedVersion: 3,
      payload: {
        amountMinor: 960_000,
        approved: true,
        note: null,
        sourceLots: ["lot-1", "lot-2"]
      }
    } as const;

    expect(beginFinanceAuthorizationRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      beginFinanceAuthorizationRequestSchema.parse({ ...request, unexpected: true })
    ).toThrow();
    expect(() =>
      beginFinanceAuthorizationRequestSchema.parse({ ...request, expectedVersion: -1 })
    ).toThrow();
    expect(() =>
      beginFinanceAuthorizationRequestSchema.parse({ ...request, payload: { amount: 1.5 } })
    ).toThrow();
    expect(() =>
      beginFinanceAuthorizationRequestSchema.parse({
        ...request,
        actionKind: "platform_invoice_charge"
      })
    ).toThrow();
  });

  it("strictly validates serialized WebAuthn request options and exposes no credential material", () => {
    const response = {
      challengeId,
      expiresAt: "2026-08-03T09:05:00.000Z",
      publicKey: {
        challenge: base64Url32Bytes,
        rpId: "admin.elevenhouse.example",
        timeout: 300_000,
        userVerification: "required" as const
      }
    };

    expect(beginFinanceAuthorizationResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      beginFinanceAuthorizationResponseSchema.parse({
        ...response,
        publicKey: { ...response.publicKey, userVerification: "preferred" }
      })
    ).toThrow();
    expect(() =>
      beginFinanceAuthorizationResponseSchema.parse({
        ...response,
        publicKey: { ...response.publicKey, credentialPublicKey: "secret" }
      })
    ).toThrow();
  });

  it("strictly validates the portable WebAuthn assertion envelope", () => {
    const request = { challengeId, assertion };

    expect(verifyFinanceAuthorizationRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      verifyFinanceAuthorizationRequestSchema.parse({ ...request, unexpected: true })
    ).toThrow();
    expect(() =>
      verifyFinanceAuthorizationRequestSchema.parse({
        ...request,
        actionKind: "refund_execute",
        payload: { amountMinor: 1 }
      })
    ).toThrow();
    expect(() =>
      verifyFinanceAuthorizationRequestSchema.parse({
        ...request,
        assertion: {
          ...assertion,
          response: { ...assertion.response, clientDataJSON: "not base64url=" }
        }
      })
    ).toThrow();
    expect(() =>
      verifyFinanceAuthorizationRequestSchema.parse({
        ...request,
        assertion: { ...assertion, credentialPublicKey: "secret" }
      })
    ).toThrow();
  });

  it("returns only an opaque grant id and safe expiry", () => {
    const response = {
      authorizationId,
      expiresAt: "2026-08-03T09:05:30.000Z"
    };

    expect(verifyFinanceAuthorizationResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      verifyFinanceAuthorizationResponseSchema.parse({
        ...response,
        credentialId: "credential-id"
      })
    ).toThrow();
    expect(() =>
      verifyFinanceAuthorizationResponseSchema.parse({
        ...response,
        payloadHash: `sha256:${"a".repeat(64)}`
      })
    ).toThrow();
  });
});
