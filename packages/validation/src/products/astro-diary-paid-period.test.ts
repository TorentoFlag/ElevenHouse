import { describe, expect, it } from "vitest";

import { collectProductCreateInvariantIssues } from "./index";

const astroDiaryConfig = Object.freeze({
  reflectionCyclesPerPeriod: 4,
  responseSlaWorkingDays: 2,
  clientResponseWindowCalendarDays: 7,
  workingWeekdays: [1, 2, 3, 4, 5],
  serviceTimezone: "Europe/Moscow"
});

describe("AstroDiary paid product invariants", () => {
  it("accepts AstroDiary as a one-time async paid-period product", () => {
    expect(
      collectProductCreateInvariantIssues({
        type: "async",
        paymentModel: "once",
        executionMode: "async",
        participantMode: "solo",
        priceMinor: 150_000,
        subscriptionPeriod: "month",
        durationMinutes: null,
        durationLabel: null,
        slaLabel: null,
        packageSessionCount: null,
        packageDiscountPercent: null,
        trialDays: null,
        groupSize: null,
        deliveryFormats: ["chat", "audio", "file"],
        requiredClientData: [],
        methods: [],
        accessGrants: ["journal"],
        modifiers: [],
        astroDiaryConfig
      })
    ).toEqual([]);
  });

  it("rejects the old recurring subscription shape for AstroDiary", () => {
    expect(
      collectProductCreateInvariantIssues({
        type: "sub",
        paymentModel: "sub",
        executionMode: "async",
        participantMode: "solo",
        priceMinor: 150_000,
        subscriptionPeriod: "month",
        durationMinutes: null,
        durationLabel: null,
        slaLabel: null,
        packageSessionCount: null,
        packageDiscountPercent: null,
        trialDays: null,
        groupSize: null,
        deliveryFormats: ["chat", "audio", "file"],
        requiredClientData: [],
        methods: [],
        accessGrants: ["journal"],
        modifiers: [],
        astroDiaryConfig
      })
    ).toEqual(
      expect.arrayContaining([
        { path: ["type"], message: "AstroDiary products require async result type" },
        { path: ["paymentModel"], message: "AstroDiary products require one-time payment model" }
      ])
    );
  });
});
