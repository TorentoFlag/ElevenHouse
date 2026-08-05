/* eslint-disable @typescript-eslint/no-explicit-any -- Persistence row fixtures are intentionally untyped to cover malformed joins. */
import { describe, expect, it } from "vitest";

import {
  mapPlatformTariffInvoiceChargeTerminalReconciliationCandidate,
  mapRecordedPlatformTariffInvoiceCustomerActionCandidate
} from "./drizzle-platform-tariff-invoice-charge-terminal-reconciliation-reader";

describe("platform tariff invoice terminal reconciliation mapping", () => {
  it("selects an ambiguous first charge for canonical polling without exposing credential data", () => {
    const candidate = mapPlatformTariffInvoiceChargeTerminalReconciliationCandidate(row());

    expect(candidate).toEqual(expect.objectContaining({
      invoiceId: "platform-tariff-invoice:1",
      expectedInvoiceVersion: 1,
      customerActionState: "not_recorded",
      providerPaymentId: "10000000-0000-4000-8000-000000000003",
      providerOperation: expect.objectContaining({
        expectedEconomicPaymentVersion: 1,
        expectedProviderOperationIntentVersion: 1,
        providerOperationIntentId: "10000000-0000-4000-8000-000000000004",
        economicPaymentSessionId: "10000000-0000-4000-8000-000000000005"
      })
    }));
    expect(JSON.stringify(candidate)).not.toContain("credential");
    expect(JSON.stringify(candidate)).not.toContain("vault://");
  });

  it("fails closed if a purported recovery result is not the current ambiguous operation result", () => {
    const value = row();
    value.result.providerOperationIntentVersion = "2";

    expect(mapPlatformTariffInvoiceChargeTerminalReconciliationCandidate(value)).toBeNull();
  });

  it("continues the same provider payment after Method without treating it as a new saved-card charge", () => {
    const value = row();
    value.operation.operationKind = "saved_card_charge_3ds_method_complete";
    const candidate = mapPlatformTariffInvoiceChargeTerminalReconciliationCandidate(value);

    expect(candidate?.providerOperation.operationKind).toBe("saved_card_charge_3ds_method_complete");
    expect(candidate?.providerPaymentId).toBe(value.result.providerPaymentId);
  });

  it("resumes canonical polling after the exact 3DS action became durable", () => {
    const candidate = mapRecordedPlatformTariffInvoiceCustomerActionCandidate({
      invoice: { ...row().invoice, state: "requires_customer_action", version: 2 },
      operation: { ...row().operation, status: "requires_customer_action", version: "2" },
      economic: row().economic,
      action: {
        invoiceId: "platform-tariff-invoice:1",
        invoiceVersion: "2",
        economicPaymentIntentId: "10000000-0000-4000-8000-000000000006",
        economicPaymentSessionId: "10000000-0000-4000-8000-000000000005",
        providerOperationIntentId: "10000000-0000-4000-8000-000000000004",
        providerOperationIntentVersion: "2",
        providerPaymentId: "10000000-0000-4000-8000-000000000003",
        actionType: "three_ds_challenge",
        phase: "challenge",
        status: "pending"
      }
    } as any);

    expect(candidate).toEqual(expect.objectContaining({
      invoiceId: "platform-tariff-invoice:1",
      expectedInvoiceVersion: 2,
      providerPaymentId: "10000000-0000-4000-8000-000000000003",
      customerActionState: "recorded",
      providerOperation: expect.objectContaining({ expectedProviderOperationIntentVersion: 2 })
    }));
  });
});

function row(): any {
  return {
    invoice: { id: "platform-tariff-invoice:1", state: "payment_pending", version: 1, amountMinor: 9_900, currency: "RUB" },
    operation: {
      id: "10000000-0000-4000-8000-000000000004", status: "provider_unknown", version: "1", economicPaymentIntentId: "10000000-0000-4000-8000-000000000006", economicPaymentSessionId: "10000000-0000-4000-8000-000000000005",
      seriesId: "arc-series", providerAccountId: "arc-account", providerIdentityVersion: 1, purpose: "platform_invoice", sourceId: "platform-tariff-invoice:1", operationKind: "saved_card_charge",
      canonicalRequestDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", idempotencyKey: "10000000-0000-4000-8000-000000000004",
      operationPolicyId: "platform-invoice-charge", operationPolicyVersion: 1, operationPolicyDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", operationMaximumRows: 1, operationMaximumDecimalDigits: 38, operationMaximumArtifactBytes: 4096
    },
    economic: { id: "10000000-0000-4000-8000-000000000006", version: "1", purpose: "platform_invoice", sourceId: "platform-tariff-invoice:1", seriesId: "arc-series", providerAccountId: "arc-account", providerIdentityVersion: 1, amountMinor: "9900", currency: "RUB" },
    result: { providerOperationIntentId: "10000000-0000-4000-8000-000000000004", providerOperationIntentVersion: "1", correlatedEconomicPaymentVersion: "1", outcome: "ambiguous", providerPaymentId: "10000000-0000-4000-8000-000000000003", amountMinor: null, currency: null }
  };
}
