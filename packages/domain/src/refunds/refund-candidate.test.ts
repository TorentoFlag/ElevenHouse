import { describe, expect, it } from "vitest";

import { RefundCandidateError, createClientRefundCandidate } from "./refund-candidate";

const order = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  clientUserId: "22222222-2222-4222-8222-222222222222",
  status: "paid" as const
});

describe("client refund candidate", () => {
  it("creates a non-monetary candidate for the owning client without treating it as a refund", () => {
    expect(
      createClientRefundCandidate({
        candidateId: "33333333-3333-4333-8333-333333333333",
        clientUserId: order.clientUserId,
        order,
        statement: "Услуга не была оказана в согласованное время.",
        now: "2026-08-05T12:00:00.000Z"
      })
    ).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
      orderId: order.id,
      clientUserId: order.clientUserId,
      statement: "Услуга не была оказана в согласованное время.",
      status: "submitted",
      version: 1,
      submittedAt: "2026-08-05T12:00:00.000Z",
      resolvedRefundCaseId: null,
      resolvedAt: null,
      updatedAt: "2026-08-05T12:00:00.000Z"
    });
  });

  it.each([
    ["another client", { clientUserId: "44444444-4444-4444-8444-444444444444" }],
    ["uncaptured order", { order: { ...order, status: "pending_payment" as const } }],
    ["empty statement", { statement: "   " }]
  ])("rejects %s before any provider or ledger operation", (_label, override) => {
    expect(() =>
      createClientRefundCandidate({
        candidateId: "33333333-3333-4333-8333-333333333333",
        clientUserId: order.clientUserId,
        order,
        statement: "Нужен возврат.",
        now: "2026-08-05T12:00:00.000Z",
        ...override
      })
    ).toThrow(RefundCandidateError);
  });
});
