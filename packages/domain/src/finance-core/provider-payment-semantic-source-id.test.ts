import { describe, expect, it } from "vitest";

import { createCapturedProviderPaymentSemanticSourceId } from "./provider-payment-semantic-source-id";

describe("captured provider payment semantic source id", () => {
  it("is stable per payment, differs between payments and fits the persisted source-id boundary", () => {
    const first = createCapturedProviderPaymentSemanticSourceId("arc-payment-1");
    expect(first).toBe(createCapturedProviderPaymentSemanticSourceId("arc-payment-1"));
    expect(first).not.toBe(createCapturedProviderPaymentSemanticSourceId("arc-payment-2"));
    expect(first).toMatch(/^captured:sha256:[a-f0-9]{64}$/);
    expect(first.length).toBeLessThanOrEqual(160);
  });
});
