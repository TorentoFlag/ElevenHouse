import { describe, expect, it } from "vitest";
import {
  createManualBookingSlotQueryRange,
  createManualBookingCommand,
  getBookableManualBookingProducts,
  groupManualBookingSlotsByDate,
  toManualBookingSlotOptions
} from "./manualBookingForm";

const productId = "33333333-3333-4333-8333-333333333333";

describe("manualBookingForm", () => {
  it("keeps only assigned active live solo products with a duration", () => {
    const products = [
      product({ id: productId }),
      product({ id: "44444444-4444-4444-8444-444444444444", status: "draft" }),
      product({ id: "55555555-5555-4555-8555-555555555555", executionMode: "async" }),
      product({ id: "66666666-6666-4666-8666-666666666666", participantMode: "group" }),
      product({ id: "77777777-7777-4777-8777-777777777777", durationMinutes: null })
    ];

    expect(getBookableManualBookingProducts(products, { productIds: [productId] })).toEqual([
      products[0]
    ]);
  });

  it("groups exact server slots by local day without inventing new times", () => {
    const options = toManualBookingSlotOptions(
      {
        productId,
        timeZone: "Europe/Moscow",
        slots: [
          { startAt: "2026-07-20T07:00:00Z", endAt: "2026-07-20T08:00:00Z" },
          { startAt: "2026-07-20T07:30:00Z", endAt: "2026-07-20T08:30:00Z" }
        ]
      },
      "ru"
    );

    expect(options).toMatchObject([
      { value: "2026-07-20T07:00:00Z", dateKey: "2026-07-20", timeLabel: "10:00" },
      { value: "2026-07-20T07:30:00Z", dateKey: "2026-07-20", timeLabel: "10:30" }
    ]);
  });

  it("builds the manual booking slot range from the booking horizon, not the visible calendar range", () => {
    expect(
      createManualBookingSlotQueryRange({
        now: "2026-07-22T19:00:00+03:00",
        timeZone: "Europe/Moscow",
        bookingHorizonDays: 90
      })
    ).toEqual({
      start: "2026-07-22T00:00:00+03:00",
      end: "2026-10-20T00:00:00+03:00"
    });

    expect(
      createManualBookingSlotQueryRange({
        now: "2026-07-22T19:00:00+03:00",
        timeZone: "Europe/Moscow",
        bookingHorizonDays: 120
      }).end
    ).toBe("2026-10-23T00:00:00+03:00");
  });

  it("groups slot options into local date sections for the custom picker", () => {
    expect(
      groupManualBookingSlotsByDate([
        {
          value: "2026-07-20T07:00:00Z",
          endAt: "2026-07-20T08:00:00Z",
          dateKey: "2026-07-20",
          dateLabel: "пн, 20 июля",
          timeLabel: "10:00"
        },
        {
          value: "2026-07-20T07:30:00Z",
          endAt: "2026-07-20T08:30:00Z",
          dateKey: "2026-07-20",
          dateLabel: "пн, 20 июля",
          timeLabel: "10:30"
        },
        {
          value: "2026-07-21T08:00:00Z",
          endAt: "2026-07-21T09:00:00Z",
          dateKey: "2026-07-21",
          dateLabel: "вт, 21 июля",
          timeLabel: "11:00"
        }
      ])
    ).toEqual([
      {
        dateKey: "2026-07-20",
        dateLabel: "пн, 20 июля",
        slots: [
          {
            value: "2026-07-20T07:00:00Z",
            endAt: "2026-07-20T08:00:00Z",
            dateKey: "2026-07-20",
            dateLabel: "пн, 20 июля",
            timeLabel: "10:00"
          },
          {
            value: "2026-07-20T07:30:00Z",
            endAt: "2026-07-20T08:30:00Z",
            dateKey: "2026-07-20",
            dateLabel: "пн, 20 июля",
            timeLabel: "10:30"
          }
        ]
      },
      {
        dateKey: "2026-07-21",
        dateLabel: "вт, 21 июля",
        slots: [
          {
            value: "2026-07-21T08:00:00Z",
            endAt: "2026-07-21T09:00:00Z",
            dateKey: "2026-07-21",
            dateLabel: "вт, 21 июля",
            timeLabel: "11:00"
          }
        ]
      }
    ]);
  });

  it("creates the validated command only from a selected server slot", () => {
    expect(
      createManualBookingCommand({
        clientUserId: "11111111-1111-4111-8111-111111111111",
        product: product({ id: productId }),
        deliveryFormat: "video",
        projectedStartAt: "2026-07-20T07:00:00Z",
        availableSlotStarts: ["2026-07-20T07:00:00Z"],
        idempotencyKey: "manual-booking:test-request"
      })
    ).toEqual({
      body: {
        clientUserId: "11111111-1111-4111-8111-111111111111",
        productId,
        deliveryFormat: "video",
        projectedStartAt: "2026-07-20T07:00:00Z"
      },
      idempotencyKey: "manual-booking:test-request"
    });

    expect(() =>
      createManualBookingCommand({
        clientUserId: "11111111-1111-4111-8111-111111111111",
        product: product({ id: productId }),
        deliveryFormat: "video",
        projectedStartAt: "2026-07-20T08:00:00Z",
        availableSlotStarts: ["2026-07-20T07:00:00Z"],
        idempotencyKey: "manual-booking:test-request"
      })
    ).toThrow("available slot");
  });
});

function product(overrides: Record<string, unknown>) {
  return {
    id: productId,
    title: "Натальный разбор",
    status: "active" as const,
    executionMode: "live" as const,
    participantMode: "solo" as const,
    durationMinutes: 60,
    deliveryFormats: ["video"] as const,
    priceMinor: 490000,
    currency: "RUB" as const,
    ...overrides
  };
}
