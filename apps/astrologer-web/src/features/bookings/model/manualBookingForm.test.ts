import { describe, expect, it } from "vitest";
import {
  createManualBookingCommand,
  getBookableManualBookingProducts,
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
