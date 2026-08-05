import { describe, expect, it } from "vitest";
import { devCalendarSeedPlan } from "./seed-dev-calendar";

describe("dev calendar seed plan", () => {
  it("keeps enough varied deterministic data for the local calendar", () => {
    expect(devCalendarSeedPlan.products).toHaveLength(4);
    expect(devCalendarSeedPlan.bookings.length).toBeGreaterThanOrEqual(10);
    expect(devCalendarSeedPlan.manualBlocks.length).toBeGreaterThanOrEqual(3);

    expect(new Set(devCalendarSeedPlan.products.map((product) => product.deliveryFormat))).toEqual(
      new Set(["video", "audio", "chat", "file"])
    );
    expect(new Set(devCalendarSeedPlan.bookings.map((booking) => booking.clientUserId)).size).toBeGreaterThanOrEqual(
      6
    );

    const ids = [
      devCalendarSeedPlan.ownerUserId,
      ...devCalendarSeedPlan.clients.map((client) => client.userId),
      ...devCalendarSeedPlan.products.map((product) => product.id),
      ...devCalendarSeedPlan.bookings.flatMap((booking) => [booking.id, booking.reservationId]),
      ...devCalendarSeedPlan.manualBlocks.flatMap((block) => [block.id, block.reservationId])
    ];
    expect(new Set(ids)).toHaveLength(ids.length);
  });
});
