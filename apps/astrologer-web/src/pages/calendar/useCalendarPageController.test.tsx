import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../common/http/HttpError";
import {
  calendarPageStateReducer,
  createInitialCalendarPageState,
  executeManualBookingCreate
} from "./useCalendarPageController";

describe("calendar page controller state", () => {
  it("owns view, range, selection, availability and dialog state outside JSX", () => {
    let state = createInitialCalendarPageState({ today: "2026-05-29" });
    state = calendarPageStateReducer(state, { type: "set_view", view: "month" });
    state = calendarPageStateReducer(state, { type: "navigate", direction: "next" });
    state = calendarPageStateReducer(state, { type: "select_entry", entryId: "booking-1" });
    state = calendarPageStateReducer(state, { type: "set_availability_mode", enabled: true });
    state = calendarPageStateReducer(state, { type: "open_dialog", dialog: "manual_booking" });

    expect(state).toMatchObject({
      view: "month",
      anchorDate: "2026-06-29",
      selectedEntryId: "booking-1",
      isAvailabilityMode: true,
      dialog: "manual_booking",
      isSummaryPanelOpen: true
    });
  });

  it("closes stale booking details when the visible range changes", () => {
    const initial = {
      ...createInitialCalendarPageState({ today: "2026-05-29" }),
      dialog: "booking_detail" as const,
      selectedEntryId: "booking-1"
    };
    const next = calendarPageStateReducer(initial, { type: "navigate", direction: "previous" });

    expect(next.anchorDate).toBe("2026-05-22");
    expect(next.isSummaryPanelOpen).toBe(true);
    expect(next.dialog).toBeNull();
    expect(next.selectedEntryId).toBeNull();
  });

  it("closes stale booking details before entering availability mode", () => {
    const initial = {
      ...createInitialCalendarPageState({ today: "2026-05-29" }),
      dialog: "booking_detail" as const,
      selectedEntryId: "booking-1"
    };

    expect(
      calendarPageStateReducer(initial, { type: "set_availability_mode", enabled: true })
    ).toMatchObject({
      dialog: null,
      selectedEntryId: null,
      isAvailabilityMode: true
    });
  });
});

describe("manual booking conflict recovery", () => {
  const input = {
    body: {
      clientUserId: "00000000-0000-4000-8000-000000000001",
      productId: "00000000-0000-4000-8000-000000000002",
      deliveryFormat: "video" as const,
      projectedStartAt: "2026-05-29T09:00:00.000Z"
    },
    idempotencyKey: "manual-booking-0001"
  };

  it("invalidates the visible range and preserves the dialog on stale-slot conflict", async () => {
    const invalidateCalendar = vi.fn(async () => undefined);
    const onConflict = vi.fn();

    await expect(
      executeManualBookingCreate({
        mutate: vi.fn(async () => {
          throw new HttpError(409, { code: "slot_no_longer_available" });
        }),
        input,
        invalidateCalendar,
        onConflict
      })
    ).resolves.toBe("conflict");
    expect(invalidateCalendar).toHaveBeenCalledOnce();
    expect(onConflict).toHaveBeenCalledOnce();
  });

  it("does not translate unrelated failures into stale-slot conflicts", async () => {
    const error = new HttpError(422, { code: "client_relationship_not_active" });

    await expect(
      executeManualBookingCreate({
        mutate: vi.fn(async () => {
          throw error;
        }),
        input,
        invalidateCalendar: vi.fn(),
        onConflict: vi.fn()
      })
    ).rejects.toBe(error);
  });
});
