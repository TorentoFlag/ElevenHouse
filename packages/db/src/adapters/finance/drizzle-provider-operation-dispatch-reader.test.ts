/* eslint-disable @typescript-eslint/no-explicit-any -- Persistence row fixtures are intentionally untyped to cover malformed joins. */
import { describe, expect, it } from "vitest";

import {
  mapSavedCardCredentialForDispatch,
  mapProviderOperationDispatchWorkItem
} from "./drizzle-provider-operation-dispatch-reader";

const digest = `sha256:${"a".repeat(64)}`;
const otherDigest = `sha256:${"b".repeat(64)}`;

describe("mapProviderOperationDispatchWorkItem", () => {
  it("rehydrates only a persisted pending receipt with its exact immutable provider artifact", () => {
    expect(mapProviderOperationDispatchWorkItem(validRow() as never)).toMatchObject({
      status: "pending_dispatch",
      operationKind: "saved_card_charge",
      dispatch: {
        providerOperationIntentId: "00000000-0000-4000-8000-000000000001",
        providerOperationIntentVersion: 0,
        economicPaymentVersion: 1,
        amountMinor: "9600",
        currency: "RUB",
        canonicalRequestDigest: digest,
        sealedDispatchPayloadRef: "artifact-1"
      },
      operationEnvelope: {
        kind: "resolved_finance_operation_envelope",
        policyId: "finance-operation-policy",
        policyVersion: 1,
        policyDigest: digest,
        maximumRows: 1_000,
        maximumDecimalDigits: 38,
        maximumArtifactBytes: 1_048_576
      },
      dispatchArtifact: {
        artifactId: "artifact-1",
        sha256Digest: digest,
        byteLength: 512
      }
    });
  });

  it("rejects a terminal operation instead of allowing a second provider call", () => {
    const row = validRow();
    row.operation.status = "succeeded";

    expect(() => mapProviderOperationDispatchWorkItem(row as never)).toThrow(
      expect.objectContaining({ reason: "dispatch_not_executable" })
    );
  });

  it("rejects an artifact digest that is not exactly the receipt's canonical dispatch", () => {
    const row = validRow();
    row.privateArtifact.sha256Digest = otherDigest;

    expect(() => mapProviderOperationDispatchWorkItem(row as never)).toThrow(
      expect.objectContaining({ reason: "dispatch_integrity_conflict" })
    );
  });

  it("allows the exact zero-RUB card setup dispatch and no other inferred zero amount", () => {
    const row = validRow();
    row.operation.purpose = "platform_card_setup";
    row.operation.operationKind = "card_setup";
    row.receipt.purpose = "platform_card_setup";
    row.receipt.operationKind = "card_setup";
    row.economic.amountMinor = "0";

    expect(() => mapProviderOperationDispatchWorkItem(row as never)).not.toThrow();
  });

  it("exposes only the opaque vault reference for a card-setup execute dispatch", () => {
    const row = validRow();
    row.operation.purpose = "platform_card_setup";
    row.operation.operationKind = "card_setup_execute";
    row.operation.dispatchStep = "execute";
    row.operation.transientSecretRefId = "saved-card-setup-execute:00000000-0000-4000-8000-000000000001";
    row.receipt.purpose = "platform_card_setup";
    row.receipt.operationKind = "card_setup_execute";
    row.economic.amountMinor = "0";
    row.transientSecret = {
      secretRefId: row.operation.transientSecretRefId,
      seriesId: "arc-main",
      providerAccountId: "arc-account-1",
      providerIdentityVersion: 1,
      providerSetupId: "11111111-1111-4111-8111-111111111111",
      sealedSecretRef: "kms://s3/eyJwcml2YXRlT2JqZWN0S2V5IjoidGVzdCJ9"
    };

    expect(mapProviderOperationDispatchWorkItem(row as never).transientSecret).toEqual({
      secretRefId: "saved-card-setup-execute:00000000-0000-4000-8000-000000000001",
      sealedSecretRef: "kms://s3/eyJwcml2YXRlT2JqZWN0S2V5IjoidGVzdCJ9",
      providerSetupId: "11111111-1111-4111-8111-111111111111"
    });
  });

  it("admits a saved-card vault locator only when it is exactly bound to the persisted operation", () => {
    const row = validRow();
    row.operation.restrictedCredentialId = "credential-1";
    row.operation.restrictedCredentialVersion = "1";

    expect(mapSavedCardCredentialForDispatch(row.operation, {
      credentialId: "credential-1",
      credentialVersion: "1",
      providerCustomerId: "astrologer:00000000-0000-4000-8000-000000000001",
      restrictedTokenHandleRef: "vault://arc/saved-card/credential-1",
      seriesId: "arc-main",
      providerAccountId: "arc-account-1",
      providerIdentityVersion: 1,
      headCredentialId: "credential-1",
      headCredentialVersion: "1",
      headLifecycle: "active",
      consentLifecycle: "granted"
    } as never)).toEqual({
      credentialId: "credential-1",
      credentialVersion: 1,
      providerCustomerId: "astrologer:00000000-0000-4000-8000-000000000001",
      restrictedTokenHandleRef: "vault://arc/saved-card/credential-1"
    });
  });

  it("rejects a vault locator after its credential or recurring consent has ceased to be active", () => {
    const row = validRow();
    row.operation.restrictedCredentialId = "credential-1";
    row.operation.restrictedCredentialVersion = "1";
    const credential = {
      credentialId: "credential-1",
      credentialVersion: "1",
      providerCustomerId: "astrologer:00000000-0000-4000-8000-000000000001",
      restrictedTokenHandleRef: "vault://arc/saved-card/credential-1",
      seriesId: "arc-main",
      providerAccountId: "arc-account-1",
      providerIdentityVersion: 1,
      headCredentialId: "credential-1",
      headCredentialVersion: "1",
      headLifecycle: "active",
      consentLifecycle: "revoked"
    };

    expect(() => mapSavedCardCredentialForDispatch(row.operation, credential as never)).toThrow(
      expect.objectContaining({ reason: "dispatch_integrity_conflict" })
    );
  });
});

function validRow(): any {
  return {
    operation: {
      id: "00000000-0000-4000-8000-000000000001",
      economicPaymentIntentId: "economic-1",
      correlatedEconomicPaymentVersion: "1",
      seriesId: "arc-main",
      providerAccountId: "arc-account-1",
      providerIdentityVersion: 1,
      purpose: "platform_invoice",
      sourceId: "invoice-1",
      operationKind: "saved_card_charge",
      dispatchStep: null,
      transientSecretRefId: null,
      status: "pending_dispatch",
      canonicalRequestDigest: digest,
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
      operationPolicyId: "finance-operation-policy",
      operationPolicyVersion: 1,
      operationPolicyDigest: digest,
      operationMaximumRows: 1_000,
      operationMaximumDecimalDigits: 38,
      operationMaximumArtifactBytes: 1_048_576
    },
    receipt: {
      providerOperationIntentId: "00000000-0000-4000-8000-000000000001",
      providerOperationIntentVersion: "0",
      economicPaymentIntentId: "economic-1",
      correlatedEconomicPaymentVersion: "1",
      seriesId: "arc-main",
      providerAccountId: "arc-account-1",
      providerIdentityVersion: 1,
      purpose: "platform_invoice",
      sourceId: "invoice-1",
      operationKind: "saved_card_charge",
      canonicalRequestDigest: digest,
      dispatchAuthorizationId: "authorization-1",
      dispatchAuthorizationDigest: digest,
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
      dispatchArtifactId: "artifact-1",
      dispatchArtifactDigest: digest,
      economicPaymentSessionId: "session-1",
      persistenceTransactionBoundaryRef: "postgres-xid:123",
      committedAt: new Date("2026-08-04T10:00:00.000Z")
    },
    economic: {
      id: "economic-1",
      version: "1",
      amountMinor: "9600",
      currency: "RUB"
    },
    artifact: {
      providerOperationIntentId: "00000000-0000-4000-8000-000000000001",
      artifactId: "artifact-1",
      artifactDigest: digest,
      canonicalRequestDigest: digest
    },
    privateArtifact: {
      id: "artifact-1",
      artifactClass: "provider_request",
      sha256Digest: digest,
      byteLength: "512"
    },
    transientSecret: null
  };
}
