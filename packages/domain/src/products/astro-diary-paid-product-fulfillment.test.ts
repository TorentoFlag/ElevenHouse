import { describe, expect, it, vi } from "vitest";

import { resolvePaidProductFulfillment } from "./paid-product-fulfillment-registry";

const exactAstroDiaryProduct = Object.freeze({
  type: "sub",
  paymentModel: "sub",
  executionMode: "async",
  participantMode: "solo",
  subscriptionPeriod: "month",
  trialDays: null,
  durationMinutes: null,
  packageSessionCount: null,
  groupSize: null,
  deliveryFormats: ["chat", "audio", "file"],
  requiredClientData: [],
  methods: [],
  accessGrants: ["journal"],
  modifiers: [],
  astroDiaryConfig: {
    reflectionCyclesPerPeriod: 4,
    responseSlaWorkingDays: 2,
    clientResponseWindowCalendarDays: 5,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow"
  }
} as const);

describe("AstroDiary paid-product fulfillment", () => {
  it("registers the exact sealed AstroDiary subscription shape under its native key", async () => {
    const getDependencyStatus = vi.fn().mockResolvedValue("registered");

    await expect(
      resolvePaidProductFulfillment({
        product: exactAstroDiaryProduct,
        reader: { getDependencyStatus }
      })
    ).resolves.toMatchObject({
      supported: true,
      registryKey: "sub.sub.async.solo",
      registryRevision: 1
    });
    expect(getDependencyStatus).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: "journal grant", patch: { accessGrants: [] } },
    { name: "Diary configuration", patch: { astroDiaryConfig: null } }
  ])("rejects a subscription without its exact $name", async ({ patch }) => {
    const getDependencyStatus = vi.fn().mockResolvedValue("registered");

    await expect(
      resolvePaidProductFulfillment({
        product: { ...exactAstroDiaryProduct, ...patch },
        reader: { getDependencyStatus }
      })
    ).resolves.toEqual({
      supported: false,
      code: "client_subscription_fulfillment_unsupported"
    });
    expect(getDependencyStatus).not.toHaveBeenCalled();
  });
});
