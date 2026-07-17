import { describe, expect, it } from "vitest";
import {
  isCurrentManualBookingSlotResponse,
  resolveManualBookingStart
} from "./manualBookingPrefill";

describe("resolveManualBookingStart", () => {
  it("keeps an explicitly selected server start", () => {
    expect(
      resolveManualBookingStart({
        availableStarts: ["2026-07-20T05:00:00Z", "2026-07-20T05:30:00Z"],
        selectedStartAt: "2026-07-20T05:30:00Z",
        preferredStartAt: "2026-07-20T08:00:00+03:00"
      })
    ).toBe("2026-07-20T05:30:00Z");
  });

  it("matches the clicked hour start by instant across ISO offsets", () => {
    expect(
      resolveManualBookingStart({
        availableStarts: ["2026-07-20T05:00:00Z"],
        selectedStartAt: "",
        preferredStartAt: "2026-07-20T08:00:00+03:00"
      })
    ).toBe("2026-07-20T05:00:00Z");
  });

  it("chooses the earliest valid server start inside the clicked hour", () => {
    expect(
      resolveManualBookingStart({
        availableStarts: [
          "2026-07-20T05:30:00Z",
          "2026-07-20T05:15:00Z",
          "2026-07-20T06:00:00Z"
        ],
        selectedStartAt: "",
        preferredStartAt: "2026-07-20T08:00:00+03:00"
      })
    ).toBe("2026-07-20T05:15:00Z");
  });

  it("keeps the selection empty when the clicked hour has no server start", () => {
    expect(
      resolveManualBookingStart({
        availableStarts: ["2026-07-20T06:00:00Z"],
        selectedStartAt: "",
        preferredStartAt: "2026-07-20T08:00:00+03:00"
      })
    ).toBe("");
  });

  it("defaults to the first server start when the form was not opened from the grid", () => {
    expect(
      resolveManualBookingStart({
        availableStarts: ["2026-07-20T05:30:00Z", "2026-07-20T06:00:00Z"],
        selectedStartAt: "",
        preferredStartAt: null
      })
    ).toBe("2026-07-20T05:30:00Z");
  });

  it("rejects placeholder slots retained from the previously selected product", () => {
    expect(
      isCurrentManualBookingSlotResponse({
        selectedProductId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        responseProductId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        isPlaceholderData: true
      })
    ).toBe(false);
    expect(
      isCurrentManualBookingSlotResponse({
        selectedProductId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        responseProductId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        isPlaceholderData: true
      })
    ).toBe(false);
    expect(
      isCurrentManualBookingSlotResponse({
        selectedProductId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        responseProductId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        isPlaceholderData: false
      })
    ).toBe(true);
  });
});
