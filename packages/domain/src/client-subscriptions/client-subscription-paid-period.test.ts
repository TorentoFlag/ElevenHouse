import { describe, expect, it } from "vitest";

import * as lifecycle from "./client-subscription-lifecycle";
import type { ClientSubscriptionTransitionOutcome } from "./client-subscription-lifecycle";

describe("client subscription paid-period lifecycle", () => {
  it("does not export recurring renewal or cancellation commands", () => {
    expect("requestRenewalCharge" in lifecycle).toBe(false);
    expect("applyRenewalCapture" in lifecycle).toBe(false);
    expect("applyRenewalFailure" in lifecycle).toBe(false);
    expect("scheduleCancellation" in lifecycle).toBe(false);
    expect("revokeCancellation" in lifecycle).toBe(false);
  });

  it("keeps paid boundary ending as the only non-refund terminal path", () => {
    const codes: ClientSubscriptionTransitionOutcome["outcome"][] = [
      "applied",
      "idempotent",
      "rejected"
    ];
    expect(codes).toContain("applied");
  });
});
