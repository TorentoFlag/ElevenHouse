import { describe, expect, it } from "vitest";

import { clientSubscriptionCaptureDispatchIntegritySql } from "./client-subscription-capture-dispatch.schema";

describe("client subscription capture dispatch schema", () => {
  it("does not define recurring renewal dispatch authority", () => {
    expect(clientSubscriptionCaptureDispatchIntegritySql).not.toContain("capture_kind = 'renewal'");
    expect(clientSubscriptionCaptureDispatchIntegritySql).not.toContain(
      "client_subscription_renewal_requests"
    );
    expect(clientSubscriptionCaptureDispatchIntegritySql).not.toContain(
      "client_subscription.period_renewed.v1"
    );
  });
});
