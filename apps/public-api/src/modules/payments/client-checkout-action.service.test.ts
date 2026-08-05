import { createHash } from "node:crypto";

import type { FinancePrivateObjectStoragePort } from "@elevenhouse/domain/finance-core";
import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import { describe, expect, it, vi } from "vitest";

import { ClientCheckoutActionService } from "./client-checkout-action.service";

const checkoutPreparationId = "11111111-1111-4111-8111-111111111111";
const clientUserId = "22222222-2222-4222-8222-222222222222";
const providerCheckoutId = "33333333-3333-4333-8333-333333333333";
const responseArtifactId = "arc-hpp-session-response:44444444-4444-4444-8444-444444444444";
const checkoutUrl = "https://checkout.arcpay.space/session/33333333-3333-4333-8333-333333333333";
const responseBytes = new TextEncoder().encode(
  JSON.stringify({ id: providerCheckoutId, url: checkoutUrl })
);
const responseDigest = `sha256:${createHash("sha256").update(responseBytes).digest("hex")}` as const;

describe("ClientCheckoutActionService", () => {
  it("returns an exact worker-published Hosted Checkout action only to its client owner", async () => {
    const store = {
      findClientCheckoutPreparation: vi.fn(async () => readyPreparation())
    };
    const bytes = new Uint8Array(responseBytes);
    const registry = {
      resolvePrivateArtifact: vi.fn(async () => ({
        artifact: {
          artifactId: responseArtifactId,
          sha256Digest: responseDigest,
          byteLength: bytes.byteLength
        },
        artifactClass: "provider_response" as const,
        contentType: "application/json",
        privateObject: {
          privateObjectKey: `finance/artifacts/${responseArtifactId}.json`,
          privateObjectVersion: "v1",
          envelopeKeyVersion: "arn:aws:kms:eu-central-1:123456789012:key/11111111-1111-4111-8111-111111111111"
        },
        retainedUntil: "2026-08-05T12:00:00.000Z",
        accessAuditEventId: "55555555-5555-4555-8555-555555555555"
      }))
    } satisfies Pick<FinanceArtifactRegistry, "resolvePrivateArtifact">;
    const privateStorage = {
      readImmutable: vi.fn(async () => ({
        bytes,
        sha256Digest: responseDigest,
        byteLength: bytes.byteLength,
        contentType: "application/json"
      }))
    } as Pick<FinancePrivateObjectStoragePort, "readImmutable">;

    const service = new ClientCheckoutActionService(store, registry, privateStorage);

    await expect(
      service.resolveAction({ checkoutPreparationId, clientUserId, requestId: "request-1" })
    ).resolves.toEqual({
      kind: "checkout_action_ready",
      checkoutUrl
    });
    expect(registry.resolvePrivateArtifact).toHaveBeenCalledWith({
      artifactId: responseArtifactId,
      serviceIdentity: "client_checkout_delivery",
      purpose: "client_checkout_action_delivery",
      requestId: "request-1"
    });
    expect(privateStorage.readImmutable).toHaveBeenCalledWith({
      privateObjectKey: `finance/artifacts/${responseArtifactId}.json`,
      privateObjectVersion: "v1",
      envelopeKeyVersion: "arn:aws:kms:eu-central-1:123456789012:key/11111111-1111-4111-8111-111111111111"
    });
  });

  it("does not read a sealed provider response while the worker is still preparing", async () => {
    const store = {
      findClientCheckoutPreparation: vi.fn(async () => ({
        ...readyPreparation(),
        state: "checkout_requested" as const,
        providerCheckoutId: null,
        responseArtifactId: null,
        responseArtifactDigest: null
      }))
    };
    const registry = {
      resolvePrivateArtifact: vi.fn()
    } satisfies Pick<FinanceArtifactRegistry, "resolvePrivateArtifact">;
    const privateStorage = {
      readImmutable: vi.fn(async () => ({
        bytes: new Uint8Array([1]),
        sha256Digest: responseDigest,
        byteLength: 1,
        contentType: "application/json"
      }))
    } as Pick<FinancePrivateObjectStoragePort, "readImmutable">;

    const service = new ClientCheckoutActionService(store, registry, privateStorage);

    await expect(
      service.resolveAction({ checkoutPreparationId, clientUserId, requestId: "request-2" })
    ).resolves.toEqual({ kind: "checkout_preparing" });
    expect(registry.resolvePrivateArtifact).not.toHaveBeenCalled();
    expect(privateStorage.readImmutable).not.toHaveBeenCalled();
  });

  it("exposes only the owner-scoped preparation state before browser redirect", async () => {
    const store = { findClientCheckoutPreparation: vi.fn(async () => readyPreparation()) };
    const registry = { resolvePrivateArtifact: vi.fn() } satisfies Pick<
      FinanceArtifactRegistry,
      "resolvePrivateArtifact"
    >;
    const privateStorage = { readImmutable: vi.fn() } as Pick<
      FinancePrivateObjectStoragePort,
      "readImmutable"
    >;
    const service = new ClientCheckoutActionService(store, registry, privateStorage);

    await expect(
      service.resolveState({ checkoutPreparationId, clientUserId })
    ).resolves.toBe("checkout_ready");
    expect(registry.resolvePrivateArtifact).not.toHaveBeenCalled();
    expect(privateStorage.readImmutable).not.toHaveBeenCalled();
  });

  it("rejects an artifact whose bytes do not match the registry's immutable receipt", async () => {
    const store = { findClientCheckoutPreparation: vi.fn(async () => readyPreparation()) };
    const registry = {
      resolvePrivateArtifact: vi.fn(async () => ({
        artifact: {
          artifactId: responseArtifactId,
          sha256Digest: responseDigest,
          byteLength: 1
        },
        artifactClass: "provider_response" as const,
        contentType: "application/json",
        privateObject: {
          privateObjectKey: `finance/artifacts/${responseArtifactId}.json`,
          privateObjectVersion: "v1",
          envelopeKeyVersion: "arn:aws:kms:eu-central-1:123456789012:key/11111111-1111-4111-8111-111111111111"
        },
        retainedUntil: "2026-08-05T12:00:00.000Z",
        accessAuditEventId: "55555555-5555-4555-8555-555555555555"
      }))
    } satisfies Pick<FinanceArtifactRegistry, "resolvePrivateArtifact">;
    const privateStorage = {
      readImmutable: vi.fn(async () => ({
        bytes: new Uint8Array([1]),
        sha256Digest: responseDigest,
        byteLength: 1,
        contentType: "application/json"
      }))
    } as Pick<FinancePrivateObjectStoragePort, "readImmutable">;

    const service = new ClientCheckoutActionService(store, registry, privateStorage);

    await expect(
      service.resolveAction({ checkoutPreparationId, clientUserId, requestId: "request-3" })
    ).rejects.toMatchObject({ reason: "artifact_integrity" });
    expect(privateStorage.readImmutable).toHaveBeenCalledTimes(1);
  });

  it("recomputes the response digest instead of trusting a storage adapter claim", async () => {
    const store = { findClientCheckoutPreparation: vi.fn(async () => readyPreparation()) };
    const bytes = new TextEncoder().encode(
      JSON.stringify({ id: providerCheckoutId, url: "https://attacker.example/checkout" })
    );
    const registry = {
      resolvePrivateArtifact: vi.fn(async () => ({
        artifact: {
          artifactId: responseArtifactId,
          sha256Digest: responseDigest,
          byteLength: bytes.byteLength
        },
        artifactClass: "provider_response" as const,
        contentType: "application/json",
        privateObject: {
          privateObjectKey: `finance/artifacts/${responseArtifactId}.json`,
          privateObjectVersion: "v1",
          envelopeKeyVersion: "arn:aws:kms:eu-central-1:123456789012:key/11111111-1111-4111-8111-111111111111"
        },
        retainedUntil: "2026-08-05T12:00:00.000Z",
        accessAuditEventId: "55555555-5555-4555-8555-555555555555"
      }))
    } satisfies Pick<FinanceArtifactRegistry, "resolvePrivateArtifact">;
    const privateStorage = {
      readImmutable: vi.fn(async () => ({
        bytes,
        sha256Digest: responseDigest,
        byteLength: bytes.byteLength,
        contentType: "application/json"
      }))
    } as Pick<FinancePrivateObjectStoragePort, "readImmutable">;

    const service = new ClientCheckoutActionService(store, registry, privateStorage);

    await expect(
      service.resolveAction({ checkoutPreparationId, clientUserId, requestId: "request-4" })
    ).rejects.toMatchObject({ reason: "artifact_integrity" });
  });
});

function readyPreparation() {
  return {
    checkoutPreparationId,
    orderId: "66666666-6666-4666-8666-666666666666",
    clientUserId,
    economicPaymentIntentId: "payment-intent-1",
    economicPaymentSessionId: "payment-session-1",
    providerOperationIntentId: "44444444-4444-4444-8444-444444444444",
    requestArtifactId: "request-artifact-1",
    requestArtifactDigest: responseDigest,
    version: 2,
    state: "checkout_ready" as const,
    providerCheckoutId,
    responseArtifactId,
    responseArtifactDigest: responseDigest,
    failureCode: null
  };
}
