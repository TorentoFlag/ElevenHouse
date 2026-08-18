import { describe, expect, it } from "vitest";

import {
  clientSubscriptionEventTypeSchema,
  clientSubscriptionResponseSchema,
  clientSubscriptionStateSchema
} from "./client-subscriptions";

describe("client subscription paid-period contract", () => {
  it("does not expose recurring renewal lifecycle states or events", () => {
    expect(clientSubscriptionStateSchema.safeParse("cancel_at_period_end").success).toBe(false);
    expect(
      clientSubscriptionEventTypeSchema.safeParse("client_subscription.renewal_charge_requested.v1")
        .success
    ).toBe(false);
    expect(
      clientSubscriptionEventTypeSchema.safeParse("client_subscription.period_renewed.v1").success
    ).toBe(false);
    expect(
      clientSubscriptionEventTypeSchema.safeParse("client_subscription.renewal_failed.v1").success
    ).toBe(false);
  });

  it("does not expose an open renewal request in subscription responses", () => {
    expect("renewalRequest" in clientSubscriptionResponseSchema.shape).toBe(false);
  });
});
