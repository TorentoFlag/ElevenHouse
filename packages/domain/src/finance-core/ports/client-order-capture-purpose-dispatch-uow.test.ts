import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createFinanceClientOrderCaptureDispatchReceipt,
  createFinanceClientSubscriptionCaptureAppliedEvent,
  sealFinanceClientOrderSubscriptionCaptureAuthority,
  type FinanceClientOrderCaptureDispatchReceipt
} from "../client-order-capture-purpose-dispatch";
import {
  dispatchFinanceClientOrderCapturePurposeEvent,
  type FinanceClientOrderCapturePurposeDispatchExecution,
  type FinanceClientOrderCapturePurposeDispatchUnitOfWork
} from "./client-order-capture-purpose-dispatch-uow";

describe("FinanceClientOrderCapturePurposeDispatchUnitOfWork boundary", () => {
  it("accepts only the capture receipt ID and preserves an exact replayed receipt", async () => {
    const unitOfWork = new MemoryDispatchUnitOfWork(dispatchReceipt());
    const input = {
      captureApplicationReceiptId: "11111111-1111-4111-8111-111111111111"
    };

    const first = await dispatchFinanceClientOrderCapturePurposeEvent(unitOfWork, input);
    expect(first).toMatchObject({
      outcome: "dispatched",
      receipt: { dispatchReceiptId: "55555555-5555-4555-8555-555555555555" },
      sourceEvent: { eventType: "client_subscription.capture_applied.v1" }
    });
    expect(await dispatchFinanceClientOrderCapturePurposeEvent(unitOfWork, input)).toEqual({
      outcome: "replayed",
      receipt: first.outcome === "dispatched" ? first.receipt : undefined,
      sourceEvent: first.outcome === "dispatched" ? first.sourceEvent : undefined
    });

    await expect(
      dispatchFinanceClientOrderCapturePurposeEvent(unitOfWork, {
        ...input,
        subscriptionId: "44444444-4444-4444-8444-444444444444"
      })
    ).rejects.toMatchObject({
      code: "FINANCE_CLIENT_ORDER_CAPTURE_PURPOSE_DISPATCH_INTEGRITY_ERROR"
    });
  });

  it("keeps ordinary client orders explicit and exposes typed conflict outcomes", () => {
    expectTypeOf<FinanceClientOrderCapturePurposeDispatchExecution["outcome"]>().toEqualTypeOf<
      | "dispatched"
      | "replayed"
      | "capture_not_found"
      | "not_client_subscription"
      | "authority_conflict"
      | "source_event_conflict"
      | "evidence_conflict"
    >();
  });
});

class MemoryDispatchUnitOfWork implements FinanceClientOrderCapturePurposeDispatchUnitOfWork {
  private prior: FinanceClientOrderCapturePurposeDispatchExecution | null = null;

  constructor(private readonly receipt: FinanceClientOrderCaptureDispatchReceipt) {}

  async rehydrateAndDispatchClientOrderCapture(): Promise<FinanceClientOrderCapturePurposeDispatchExecution> {
    if (this.prior?.outcome === "dispatched") {
      return {
        outcome: "replayed",
        receipt: this.prior.receipt,
        sourceEvent: this.prior.sourceEvent
      };
    }
    const result = {
      outcome: "dispatched" as const,
      receipt: this.receipt,
      sourceEvent: createFinanceClientSubscriptionCaptureAppliedEvent(this.receipt)
    };
    this.prior = result;
    return result;
  }
}

function dispatchReceipt(): FinanceClientOrderCaptureDispatchReceipt {
  return createFinanceClientOrderCaptureDispatchReceipt({
    authority: sealFinanceClientOrderSubscriptionCaptureAuthority({
      captureKind: "initial",
      captureApplicationReceiptId: "11111111-1111-4111-8111-111111111111",
      captureApplicationDigest: `sha256:${"a".repeat(64)}`,
      orderId: "22222222-2222-4222-8222-222222222222",
      contractId: "33333333-3333-4333-8333-333333333333",
      contractCanonicalDigest: `sha256:${"b".repeat(64)}`,
      subscriptionId: "44444444-4444-4444-8444-444444444444",
      subscriptionExpectedVersion: 1,
      capturedAt: "2026-08-12T10:15:00.000Z"
    }),
    dispatchReceiptId: "55555555-5555-4555-8555-555555555555",
    sourceEventId: "66666666-6666-4666-8666-666666666666",
    target: {
      kind: "initial",
      periodId: "77777777-7777-4777-8777-777777777777",
      activatedEventId: "88888888-8888-4888-8888-888888888888",
      entitlementChangedEventId: "99999999-9999-4999-8999-999999999999"
    },
    dispatchedAt: "2026-08-12T10:15:01.000Z"
  });
}
