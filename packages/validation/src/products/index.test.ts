import { describe, expect, it } from "vitest";
import {
  collectProductCreateInvariantIssues,
  collectProductModifierInvariantIssues,
  collectProductUpdateInvariantIssues,
  astroDiaryClientResponseWindowCalendarDaysBounds,
  astroDiaryReflectionCyclesPerPeriodBounds,
  astroDiaryResponseSlaWorkingDaysBounds,
  productPaymentModelValues,
  productStatusValues,
  productTemplateLocaleValues,
  productTemplateStatusValues
} from "./index";

describe("product validation taxonomy", () => {
  it("exports product taxonomy values as stable readonly tuples", () => {
    expect(productStatusValues).toEqual(["draft", "active", "archived"]);
    expect(productPaymentModelValues).toEqual(["once", "pack", "sub", "free"]);
    expect(productTemplateStatusValues).toEqual(["active", "archived"]);
    expect(productTemplateLocaleValues).toEqual(["ru", "en"]);
    expect(astroDiaryReflectionCyclesPerPeriodBounds).toEqual({ min: 1, max: 366 });
    expect(astroDiaryResponseSlaWorkingDaysBounds).toEqual({ min: 1, max: 30 });
    expect(astroDiaryClientResponseWindowCalendarDaysBounds).toEqual({ min: 1, max: 90 });
  });
});

describe("product invariant validation", () => {
  it("collects create-time payment and participant issues", () => {
    expect(
      collectProductCreateInvariantIssues({
        paymentModel: "pack",
        packageSessionCount: null,
        participantMode: "group",
        groupSize: null,
        priceMinor: 100,
        deliveryFormats: ["video"],
        requiredClientData: [],
        methods: [],
        accessGrants: []
      })
    ).toEqual([
      {
        path: ["packageSessionCount"],
        message: "Package products require packageSessionCount"
      },
      {
        path: ["groupSize"],
        message: "Group products require groupSize"
      }
    ]);
  });

  it("collects duplicate enum-array issues for create and update payloads", () => {
    expect(
      collectProductUpdateInvariantIssues({
        deliveryFormats: ["video", "video"],
        methods: ["natal", "natal"]
      })
    ).toEqual([
      {
        path: ["deliveryFormats"],
        message: "Product delivery formats must be unique"
      },
      {
        path: ["methods"],
        message: "Product methods must be unique"
      }
    ]);
  });

  it("collects free-price issues for products and modifiers", () => {
    expect(
      collectProductCreateInvariantIssues({
        paymentModel: "free",
        priceMinor: 1
      })
    ).toEqual([
      {
        path: ["priceMinor"],
        message: "Free products must have zero price"
      }
    ]);

    expect(
      collectProductModifierInvariantIssues({
        kind: "free",
        priceMinor: 1
      })
    ).toEqual([
      {
        path: ["priceMinor"],
        message: "Free modifiers must have zero price"
      }
    ]);
  });

  it("collects type-specific create issues", () => {
    expect(
      collectProductCreateInvariantIssues({
        type: "sub",
        paymentModel: "once",
        subscriptionPeriod: "month",
        priceMinor: 100
      })
    ).toEqual([
      {
        path: ["paymentModel"],
        message: "Subscription products require subscription payment model"
      }
    ]);

    expect(
      collectProductCreateInvariantIssues({
        type: "course",
        paymentModel: "once",
        executionMode: "async",
        accessGrants: []
      })
    ).toEqual([
      {
        path: ["accessGrants"],
        message: "Course products require course access grant"
      }
    ]);
  });

  it("accepts only the fixed AstroDiary product shape with complete configuration", () => {
    expect(
      collectProductCreateInvariantIssues({
        type: "sub",
        paymentModel: "sub",
        executionMode: "async",
        subscriptionPeriod: "month",
        participantMode: "solo",
        deliveryFormats: ["chat", "audio", "file"],
        requiredClientData: [],
        methods: [],
        accessGrants: ["journal"],
        modifiers: [],
        astroDiaryConfig: {
          reflectionCyclesPerPeriod: 12,
          responseSlaWorkingDays: 2,
          clientResponseWindowCalendarDays: 7,
          workingWeekdays: [1, 2, 3, 4, 5],
          serviceTimezone: "Europe/Moscow"
        }
      })
    ).toEqual([]);

    expect(
      collectProductCreateInvariantIssues({
        type: "sub",
        paymentModel: "sub",
        executionMode: "async",
        subscriptionPeriod: "month",
        participantMode: "solo",
        deliveryFormats: ["file", "chat", "audio"],
        requiredClientData: [],
        methods: [],
        accessGrants: ["journal"],
        modifiers: [],
        astroDiaryConfig: {
          reflectionCyclesPerPeriod: 12,
          responseSlaWorkingDays: 2,
          clientResponseWindowCalendarDays: 7,
          workingWeekdays: [1, 2, 3, 4, 5],
          serviceTimezone: "Europe/Moscow"
        }
      })
    ).toEqual([]);

    expect(
      collectProductCreateInvariantIssues({
        type: "sub",
        paymentModel: "sub",
        executionMode: "async",
        subscriptionPeriod: "month",
        participantMode: "group",
        accessGrants: ["journal"],
        astroDiaryConfig: null
      })
    ).toEqual(
      expect.arrayContaining([
        {
          path: ["participantMode"],
          message: "AstroDiary products require solo participant mode"
        },
        {
          path: ["astroDiaryConfig"],
          message: "AstroDiary products require complete configuration"
        }
      ])
    );
  });

  it.each([
    ["deliveryFormats", { deliveryFormats: ["chat", "file"] }],
    ["requiredClientData", { requiredClientData: ["question"] }],
    ["methods", { methods: ["natal"] }],
    [
      "modifiers",
      {
        modifiers: [
          {
            label: "Extra",
            priceMinor: 100,
            kind: "fixed",
            isEnabled: true,
            createsArtifact: false,
            order: 10
          }
        ]
      }
    ]
  ] as const)("rejects AstroDiary %s outside the fixed contract", (path, patch) => {
    expect(
      collectProductCreateInvariantIssues({
        type: "sub",
        paymentModel: "sub",
        executionMode: "async",
        subscriptionPeriod: "month",
        participantMode: "solo",
        deliveryFormats: ["chat", "audio", "file"],
        requiredClientData: [],
        methods: [],
        accessGrants: ["journal"],
        modifiers: [],
        astroDiaryConfig: {
          reflectionCyclesPerPeriod: 12,
          responseSlaWorkingDays: 2,
          clientResponseWindowCalendarDays: 7,
          workingWeekdays: [1, 2, 3, 4, 5],
          serviceTimezone: "Europe/Moscow"
        },
        ...patch
      })
    ).toContainEqual(expect.objectContaining({ path: [path] }));
  });

  it("rejects AstroDiary configuration without the journal grant", () => {
    expect(
      collectProductCreateInvariantIssues({
        type: "sub",
        paymentModel: "sub",
        executionMode: "async",
        subscriptionPeriod: "month",
        participantMode: "solo",
        accessGrants: ["content"],
        astroDiaryConfig: {
          reflectionCyclesPerPeriod: 12,
          responseSlaWorkingDays: 2,
          clientResponseWindowCalendarDays: 7,
          workingWeekdays: [1, 2, 3, 4, 5],
          serviceTimezone: "Europe/Moscow"
        }
      })
    ).toContainEqual({
      path: ["astroDiaryConfig"],
      message: "Only AstroDiary products may define AstroDiary configuration"
    });
  });

  it("collects AstroDiary configuration bounds, weekday and timezone issues", () => {
    expect(
      collectProductCreateInvariantIssues({
        type: "sub",
        paymentModel: "sub",
        executionMode: "async",
        subscriptionPeriod: "month",
        participantMode: "solo",
        accessGrants: ["journal"],
        astroDiaryConfig: {
          reflectionCyclesPerPeriod: 367,
          responseSlaWorkingDays: 31,
          clientResponseWindowCalendarDays: 91,
          workingWeekdays: [1, 1, 8],
          serviceTimezone: "Mars/Olympus"
        }
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["astroDiaryConfig", "reflectionCyclesPerPeriod"] }),
        expect.objectContaining({ path: ["astroDiaryConfig", "responseSlaWorkingDays"] }),
        expect.objectContaining({
          path: ["astroDiaryConfig", "clientResponseWindowCalendarDays"]
        }),
        expect.objectContaining({ path: ["astroDiaryConfig", "workingWeekdays"] }),
        expect.objectContaining({ path: ["astroDiaryConfig", "serviceTimezone"] })
      ])
    );
  });

  it("collects out-of-range percent modifier issues", () => {
    expect(
      collectProductModifierInvariantIssues({
        kind: "percent",
        priceMinor: 101
      })
    ).toEqual([
      {
        path: ["priceMinor"],
        message: "Percent modifiers must be from 0 to 100"
      }
    ]);
  });
});
