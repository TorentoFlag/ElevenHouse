import { describe, expect, it } from "vitest";

import type { CreateFinanceOrderRecordInput } from "@elevenhouse/domain";

import { createOrderEconomicsSnapshotForPersistence } from "./drizzle-order-store";

describe("createOrderEconomicsSnapshotForPersistence", () => {
  it("freezes the exact order economics selected at order creation", () => {
    expect(createOrderEconomicsSnapshotForPersistence(orderInput())).toEqual({
      orderId: "11111111-1111-4111-8111-111111111111",
      astrologerUserId: "22222222-2222-4222-8222-222222222222",
      planId: "pro",
      planVersionId: "pro@7",
      gross: { amountMinor: 50_000, currency: "RUB" },
      commission: { amountMinor: 4_000, currency: "RUB" },
      payable: { amountMinor: 46_000, currency: "RUB" },
      commissionBps: 800,
      allocationRevision: "bps_half_up_v1"
    });
  });
});

function orderInput(): CreateFinanceOrderRecordInput {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    clientUserId: "33333333-3333-4333-8333-333333333333",
    astrologerUserId: "22222222-2222-4222-8222-222222222222",
    productId: "44444444-4444-4444-8444-444444444444",
    productTitleSnapshot: "Natal consultation",
    directLinkIntentId: null,
    bookingId: null,
    status: "pending_payment",
    grossAmount: { amountMinor: 50_000, currency: "RUB" },
    platformFee: { amountMinor: 4_000, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 46_000, currency: "RUB" },
    financePolicySnapshotId: "policy-main",
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 1_000,
    financePolicyReserveReleaseDelayDays: 14,
    tariffSeriesId: "pro",
    tariffVersion: 7,
    tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    tariffCommissionBps: 800,
    financePolicyProviderSettlementRequired: true,
    now: "2026-08-07T12:00:00.000Z"
  };
}
