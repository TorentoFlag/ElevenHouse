import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { TariffInvoicePaymentStatusService } from "./tariff-invoice-payment-status.service";

describe("TariffInvoicePaymentStatusService", () => {
  it("delivers a verified 3DS browser handoff only for the authenticated invoice owner", async () => {
    const service = harness().service;

    await expect(service.getStatus(session(), invoiceId)).resolves.toMatchObject({
      state: "requires_customer_action",
      nextAction: "complete_3ds",
      customerAction: { type: "three_ds_challenge" }
    });
  });

  it("fails closed when the private artifact registration does not match the pending action", async () => {
    const setup = harness();
    setup.artifacts.resolvePrivateArtifact.mockResolvedValueOnce({
      artifactClass: "provider_response",
      artifact: { artifactId: "artifact-1", sha256Digest: digest, byteLength: 128 },
      privateObject: {}
    });

    await expect(setup.service.getStatus(session(), invoiceId)).rejects.toBeInstanceOf(ConflictException);
  });

  it("recovers the only actionable invoice for an owner subscription after a browser refresh", async () => {
    const setup = harness();

    await expect(setup.service.getCurrentStatus(session(), subscriptionId)).resolves.toMatchObject({
      invoiceId,
      subscriptionId,
      nextAction: "complete_3ds"
    });

    expect(setup.invoices.findCurrentActionableInvoiceForSubscriptionOwner).toHaveBeenCalledWith({
      subscriptionId,
      ownerUserId
    });
  });
});

const invoiceId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const subscriptionId = "33333333-3333-4333-8333-333333333333";
const digest = `sha256:${"a".repeat(64)}` as const;

function harness() {
  const invoices = {
    findInvoiceForOwner: vi.fn(async () => ({
      invoiceId,
      subscriptionId,
      ownerUserId,
      invoiceVersion: 2,
      state: "requires_customer_action"
    })),
    findCurrentActionableInvoiceForSubscriptionOwner: vi.fn(async () => ({
      invoiceId,
      subscriptionId,
      ownerUserId,
      invoiceVersion: 2,
      state: "requires_customer_action"
    })),
    findPendingForOwner: vi.fn(async () => ({
      invoiceId,
      invoiceVersion: 2,
      subscriptionId,
      ownerUserId,
      customerActionId: "44444444-4444-4444-8444-444444444444",
      providerPaymentId: "55555555-5555-4555-8555-555555555555",
      providerAccount: { seriesId: "arc", providerAccountId: "merchant", identityVersion: 1 },
      actionType: "three_ds_challenge",
      phase: "challenge",
      providerResponseArtifact: { artifactId: "artifact-1", sha256Digest: digest, byteLength: 128 }
    }))
  };
  const privateStorage = {
    readImmutable: vi.fn(async () => ({
      contentType: "application/json",
      sha256Digest: digest,
      byteLength: 128,
      bytes: new TextEncoder().encode(JSON.stringify({
        next_action: {
          type: "three_ds_challenge",
          three_ds: {
            version: "2",
            phase: "challenge",
            submit: {
              method: "POST",
              url: "https://acs.example.test/challenge",
              target: "browser",
              fields: [{ name: "creq", value: "opaque" }]
            }
          }
        }
      }))
    }))
  };
  const artifacts = {
    resolvePrivateArtifact: vi.fn(async () => ({
      artifactClass: "provider_canonical_read",
      artifact: { artifactId: "artifact-1", sha256Digest: digest, byteLength: 128 },
      privateObject: {}
    }))
  };
  return {
    service: new TariffInvoicePaymentStatusService(invoices as never, privateStorage as never, artifacts as never),
    artifacts,
    invoices
  };
}

function session() {
  return { currentAstrologerAccount: { account: { id: ownerUserId } } } as never;
}
