import { describe, expect, it } from "vitest";
import { createDefaultProductDraft, type ProductFormDraft } from "./productDraft";
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

  it("normalizes any journal selection into the fixed AstroDiary product shape", () => {
    const normalized = normalizeProductDraftForType({
      ...createDefaultProductDraft("custom"),
      paymentModel: "once",
      executionMode: "live",
      participantMode: "group",
      groupSize: 10,
      trialDays: 5,
      durationMinutes: 60,
      durationLabel: "60 мин",
      slaLabel: "3 дня",
      packageSessionCount: 3,
      packageDiscountPercent: 15,
      accessGrants: ["content", "journal"]
    });

    expect(normalized).toMatchObject({
      type: "sub",
      paymentModel: "sub",
      executionMode: "async",
      participantMode: "solo",
      deliveryFormats: ["chat", "audio", "file"],
      requiredClientData: [],
      methods: [],
      accessGrants: ["journal"],
      modifiers: [],
      durationMinutes: null,
      durationLabel: "",
      slaLabel: "",
      packageSessionCount: null,
      packageDiscountPercent: null,
      trialDays: null,
      groupSize: null,
      astroDiaryConfig: {
        reflectionCyclesPerPeriod: 4,
        responseSlaWorkingDays: 2,
        clientResponseWindowCalendarDays: 7,
        workingWeekdays: [1, 2, 3, 4, 5],
        serviceTimezone: "UTC"
      }
    });
  });

  it("removes AstroDiary configuration when journal access is absent without changing generic subscription defaults", () => {
    const genericSubscription: ProductFormDraft = {
      ...createDefaultProductDraft("sub"),
      astroDiaryConfig: {
        reflectionCyclesPerPeriod: 4,
        responseSlaWorkingDays: 2,
        clientResponseWindowCalendarDays: 7,
        workingWeekdays: [1, 2, 3, 4, 5],
        serviceTimezone: "UTC"
      }
    };

    expect(normalizeProductDraftForType(genericSubscription)).toMatchObject({
      type: "sub",
      accessGrants: ["channel"],
      trialDays: 0,
      astroDiaryConfig: null
    });
  });
});
