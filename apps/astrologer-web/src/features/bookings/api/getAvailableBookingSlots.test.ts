import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { getAvailableBookingSlots } from "./getAvailableBookingSlots";

describe("getAvailableBookingSlots", () => {
  afterEach(() => vi.restoreAllMocks());

  it("serializes the validated query and parses the shared response", async () => {
    const response = {
      productId: "33333333-3333-4333-8333-333333333333",
      timeZone: "Europe/Moscow",
      slots: [{ startAt: "2026-07-20T07:00:00Z", endAt: "2026-07-20T08:00:00Z" }]
    };
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response);

    await expect(
      getAvailableBookingSlots({
        productId: response.productId,
        start: "2026-07-20T00:00:00.000Z",
        end: "2026-07-21T00:00:00.000Z"
      })
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith(
      "/bookings/available-slots?productId=33333333-3333-4333-8333-333333333333&start=2026-07-20T00%3A00%3A00.000Z&end=2026-07-21T00%3A00%3A00.000Z"
    );
  });
});
