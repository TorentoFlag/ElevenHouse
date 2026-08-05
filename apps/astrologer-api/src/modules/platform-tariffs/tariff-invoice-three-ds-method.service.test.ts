import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { PlatformTariffInvoiceThreeDsMethodCompletionPersistenceError } from "@elevenhouse/db/finance";
import { describe, expect, it, vi } from "vitest";
import {
  createFinanceOperationResourcePolicyDraft,
  publishFinanceOperationResourcePolicyDraft
} from "@elevenhouse/domain/finance-core";

import { TariffInvoiceThreeDsMethodService } from "./tariff-invoice-three-ds-method.service";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const actionId = "33333333-3333-4333-8333-333333333333";
const paymentId = "44444444-4444-4444-8444-444444444444";

describe("TariffInvoiceThreeDsMethodService", () => {
  it("seals fresh Method browser context and commits only the server-resolved pending action", async () => {
    const setup = harness();

    await expect(setup.service.complete(session(), invoiceId, "invoice-method-key-1", request())).resolves.toEqual({
      invoiceId,
      subscriptionId: "55555555-5555-4555-8555-555555555555",
      invoiceVersion: 4,
      state: "payment_pending"
    });

    expect(setup.vault.sealArcPayThreeDsMethodContext).toHaveBeenCalledWith(expect.objectContaining({
      providerSetupId: paymentId,
      browserInfo: request().browserInfo
    }));
    expect(setup.completion.completeThreeDsMethod).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId,
      customerActionId: actionId,
      expectedInvoiceVersion: 3,
      completionIndicator: "Y"
    }));
    expect(JSON.stringify(setup.completion.completeThreeDsMethod.mock.calls[0]?.[0])).not.toContain("three_ds_server_trans_id");
  });

  it("rejects malformed browser facts before any private write or action lookup", async () => {
    const setup = harness();
    await expect(setup.service.complete(session(), invoiceId, "invoice-method-key-2", {
      expectedInvoiceVersion: 3,
      completionIndicator: "Y",
      browserInfo: { language: "ru" }
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(setup.actions.findPendingForOwner).not.toHaveBeenCalled();
    expect(setup.vault.sealArcPayThreeDsMethodContext).not.toHaveBeenCalled();
  });

  it("reports a retryable persistence conflict as an observable unavailable state", async () => {
    const setup = harness({
      completionError: new PlatformTariffInvoiceThreeDsMethodCompletionPersistenceError(
        "retryable_concurrency_conflict"
      )
    });

    await expect(setup.service.complete(session(), invoiceId, "invoice-method-key-3", request()))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

function harness(options: Readonly<{ completionError?: Error }> = {}) {
  const actions = {
    findPendingForOwner: vi.fn(async () => ({
      invoiceId,
      subscriptionId: "55555555-5555-4555-8555-555555555555",
      ownerUserId,
      invoiceVersion: 3,
      customerActionId: actionId,
      providerPaymentId: paymentId,
      providerAccount: { seriesId: "arc", providerAccountId: "merchant", identityVersion: 1 },
      actionType: "three_ds_method" as const,
      phase: "method" as const,
      providerResponseArtifact: { artifactId: "canonical-action", sha256Digest: `sha256:${"a".repeat(64)}`, byteLength: 128 }
    }))
  };
  const completion = {
    completeThreeDsMethod: vi.fn(async (input) => {
      if (options.completionError) throw options.completionError;
      return { providerOperationIntentId: input.providerOperationIntentId };
    })
  };
  const vault = {
    sealArcPayThreeDsMethodContext: vi.fn(async () => ({
      kind: "sealed_one_time_provider_secret_ref" as const,
      secretRef: "kms://s3/invoice-method-context",
      providerExpiresAt: "2026-08-04T12:04:00Z",
      providerConsumption: "one_time" as const
    }))
  };
  const storage = {
    writeImmutable: vi.fn(async (input) => ({
      contentType: input.contentType,
      sha256Digest: input.expectedSha256Digest,
      byteLength: input.bytes.byteLength,
      locator: "private-object"
    }))
  };
  const auditLogStore = { createEntry: vi.fn(async () => undefined) };
  const unitOfWork = {
    executeIdempotent: vi.fn(async (input) => {
      const created = await input.create({ tariffInvoiceThreeDsMethodCompletion: completion, auditLogStore });
      return { value: created.value, replayed: false };
    })
  };
  const policies = {
    findPublishedForOperation: vi.fn(async () => publishFinanceOperationResourcePolicyDraft(
      createFinanceOperationResourcePolicyDraft({
        policyId: "invoice-method-policy", version: 1,
        operationKind: "platform_invoice_complete_3ds_method",
        maximumRows: 1, maximumDecimalDigits: 38, maximumArtifactBytes: 16_384
      })
    ))
  };
  const config = {
    getOrThrow: vi.fn(() => ({
      arcPayConfigured: true,
      financeArtifactStorage: { requestRetention: { policyId: "finance-request", policyVersion: "1" } }
    }))
  };
  return {
    service: new TariffInvoiceThreeDsMethodService(
      actions as never, unitOfWork as never, policies as never, storage as never, vault as never,
      { now: () => new Date("2026-08-04T12:00:00Z") } as never, config as never
    ),
    actions, completion, vault
  };
}

function session() { return { currentAstrologerAccount: { account: { id: ownerUserId } } } as never; }
function request() {
  return {
    expectedInvoiceVersion: 3,
    completionIndicator: "Y",
    browserInfo: {
      acceptHeader: "text/html", language: "ru-RU", screenWidth: 1440, screenHeight: 900,
      colorDepth: 24, timezoneOffsetMinutes: -180, userAgent: "test-agent"
    }
  };
}
