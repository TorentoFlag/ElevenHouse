import { beforeEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { HttpError } from "../../../common/http/HttpError";
import { createManualBooking } from "../../bookings/api/createManualBooking";
import { getBooking } from "../../bookings/api/getBooking";
import { getAvailabilitySchedule } from "../../availability/api/getAvailabilitySchedule";
import { putDefaultAvailabilitySchedule } from "../../availability/api/putDefaultAvailabilitySchedule";
import { createManualBlock } from "./createManualBlock";
import { getCalendarRange } from "./getCalendarRange";
import { releaseManualBlock } from "./releaseManualBlock";

const schedule = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Основное расписание",
  version: 1,
  timeZone: "Europe/Moscow",
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 10,
  minimumNoticeMinutes: 360,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: 5,
  weeklyPeriods: [{ weekday: 5, startMinute: 600, endMinute: 1080 }],
  dateOverrides: [],
  productIds: ["00000000-0000-4000-8000-000000000002"]
} as const;

const block = {
  id: "00000000-0000-4000-8000-000000000003",
  reservationId: "00000000-0000-4000-8000-000000000004",
  title: "Личное время",
  state: "active",
  startAt: "2026-05-29T09:00:00.000Z",
  endAt: "2026-05-29T10:00:00.000Z",
  createdAt: "2026-05-20T09:00:00.000Z",
  updatedAt: "2026-05-20T09:00:00.000Z"
} as const;

const booking = {
  id: "00000000-0000-4000-8000-000000000005",
  reservationId: "00000000-0000-4000-8000-000000000006",
  clientUserId: "00000000-0000-4000-8000-000000000007",
  productId: "00000000-0000-4000-8000-000000000002",
  source: "manual",
  state: "confirmed",
  lifecycleRevision: 1,
  holdExpiresAt: null,
  startAt: "2026-05-29T09:00:00.000Z",
  endAt: "2026-05-29T10:00:00.000Z",
  productTitle: "Натальный разбор",
  durationMinutes: 60,
  deliveryFormat: "video",
  priceMinor: 490000,
  currency: "RUB",
  timeZone: "Europe/Moscow",
  policySnapshot: {
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    minimumNoticeMinutes: 360
  },
  createdAt: "2026-05-20T09:00:00.000Z",
  updatedAt: "2026-05-20T09:00:00.000Z"
} as const;

describe("calendar scheduling API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("serializes and validates a calendar range response", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({
      timeZone: "Europe/Moscow",
      range: {
        start: "2026-05-24T21:00:00.000Z",
        end: "2026-05-31T21:00:00.000Z"
      },
      entries: [],
      availability: [],
      summary: { bookingCount: 0, bookedMinutes: 0, byDisplayStatus: {} }
    });

    await expect(
      getCalendarRange({
        start: "2026-05-24T21:00:00.000Z",
        end: "2026-05-31T21:00:00.000Z",
        timeZone: "Europe/Moscow"
      })
    ).resolves.toMatchObject({ timeZone: "Europe/Moscow", entries: [] });
    expect(application.http.get).toHaveBeenCalledWith(
      "/calendar/range?start=2026-05-24T21%3A00%3A00.000Z&end=2026-05-31T21%3A00%3A00.000Z&timeZone=Europe%2FMoscow"
    );
  });

  it("rejects a malformed calendar response instead of leaking an unchecked DTO", async () => {
    vi.spyOn(application.http, "get").mockResolvedValue({ entries: [{ id: "bad" }] });

    await expect(
      getCalendarRange({
        start: "2026-05-24T21:00:00.000Z",
        end: "2026-05-31T21:00:00.000Z",
        timeZone: "Europe/Moscow"
      })
    ).rejects.toThrow();
  });

  it("reads and updates the default availability schedule through shared contracts", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue({ schedule });
    const put = vi.spyOn(application.http, "put").mockResolvedValue({ schedule });

    await expect(getAvailabilitySchedule()).resolves.toEqual({ schedule });
    await expect(
      putDefaultAvailabilitySchedule({
        expectedVersion: 1,
        timeZone: schedule.timeZone,
        startIntervalMinutes: schedule.startIntervalMinutes,
        bufferBeforeMinutes: schedule.bufferBeforeMinutes,
        bufferAfterMinutes: schedule.bufferAfterMinutes,
        minimumNoticeMinutes: schedule.minimumNoticeMinutes,
        bookingHorizonDays: schedule.bookingHorizonDays,
        maximumBookingsPerDay: schedule.maximumBookingsPerDay,
        weeklyPeriods: [...schedule.weeklyPeriods],
        dateOverrides: [],
        productIds: [...schedule.productIds]
      })
    ).resolves.toEqual({ schedule });
    expect(get).toHaveBeenCalledWith("/availability/schedules/default");
    expect(put).toHaveBeenCalledWith(
      "/availability/schedules/default",
      expect.objectContaining({ expectedVersion: 1 }),
      { csrf: true }
    );
  });

  it("maps an absent default schedule to null without hiding other API failures", async () => {
    vi.spyOn(application.http, "get").mockRejectedValueOnce(
      new HttpError(404, { code: "schedule_not_found" })
    );

    await expect(getAvailabilitySchedule()).resolves.toBeNull();

    const failure = new HttpError(503, { code: "service_unavailable" });
    vi.spyOn(application.http, "get").mockRejectedValueOnce(failure);

    await expect(getAvailabilitySchedule()).rejects.toBe(failure);
  });

  it("creates idempotent blocks and releases them", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue({ block, replayed: false });
    const remove = vi
      .spyOn(application.http, "delete")
      .mockResolvedValue({ block: { ...block, state: "released" }, replayed: false });

    await expect(
      createManualBlock({
        body: { title: block.title, startAt: block.startAt, endAt: block.endAt },
        idempotencyKey: "calendar-block-0001"
      })
    ).resolves.toEqual({ block, replayed: false });
    await expect(releaseManualBlock(block.id)).resolves.toMatchObject({
      block: { state: "released" }
    });
    expect(post).toHaveBeenCalledWith(
      "/calendar/blocks",
      { title: block.title, startAt: block.startAt, endAt: block.endAt },
      { csrf: true, headers: { "idempotency-key": "calendar-block-0001" } }
    );
    expect(remove).toHaveBeenCalledWith(`/calendar/blocks/${block.id}`, { csrf: true });
  });

  it("creates and safely reads a manual booking", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue({ booking, replayed: false });
    const get = vi.spyOn(application.http, "get").mockResolvedValue({ booking });

    await expect(
      createManualBooking({
        body: {
          clientUserId: booking.clientUserId,
          productId: booking.productId,
          deliveryFormat: booking.deliveryFormat,
          projectedStartAt: booking.startAt
        },
        idempotencyKey: "manual-booking-0001"
      })
    ).resolves.toEqual({ booking, replayed: false });
    await expect(getBooking(booking.id)).resolves.toEqual({ booking });
    expect(post).toHaveBeenCalledWith(
      "/bookings/manual",
      expect.objectContaining({ clientUserId: booking.clientUserId }),
      { csrf: true, headers: { "idempotency-key": "manual-booking-0001" } }
    );
    expect(get).toHaveBeenCalledWith(`/bookings/${booking.id}`);
  });
});
