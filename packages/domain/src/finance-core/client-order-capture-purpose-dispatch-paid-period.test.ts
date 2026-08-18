import { describe, expect, it } from "vitest";

import {
  ClientOrderCapturePurposeDispatchIntegrityError,
  sealFinanceClientOrderSubscriptionCaptureAuthority
} from "./client-order-capture-purpose-dispatch";

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const digest = `sha256:${"a".repeat(64)}`;

describe("client order capture purpose dispatch paid-period authority", () => {
  it("rejects recurring renewal capture authority", () => {
    expect(() =>
      sealFinanceClientOrderSubscriptionCaptureAuthority({
        captureKind: "renewal",
        captureApplicationReceiptId: uuid("1"),
        captureApplicationDigest: digest,
        orderId: uuid("2"),
        contractId: uuid("3"),
        contractCanonicalDigest: digest,
        subscriptionId: uuid("4"),
        subscriptionExpectedVersion: 2,
        capturedAt: "2026-08-18T10:00:00Z",
        renewalRequestId: uuid("5"),
        intendedPeriodId: uuid("6")
      })
    ).toThrow(ClientOrderCapturePurposeDispatchIntegrityError);
  });
});
