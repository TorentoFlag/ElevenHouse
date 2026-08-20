import { describe, expect, it } from "vitest";

import { createDrizzleClientOrderHostedCheckoutCaptureReconciliationReader } from "./drizzle-client-order-hosted-checkout-capture-reconciliation-reader";

describe("Drizzle client-order hosted checkout capture reconciliation reader", () => {
  it("uses the committed checkout authorization column that exists in production schema", () => {
    const source = createDrizzleClientOrderHostedCheckoutCaptureReconciliationReader.toString();

    expect(source).toContain("checkout_authorization.committed_at");
    expect(source).not.toContain("checkout_authorization.authorized_at");
  });
});
