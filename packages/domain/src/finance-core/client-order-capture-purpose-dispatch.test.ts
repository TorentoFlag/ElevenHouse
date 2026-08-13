import { describe, expect, expectTypeOf, it } from "vitest";

import {
  FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT,
  ClientOrderCapturePurposeDispatchIntegrityError,
  createClientOrderCapturePurposeDispatchPayload,
  createFinanceClientOrderCaptureDispatchReceipt,
  createFinanceClientSubscriptionCaptureAppliedEvent,
  rehydrateFinanceClientOrderCaptureDispatchReceipt,
  sealFinanceClientOrderSubscriptionCaptureAuthority,
  type FinanceClientOrderCapturePurposeDispatchPayload
} from "./client-order-capture-purpose-dispatch";
import { FINANCE_ECONOMIC_PAYMENT_CAPTURE_APPLIED_EVENT } from "./finance-outbox-events";

const ids = {
  captureReceipt: "11111111-1111-4111-8111-111111111111",
  order: "22222222-2222-4222-8222-222222222222",
  contract: "33333333-3333-4333-8333-333333333333",
  subscription: "44444444-4444-4444-8444-444444444444",
  dispatchReceipt: "55555555-5555-4555-8555-555555555555",
  sourceEvent: "66666666-6666-4666-8666-666666666666",
  period: "77777777-7777-4777-8777-777777777777",
  activated: "88888888-8888-4888-8888-888888888888",
  renewed: "99999999-9999-4999-8999-999999999999",
  entitlement: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  renewalRequest: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
} as const;

const capturedAt = "2026-08-12T10:15:00.000Z";
const dispatchedAt = "2026-08-12T10:15:01.000Z";
const captureDigest = `sha256:${"a".repeat(64)}` as const;
const contractDigest = `sha256:${"b".repeat(64)}` as const;

describe("finance client-order purpose capture event", () => {
  it("is a distinct versioned IDs-only event and cannot carry subscription terms", () => {
    expect(FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT).toBe(
      "finance.client_order.capture_applied.v1"
    );
    expect(FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT).not.toBe(
      FINANCE_ECONOMIC_PAYMENT_CAPTURE_APPLIED_EVENT
    );
    expect(
      createClientOrderCapturePurposeDispatchPayload({
        captureApplicationReceiptId: ids.captureReceipt
      })
    ).toEqual({ captureApplicationReceiptId: ids.captureReceipt });
    expectTypeOf<
      keyof FinanceClientOrderCapturePurposeDispatchPayload
    >().toEqualTypeOf<"captureApplicationReceiptId">();

    for (const input of [
      {},
      { captureApplicationReceiptId: "not-a-uuid" },
      { captureApplicationReceiptId: ids.captureReceipt, subscriptionId: ids.subscription },
      { captureApplicationReceiptId: ids.captureReceipt, priceMinor: 4_900 }
    ]) {
      expect(() => createClientOrderCapturePurposeDispatchPayload(input)).toThrow(
        ClientOrderCapturePurposeDispatchIntegrityError
      );
    }
  });
});

describe("finance client-order capture purpose dispatch receipt", () => {
  it("seals initial subscription authority and stores every downstream identity once", () => {
    const authority = initialAuthority();
    const receipt = createFinanceClientOrderCaptureDispatchReceipt({
      authority,
      dispatchReceiptId: ids.dispatchReceipt,
      sourceEventId: ids.sourceEvent,
      target: {
        kind: "initial",
        periodId: ids.period,
        activatedEventId: ids.activated,
        entitlementChangedEventId: ids.entitlement
      },
      dispatchedAt
    });

    expect(receipt).toMatchObject({
      kind: "finance_client_order_capture_dispatch_receipt",
      schemaVersion: 1,
      dispatchReceiptId: ids.dispatchReceipt,
      authority: {
        kind: "client_subscription_capture_authority",
        schemaVersion: 1,
        captureKind: "initial",
        captureApplicationReceiptId: ids.captureReceipt,
        captureApplicationDigest: captureDigest,
        orderId: ids.order,
        contractId: ids.contract,
        contractCanonicalDigest: contractDigest,
        subscriptionId: ids.subscription,
        subscriptionExpectedVersion: 1,
        capturedAt
      },
      sourceEventId: ids.sourceEvent,
      sourceEventDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      target: {
        kind: "initial",
        periodId: ids.period,
        activatedEventId: ids.activated,
        entitlementChangedEventId: ids.entitlement
      },
      dispatchedAt,
      canonicalDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.authority)).toBe(true);
    expect(Object.isFrozen(receipt.target)).toBe(true);

    const event = createFinanceClientSubscriptionCaptureAppliedEvent(receipt);
    expect(event).toEqual({
      eventId: ids.sourceEvent,
      eventType: "client_subscription.capture_applied.v1",
      schemaVersion: 1,
      occurredAt: capturedAt,
      data: {
        subscriptionId: ids.subscription,
        contractId: ids.contract,
        periodId: ids.period,
        financeEvidenceId: ids.captureReceipt
      }
    });
    expect(Object.keys(event.data).sort()).toEqual([
      "contractId",
      "financeEvidenceId",
      "periodId",
      "subscriptionId"
    ]);
  });

  it("keeps renewal authority closed and binds capture to the requested intended period", () => {
    const receipt = createFinanceClientOrderCaptureDispatchReceipt({
      authority: renewalAuthority(),
      dispatchReceiptId: ids.dispatchReceipt,
      sourceEventId: ids.sourceEvent,
      target: {
        kind: "renewal",
        renewalRequestId: ids.renewalRequest,
        intendedPeriodId: ids.period,
        periodId: ids.period,
        periodRenewedEventId: ids.renewed,
        entitlementChangedEventId: ids.entitlement
      },
      dispatchedAt
    });

    expect(receipt.target).toEqual({
      kind: "renewal",
      renewalRequestId: ids.renewalRequest,
      intendedPeriodId: ids.period,
      periodId: ids.period,
      periodRenewedEventId: ids.renewed,
      entitlementChangedEventId: ids.entitlement
    });
    expect(createFinanceClientSubscriptionCaptureAppliedEvent(receipt).data.periodId).toBe(
      ids.period
    );

    expect(() =>
      createFinanceClientOrderCaptureDispatchReceipt({
        authority: renewalAuthority(),
        dispatchReceiptId: ids.dispatchReceipt,
        sourceEventId: ids.sourceEvent,
        target: {
          kind: "renewal",
          renewalRequestId: ids.renewalRequest,
          intendedPeriodId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          periodId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          periodRenewedEventId: ids.renewed,
          entitlementChangedEventId: ids.entitlement
        },
        dispatchedAt
      })
    ).toThrow(ClientOrderCapturePurposeDispatchIntegrityError);
  });

  it("rehydrates exact immutable evidence and rejects forged or expanded receipts", () => {
    const receipt = createFinanceClientOrderCaptureDispatchReceipt({
      authority: initialAuthority(),
      dispatchReceiptId: ids.dispatchReceipt,
      sourceEventId: ids.sourceEvent,
      target: {
        kind: "initial",
        periodId: ids.period,
        activatedEventId: ids.activated,
        entitlementChangedEventId: ids.entitlement
      },
      dispatchedAt
    });

    expect(rehydrateFinanceClientOrderCaptureDispatchReceipt(structuredClone(receipt))).toEqual(
      receipt
    );
    for (const forged of [
      { ...receipt, canonicalDigest: `sha256:${"f".repeat(64)}` },
      {
        ...receipt,
        authority: { ...receipt.authority, contractCanonicalDigest: `sha256:${"e".repeat(64)}` }
      },
      { ...receipt, amountMinor: 4_900 },
      {
        ...receipt,
        target: { ...receipt.target, activatedEventId: ids.sourceEvent }
      }
    ]) {
      expect(() => rehydrateFinanceClientOrderCaptureDispatchReceipt(forged)).toThrow(
        ClientOrderCapturePurposeDispatchIntegrityError
      );
    }
  });
});

function initialAuthority() {
  return sealFinanceClientOrderSubscriptionCaptureAuthority({
    captureKind: "initial",
    captureApplicationReceiptId: ids.captureReceipt,
    captureApplicationDigest: captureDigest,
    orderId: ids.order,
    contractId: ids.contract,
    contractCanonicalDigest: contractDigest,
    subscriptionId: ids.subscription,
    subscriptionExpectedVersion: 1,
    capturedAt
  });
}

function renewalAuthority() {
  return sealFinanceClientOrderSubscriptionCaptureAuthority({
    captureKind: "renewal",
    captureApplicationReceiptId: ids.captureReceipt,
    captureApplicationDigest: captureDigest,
    orderId: ids.order,
    contractId: ids.contract,
    contractCanonicalDigest: contractDigest,
    subscriptionId: ids.subscription,
    subscriptionExpectedVersion: 3,
    capturedAt,
    renewalRequestId: ids.renewalRequest,
    intendedPeriodId: ids.period
  });
}
