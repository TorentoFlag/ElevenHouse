import { describe, expect, it } from "vitest";
import type { PutDefaultAvailabilityScheduleRequest } from "@elevenhouse/contracts";
import { createAvailabilityScheduleCommand } from "./availabilityEditorForm";

describe("createAvailabilityScheduleCommand", () => {
  it("drops schedule product ids that are no longer selectable active products", () => {
    const form: PutDefaultAvailabilityScheduleRequest = {
      expectedVersion: 59,
      timeZone: "Europe/Moscow",
      startIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 360,
      bookingHorizonDays: 60,
      maximumBookingsPerDay: 5,
      weeklyPeriods: [],
      dateOverrides: [],
      productIds: [
        "f505ea3e-2dde-43ff-ae79-df9d9483c1e1",
        "cce63dea-4cbe-40d8-a0d5-c2f17ebd3a65",
        "d2fe9d9b-4f0f-42c6-b62a-b976ceb1a2c4",
        "3dc7786a-058c-473d-ac4e-65f8cbc204d5",
        "9eeb13ac-ca81-4a26-9a3d-d3627ab226ba"
      ]
    };

    expect(
      createAvailabilityScheduleCommand(form, {
        selectableProductIds: [
          "f505ea3e-2dde-43ff-ae79-df9d9483c1e1",
          "cce63dea-4cbe-40d8-a0d5-c2f17ebd3a65",
          "d2fe9d9b-4f0f-42c6-b62a-b976ceb1a2c4"
        ]
      }).productIds
    ).toEqual([
      "f505ea3e-2dde-43ff-ae79-df9d9483c1e1",
      "cce63dea-4cbe-40d8-a0d5-c2f17ebd3a65",
      "d2fe9d9b-4f0f-42c6-b62a-b976ceb1a2c4"
    ]);
  });
});
