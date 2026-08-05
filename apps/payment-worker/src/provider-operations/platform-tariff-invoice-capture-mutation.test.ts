import { describe, expect, it } from "vitest";
import type { ProviderOperationResultCommitReceipt } from "@elevenhouse/domain/finance-core";

import { createPlatformTariffInvoiceCaptureMutation } from "./platform-tariff-invoice-capture-mutation";

describe("platform tariff invoice capture mutation", () => {
  it("builds the fixed journal-only clearing-to-deferred posting for a canonical capture", () => {
    const mutation = createPlatformTariffInvoiceCaptureMutation({
      invoice: { invoiceId: "platform-tariff-invoice:1", ownerUserId: "10000000-0000-4000-8000-000000000001", tariffSeriesId: "pro", tariffVersion: 2 },
      providerResult: providerResult(),
      capturedAt: "2026-08-04T12:00:00.000Z",
      postedAt: "2026-08-04T12:00:01.000Z",
      operationEnvelope: { kind: "resolved_finance_operation_envelope", policyId: "platform-invoice", policyVersion: 1, policyDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", maximumRows: 1, maximumDecimalDigits: 38, maximumArtifactBytes: 4096 } as never
    });

    expect(mutation.command.postingRecipe.transaction).toMatchObject({
      sourceKey: { kind: "platform_invoice", sourceId: "platform-tariff-invoice:1", operation: "captured" },
      entries: [
        { account: { code: "arc_provider_clearing", arcProviderAccountId: "arc-account", currency: "RUB" }, side: "debit", amount: { amountMinor: 9900, currency: "RUB" } },
        { account: { code: "platform_subscription_deferred", currency: "RUB" }, side: "credit", amount: { amountMinor: 9900, currency: "RUB" } }
      ]
    });
  });
});

function providerResult(): ProviderOperationResultCommitReceipt {
  return { kind: "provider_operation_result_commit_receipt", providerOperationResultId: "result-1", providerOperationIntentId: "operation-1", providerOperationIntentVersion: 2, providerOperationId: "10000000-0000-4000-8000-000000000004", operationKind: "saved_card_charge", economicPaymentIntentId: "intent-1", correlatedEconomicPaymentVersion: 1, economicPaymentSessionId: "session-1", sourceId: "platform-tariff-invoice:1", purpose: "platform_invoice", providerAccount: { seriesId: "arc-series", providerAccountId: "arc-account", identityVersion: 1 }, outcome: "succeeded", providerPaymentId: "10000000-0000-4000-8000-000000000004", amountMinor: "9900", currency: "RUB", evidenceArtifactId: "artifact-1", evidenceArtifactDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", canonicalRequestDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", observedAt: "2026-08-04T12:00:00.000Z", persistenceTransactionBoundaryRef: "postgres-xid:1", committedAt: "2026-08-04T12:00:00.500Z" } as unknown as ProviderOperationResultCommitReceipt;
}
