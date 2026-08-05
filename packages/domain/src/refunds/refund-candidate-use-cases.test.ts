import { describe, expect, it, vi } from "vitest";

import {
  RefundCandidateOrderUnavailableError,
  submitClientRefundCandidate,
  type ClientRefundCandidate,
  type FinanceOrder,
  type FinanceOrderStore,
  type RefundCandidateStore
} from "../index";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const differentClientUserId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const candidateId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-08-05T10:00:00.000Z");

describe("submitClientRefundCandidate", () => {
  it("creates a non-monetary, idempotent review candidate for the caller's paid order", async () => {
    const harness = createHarness();

    await expect(
      submitClientRefundCandidate({
        orderStore: harness.orderStore,
        candidateStore: harness.candidateStore,
        clientUserId,
        orderId,
        statement: "I did not receive the promised consultation",
        idempotencyKey: "dispute:client:request-1",
        now,
        idGenerator: () => candidateId
      })
    ).resolves.toMatchObject({
      id: candidateId,
      orderId,
      clientUserId,
      status: "submitted",
      version: 1
    });

    expect(harness.candidateStore.executeSubmitCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: `refund-candidates.submit:${clientUserId}`,
        idempotencyKey: "dispute:client:request-1",
        actorUserId: clientUserId,
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        now: now.toISOString()
      }),
      expect.any(Function)
    );
    expect(harness.created[0]).toMatchObject({
      id: candidateId,
      statement: "I did not receive the promised consultation"
    });
  });

  it("does not disclose a missing or foreign order through the dispute command", async () => {
    const foreign = createHarness({ order: paidOrder(differentClientUserId) });
    const missing = createHarness({ order: null });

    for (const harness of [foreign, missing]) {
      await expect(
        submitClientRefundCandidate({
          orderStore: harness.orderStore,
          candidateStore: harness.candidateStore,
          clientUserId,
          orderId,
          statement: "Please review this order",
          idempotencyKey: "dispute:client:foreign",
          now
        })
      ).rejects.toBeInstanceOf(RefundCandidateOrderUnavailableError);
      expect(harness.created).toHaveLength(0);
    }
  });

  it("does not create a candidate for an order that has not reached a refundable state", async () => {
    const harness = createHarness({ order: { ...paidOrder(clientUserId), status: "pending_payment" } });

    await expect(
      submitClientRefundCandidate({
        orderStore: harness.orderStore,
        candidateStore: harness.candidateStore,
        clientUserId,
        orderId,
        statement: "Please review this order",
        idempotencyKey: "dispute:client:pending",
        now
      })
    ).rejects.toMatchObject({ code: "refund_candidate_invalid", reason: "order_not_eligible" });
    expect(harness.created).toHaveLength(0);
  });
});

function createHarness(options: { readonly order?: FinanceOrder | null } = {}) {
  const created: ClientRefundCandidate[] = [];
  const orderStore: Pick<FinanceOrderStore, "findById"> = {
    findById: vi.fn().mockResolvedValue(options.order === undefined ? paidOrder(clientUserId) : options.order)
  };
  const candidateStore: Pick<RefundCandidateStore, "executeSubmitCandidate"> = {
    executeSubmitCandidate: vi.fn(async (_command, create) => {
      const candidate = await create();
      created.push(candidate);
      return { kind: "created" as const, value: candidate };
    })
  };
  return { orderStore, candidateStore, created };
}

function paidOrder(ownerUserId: string): FinanceOrder {
  return {
    id: orderId,
    clientUserId: ownerUserId,
    astrologerUserId: "55555555-5555-4555-8555-555555555555",
    productId: "66666666-6666-4666-8666-666666666666",
    productTitleSnapshot: "Natal consultation",
    directLinkIntentId: null,
    bookingId: null,
    status: "paid",
    grossAmount: { amountMinor: 10_000, currency: "RUB" },
    platformFee: { amountMinor: 800, currency: "RUB" },
    astrologerNetAmount: { amountMinor: 9_200, currency: "RUB" },
    financePolicySnapshotId: "77777777-7777-4777-8777-777777777777",
    financePolicyRiskTier: "standard",
    financePolicyHoldDurationHours: 48,
    financePolicyReserveBps: 0,
    financePolicyReserveReleaseDelayDays: 0,
    tariffSeriesId: "pro",
    tariffVersion: 1,
    tariffVersionDigest: `sha256:${"a".repeat(64)}`,
    tariffCommissionBps: 800,
    financePolicyProviderSettlementRequired: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}
