/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately incomplete dispatch fixtures isolate the provider boundary. */
import { createHash } from "node:crypto";

import {
  digestFinanceCanonicalValueV1,
  type FinancePrivateObjectStoragePort,
  type ProviderOperationResultApplicationUnitOfWork,
  type ProviderOperationTransportUnknownUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { describe, expect, it, vi } from "vitest";

import {
  ArcPayRefundClientError,
  createArcPayRefundClient
} from "../arc-pay/arc-pay-refund-client";
import { createRefundDispatcher } from "./refund-dispatcher";

describe("refund dispatcher", () => {
  it("persists a provider-accepted refund only as ambiguous evidence pending canonical outcome", async () => {
    const responseBytes = new TextEncoder().encode(JSON.stringify({
      id: "30000000-0000-4000-8000-000000000003",
      payment_id: "10000000-0000-4000-8000-000000000001",
      amount: 4_000,
      currency: "RUB",
      status: "pending",
      created_at: "2026-08-05T10:00:00Z"
    }));
    const applyVerifiedProviderResult = vi.fn(async () => ({ kind: "provider_operation_result_commit_receipt" }));
    const createRefund = vi.fn(async () => ({
      providerRefundId: "30000000-0000-4000-8000-000000000003",
      providerPaymentId: "10000000-0000-4000-8000-000000000001",
      amountMinor: 4_000,
      currency: "RUB" as const,
      status: "pending" as const,
      rawResponseBytes: responseBytes
    }));

    await createRefundDispatcher({
      privateObjectStorage: storage(),
      artifactRegistry: { registerSealedArtifact: vi.fn(async ({ artifact }: any) => artifact) },
      refundClient: { createRefund } as ReturnType<typeof createArcPayRefundClient>,
      providerResult: { applyVerifiedProviderResult } as unknown as ProviderOperationResultApplicationUnitOfWork,
      transportUnknown: { markProviderOperationTransportUnknown: vi.fn() } as ProviderOperationTransportUnknownUnitOfWork,
      responseArtifactRetention: { policyId: "response", policyVersion: "1" },
      now: () => new Date("2026-08-05T10:01:00.000Z")
    }).dispatch(workItem());

    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "20000000-0000-4000-8000-000000000002"
    }));
    expect(applyVerifiedProviderResult).toHaveBeenCalledWith(expect.objectContaining({
      expectedEconomicPaymentVersion: 2,
      expectedProviderOperationIntentVersion: 0,
      evidence: expect.objectContaining({
        operationKind: "refund",
        providerOperationId: "30000000-0000-4000-8000-000000000003",
        providerPaymentId: "10000000-0000-4000-8000-000000000001",
        outcome: "ambiguous",
        amountMinor: null,
        currency: null,
        observedAt: "2026-08-05T10:01:00.000Z"
      })
    }));
  });

  it("fences an indeterminate POST rather than issuing a fresh refund", async () => {
    const markProviderOperationTransportUnknown = vi.fn(async () => undefined);
    const createRefund = vi.fn(async () => { throw new ArcPayRefundClientError("transport"); });
    const applyVerifiedProviderResult = vi.fn();

    await createRefundDispatcher({
      privateObjectStorage: storage(),
      artifactRegistry: { registerSealedArtifact: vi.fn() },
      refundClient: { createRefund } as unknown as ReturnType<typeof createArcPayRefundClient>,
      providerResult: { applyVerifiedProviderResult } as unknown as ProviderOperationResultApplicationUnitOfWork,
      transportUnknown: { markProviderOperationTransportUnknown } as unknown as ProviderOperationTransportUnknownUnitOfWork,
      responseArtifactRetention: { policyId: "response", policyVersion: "1" }
    }).dispatch(workItem());

    expect(markProviderOperationTransportUnknown).toHaveBeenCalledWith({
      economicPaymentIntentId: "40000000-0000-4000-8000-000000000004",
      expectedEconomicPaymentVersion: 2,
      providerOperationIntentId: "20000000-0000-4000-8000-000000000002",
      expectedProviderOperationIntentVersion: 0
    });
    expect(applyVerifiedProviderResult).not.toHaveBeenCalled();
  });
});

function workItem(): any {
  const envelope = refundEnvelope();
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  return {
    status: "pending_dispatch",
    operationKind: "refund",
    dispatch: {
      providerOperationIntentId: "20000000-0000-4000-8000-000000000002",
      providerOperationIntentVersion: 0,
      economicPaymentIntentId: "40000000-0000-4000-8000-000000000004",
      economicPaymentVersion: 2,
      economicPaymentSessionId: null,
      sourceId: "refund:refund-1",
      purpose: "client_order",
      amountMinor: "4000",
      currency: "RUB",
      providerAccount: { seriesId: "arc", providerAccountId: "merchant", identityVersion: 1 },
      canonicalRequestDigest: digestFinanceCanonicalValueV1(envelope),
      idempotencyKey: "20000000-0000-4000-8000-000000000002"
    },
    operationEnvelope: {
      kind: "resolved_finance_operation_envelope",
      policyId: "refund",
      policyVersion: 1,
      policyDigest: `sha256:${"b".repeat(64)}`,
      maximumRows: 1,
      maximumDecimalDigits: 38,
      maximumArtifactBytes: 4096
    },
    dispatchArtifact: { artifactId: "refund-request", sha256Digest: digest(bytes), byteLength: bytes.byteLength },
    privateObject: { privateObjectKey: "refund/request", privateObjectVersion: "v1", envelopeKeyVersion: "kms-1" },
    artifactAccessAuditEventId: "audit-1",
    transientSecret: null,
    savedCardCredential: null,
    savedCardSetup: null
  };
}

function refundEnvelope() {
  return {
    kind: "refund" as const,
    providerPaymentId: "10000000-0000-4000-8000-000000000001",
    amount: { amountMinor: 4_000, currency: "RUB" as const },
    externalId: "refund:refund-1"
  };
}

function storage() {
  const bytes = new TextEncoder().encode(JSON.stringify(refundEnvelope()));
  return {
    readImmutable: vi.fn(async () => ({
      bytes,
      sha256Digest: digest(bytes),
      byteLength: bytes.byteLength,
      contentType: "application/json"
    })),
    writeImmutable: vi.fn(async ({ bytes: responseBytes }: { bytes: Uint8Array }) => ({
      privateObjectKey: "refund/response",
      privateObjectVersion: "v1",
      envelopeKeyVersion: "kms-1",
      sha256Digest: digest(responseBytes),
      byteLength: responseBytes.byteLength,
      contentType: "application/json"
    }))
  } as unknown as FinancePrivateObjectStoragePort;
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
