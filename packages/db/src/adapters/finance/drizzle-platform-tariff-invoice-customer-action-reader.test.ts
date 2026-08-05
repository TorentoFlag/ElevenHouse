/* eslint-disable @typescript-eslint/no-explicit-any -- Persistence row fixtures are intentionally untyped to cover malformed joins. */
import { describe, expect, it } from "vitest";

import { mapPlatformTariffInvoiceCustomerActionForOwner } from "./drizzle-platform-tariff-invoice-customer-action-reader";

describe("platform tariff invoice customer action reader", () => {
  it("delivers only owner-bound public action metadata, never the sealed provider payload", () => {
    const action = mapPlatformTariffInvoiceCustomerActionForOwner(row());

    expect(action).toEqual(expect.objectContaining({
      invoiceId: "platform-tariff-invoice:1",
      invoiceVersion: 2,
      ownerUserId: "10000000-0000-4000-8000-000000000001",
      actionType: "three_ds_challenge",
      phase: "challenge"
    }));
    expect(JSON.stringify(action)).not.toContain("privateObject");
    expect(JSON.stringify(action)).not.toContain("vault://");
  });

  it("fails closed when the action no longer matches the current invoice or operation version", () => {
    const value = row();
    value.action.providerOperationIntentVersion = "1";

    expect(mapPlatformTariffInvoiceCustomerActionForOwner(value)).toBeNull();
  });
});

function row(): any {
  return {
    invoice: {
      id: "platform-tariff-invoice:1", subscriptionId: "10000000-0000-4000-8000-000000000002",
      ownerUserId: "10000000-0000-4000-8000-000000000001", state: "requires_customer_action", version: 2
    },
    action: {
      id: "10000000-0000-4000-8000-000000000003", invoiceId: "platform-tariff-invoice:1", invoiceVersion: "2",
      economicPaymentIntentId: "intent-1", economicPaymentSessionId: "session-1",
      providerOperationIntentId: "10000000-0000-4000-8000-000000000004", providerOperationIntentVersion: "2",
      providerPaymentId: "10000000-0000-4000-8000-000000000005", providerResponseArtifactId: "artifact-1",
      providerResponseArtifactDigest: `sha256:${"a".repeat(64)}`, actionType: "three_ds_challenge", phase: "challenge", status: "pending"
    },
    operation: {
      id: "10000000-0000-4000-8000-000000000004", version: "2", status: "requires_customer_action", purpose: "platform_invoice",
      operationKind: "saved_card_charge", sourceId: "platform-tariff-invoice:1", economicPaymentIntentId: "intent-1", economicPaymentSessionId: "session-1",
      seriesId: "arc", providerAccountId: "merchant", providerIdentityVersion: 1
    },
    artifact: {
      id: "artifact-1", artifactClass: "provider_canonical_read", bindingKind: "provider", sha256Digest: `sha256:${"a".repeat(64)}`,
      byteLength: "128", seriesId: "arc", providerAccountId: "merchant", providerIdentityVersion: 1, privateObject: "vault://never"
    }
  };
}
