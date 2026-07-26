import { describe, expect, it } from "vitest";
import {
  adminPayoutQueueResponseSchema,
  adminPayoutStatusUpdateSchema,
  payoutRequestResponseSchema,
  payoutRequestStatusSchema
} from "./payouts";

describe("payout contracts", () => {
	  it("captures manual payout request and admin status evidence", () => {
	    const payout = {
	      id: "11111111-1111-4111-8111-111111111111",
	      astrologerUserId: "22222222-2222-4222-8222-222222222222",
	      status: "under_review",
	      amount: { amountMinor: 10_000_00, currency: "RUB" },
	      method: "manual_bank_transfer",
	      requestedAt: "2026-07-24T10:00:00.000Z",
      reviewedAt: null,
      completedAt: null,
	      adminUserId: null,
	      adminNote: null,
	      failureReason: null,
	      externalReference: null,
	      transferredAt: null,
	      providerPayoutId: null
	    } as const;

	    expect(payoutRequestResponseSchema.parse(payout)).toEqual(payout);
	  });

	  it("rejects paid payout responses without manual transfer evidence", () => {
	    const paidPayout = {
	      id: "11111111-1111-4111-8111-111111111111",
	      astrologerUserId: "22222222-2222-4222-8222-222222222222",
	      status: "paid",
	      amount: { amountMinor: 10_000_00, currency: "RUB" },
	      method: "manual_bank_transfer",
	      requestedAt: "2026-07-24T10:00:00.000Z",
	      reviewedAt: "2026-07-24T10:10:00.000Z",
	      completedAt: "2026-07-24T10:20:00.000Z",
	      adminUserId: "33333333-3333-4333-8333-333333333333",
	      adminNote: null,
	      failureReason: null,
	      externalReference: "bank-transfer-1001",
	      transferredAt: "2026-07-24T10:20:00.000Z",
	      providerPayoutId: null
	    } as const;

	    expect(payoutRequestResponseSchema.parse(paidPayout)).toEqual(paidPayout);
	    expect(() =>
	      payoutRequestResponseSchema.parse({
	        ...paidPayout,
	        externalReference: null
	      })
	    ).toThrow();
	    expect(() =>
	      payoutRequestResponseSchema.parse({
	        ...paidPayout,
	        transferredAt: null
	      })
	    ).toThrow();
	  });

	  it("rejects unknown payout states", () => {
	    expect(payoutRequestStatusSchema.parse("paid")).toBe("paid");
	    expect(payoutRequestStatusSchema.parse("processing_manual")).toBe("processing_manual");
	    expect(payoutRequestStatusSchema.parse("processing_provider")).toBe("processing_provider");
	    expect(() => payoutRequestStatusSchema.parse("sent_to_arc_pay")).toThrow();
	  });

	  it("requires manual transfer evidence before an admin can mark payout paid", () => {
	    const paidUpdate = {
	      status: "paid",
	      externalReference: "bank-transfer-1001",
	      transferredAt: "2026-07-24T10:00:00.000Z",
	      adminNote: "Paid manually from bank cabinet"
	    } as const;

	    expect(adminPayoutStatusUpdateSchema.parse(paidUpdate)).toEqual(paidUpdate);
	    expect(() => adminPayoutStatusUpdateSchema.parse({ status: "paid" })).toThrow();
	    expect(() =>
	      adminPayoutStatusUpdateSchema.parse({ status: "failed", adminNote: "No reference" })
	    ).toThrow();
	  });

  it("exposes admin payout queue summary without provider balance semantics", () => {
    const queue = {
      summary: {
        requestedCount: 2,
        underReviewCount: 1,
        processingCount: 1,
        readyToPayAmount: { amountMinor: 18_900_00, currency: "RUB" },
        processingAmount: { amountMinor: 10_000_00, currency: "RUB" }
      },
      requests: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          astrologerUserId: "22222222-2222-4222-8222-222222222222",
          status: "processing_manual",
          amount: { amountMinor: 10_000_00, currency: "RUB" },
          method: "manual_bank_transfer",
          requestedAt: "2026-07-24T10:00:00.000Z",
          reviewedAt: "2026-07-24T10:05:00.000Z",
          completedAt: null,
          adminUserId: "33333333-3333-4333-8333-333333333333",
          adminNote: "Ready for bank cabinet transfer",
          failureReason: null,
          externalReference: null,
          transferredAt: null,
          providerPayoutId: null
        }
      ]
    } as const;

    expect(adminPayoutQueueResponseSchema.parse(queue)).toEqual(queue);
  });
	});
