import { describe, expect, it } from "vitest";
import type { AvailabilitySchedule } from "@elevenhouse/contracts";
import {
  addDateOverride,
  addWeeklyPeriod,
  createAvailabilityEditorForm,
  createAvailabilityScheduleCommand,
  removeDateOverride,
  removeWeeklyPeriod,
  toggleAvailabilityProduct,
  updateDateOverride,
  updateWeeklyPeriod
} from "./availabilityEditorForm";

const schedule: AvailabilitySchedule = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Основное расписание",
  version: 3,
  timeZone: "Europe/Moscow",
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 15,
  minimumNoticeMinutes: 360,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: 5,
  weeklyPeriods: [{ weekday: 1, startMinute: 600, endMinute: 1080 }],
  dateOverrides: [],
  productIds: ["00000000-0000-4000-8000-000000000002"]
};

describe("availability editor form", () => {
  it("preserves server version and values when editing an existing schedule", () => {
    const form = createAvailabilityEditorForm(schedule, "UTC");

    expect(createAvailabilityScheduleCommand(form)).toEqual({
      expectedVersion: 3,
      timeZone: "Europe/Moscow",
      startIntervalMinutes: 30,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 15,
      minimumNoticeMinutes: 360,
      bookingHorizonDays: 60,
      maximumBookingsPerDay: 5,
      weeklyPeriods: [{ weekday: 1, startMinute: 600, endMinute: 1080 }],
      dateOverrides: [],
      productIds: ["00000000-0000-4000-8000-000000000002"]
    });
  });

  it("starts a missing schedule without silently publishing working hours", () => {
    const form = createAvailabilityEditorForm(null, "Europe/Moscow");

    expect(form.expectedVersion).toBeNull();
    expect(form.weeklyPeriods).toEqual([]);
    expect(form.productIds).toEqual([]);
  });

  it("adds, updates and removes multiple periods per weekday immutably", () => {
    const initial = createAvailabilityEditorForm(null, "Europe/Moscow");
    const withFirst = addWeeklyPeriod(initial, 1);
    const withSecond = addWeeklyPeriod(withFirst, 1);
    const updated = updateWeeklyPeriod(withSecond, 1, 1, {
      startMinute: 1080,
      endMinute: 1200
    });
    const removed = removeWeeklyPeriod(updated, 1, 0);

    expect(withFirst.weeklyPeriods).toEqual([
      { weekday: 1, startMinute: 540, endMinute: 1020 }
    ]);
    expect(updated.weeklyPeriods).toEqual([
      { weekday: 1, startMinute: 540, endMinute: 1020 },
      { weekday: 1, startMinute: 1080, endMinute: 1200 }
    ]);
    expect(removed.weeklyPeriods).toEqual([
      { weekday: 1, startMinute: 1080, endMinute: 1200 }
    ]);
    expect(initial.weeklyPeriods).toEqual([]);
  });

  it("models closed and special-hours date overrides", () => {
    const initial = createAvailabilityEditorForm(null, "Europe/Moscow");
    const closed = addDateOverride(initial, "2026-08-03");
    const specialHours = updateDateOverride(closed, 0, {
      date: "2026-08-03",
      mode: "available",
      periods: [{ startMinute: 720, endMinute: 900 }]
    });

    expect(closed.dateOverrides).toEqual([
      { date: "2026-08-03", mode: "unavailable", periods: [] }
    ]);
    expect(createAvailabilityScheduleCommand(specialHours).dateOverrides[0]).toEqual({
      date: "2026-08-03",
      mode: "available",
      periods: [{ startMinute: 720, endMinute: 900 }]
    });
    expect(removeDateOverride(specialHours, 0).dateOverrides).toEqual([]);
  });

  it("assigns and unassigns products without duplicates", () => {
    const initial = createAvailabilityEditorForm(null, "Europe/Moscow");
    const productId = "00000000-0000-4000-8000-000000000002";

    const assigned = toggleAvailabilityProduct(initial, productId);
    const unassigned = toggleAvailabilityProduct(assigned, productId);

    expect(assigned.productIds).toEqual([productId]);
    expect(unassigned.productIds).toEqual([]);
  });
});
