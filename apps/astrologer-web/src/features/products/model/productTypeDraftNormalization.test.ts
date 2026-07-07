import { describe, expect, it } from "vitest";
import { createDefaultProductDraft } from "./productDraft";
import { normalizeProductDraftForType } from "./productTypeDraftNormalization";

describe("normalizeProductDraftForType", () => {
  it("removes stale subscription settings from a single consultation", () => {
    const draft = {
      ...createDefaultProductDraft("single"),
      paymentModel: "sub" as const,
      subscriptionPeriod: "month" as const,
      trialDays: 7
    };

    const normalized = normalizeProductDraftForType(draft);

    expect(normalized.paymentModel).toBe("once");
    expect(normalized.subscriptionPeriod).toBeNull();
    expect(normalized.trialDays).toBeNull();
  });

  it("keeps package settings for package products", () => {
    const normalized = normalizeProductDraftForType(createDefaultProductDraft("pack"));

    expect(normalized.paymentModel).toBe("pack");
    expect(normalized.packageSessionCount).toBe(3);
    expect(normalized.packageDiscountPercent).toBe(15);
  });

  it("makes course a one-time async access product for this slice", () => {
    const normalized = normalizeProductDraftForType(createDefaultProductDraft("course"));

    expect(normalized.paymentModel).toBe("once");
    expect(normalized.executionMode).toBe("async");
    expect(normalized.accessGrants).toContain("course");
    expect(normalized.packageSessionCount).toBeNull();
  });

  it("does not normalize custom because custom is the full builder", () => {
    const draft = {
      ...createDefaultProductDraft("custom"),
      paymentModel: "sub" as const,
      subscriptionPeriod: "year" as const,
      trialDays: 14
    };

    expect(normalizeProductDraftForType(draft)).toEqual(draft);
  });
});
