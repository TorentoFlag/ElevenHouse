import { describe, expect, it, vi } from "vitest";
import {
  AvailabilityProductNotBookableError,
  AvailabilityScheduleNotFoundError,
  AvailabilityValidationError,
  AvailabilityVersionConflictError
} from "./availability-errors";
import type {
  AvailabilityProductReader,
  AvailabilityStore,
  AvailabilityStoreReplaceInput
} from "./availability-store";
import type { AvailabilitySchedule } from "./availability-types";
import {
  getDefaultAvailabilitySchedule,
  putDefaultAvailabilitySchedule,
  replaceAvailabilitySchedule
} from "./availability-use-cases";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";

const schedule: AvailabilitySchedule = {
  id: scheduleId,
  ownerUserId,
  name: "Основное расписание",
  timeZone: "Europe/Moscow",
  isDefault: true,
  version: 2,
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 10,
  minimumNoticeMinutes: 360,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: 5,
  weeklyPeriods: [
    { weekday: 1, startMinute: 600, endMinute: 780 },
    { weekday: 1, startMinute: 900, endMinute: 1140 }
  ],
  dateOverrides: [{ date: "2026-05-28", mode: "unavailable", periods: [] }],
  productIds: [productId],
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z"
};

function createStore(
  replaceResult: Awaited<ReturnType<AvailabilityStore["replace"]>> = {
    kind: "updated",
    schedule: { ...schedule, version: 3 }
  }
): AvailabilityStore {
  return {
    findDefaultByOwner: vi.fn(async () => schedule),
    putDefault: vi.fn(async () => ({
      kind: "created" as const,
      schedule: { ...schedule, version: 1 }
    })),
    replace: vi.fn(async () => replaceResult),
    readProjectionContext: vi.fn(async () => null)
  };
}

function createProductReader(bookableIds: readonly string[] = [productId]): AvailabilityProductReader {
  return {
    findBookableProductIds: vi.fn(async () => bookableIds)
  };
}

const replacement = {
  expectedVersion: 2,
  timeZone: "Europe/Moscow",
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 10,
  minimumNoticeMinutes: 360,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: 5,
  weeklyPeriods: [
    { weekday: 1 as const, startMinute: 600, endMinute: 780 },
    { weekday: 1 as const, startMinute: 900, endMinute: 1140 }
  ],
  dateOverrides: [{ date: "2026-05-28", mode: "unavailable" as const, periods: [] }],
  productIds: [productId]
};

describe("availability use cases", () => {
  it("loads the owner-scoped default schedule", async () => {
    const store = createStore();

    await expect(getDefaultAvailabilitySchedule({ store, ownerUserId })).resolves.toEqual(schedule);
    expect(store.findDefaultByOwner).toHaveBeenCalledWith({ ownerUserId });
  });

  it("creates the first default schedule and updates it through one optimistic command", async () => {
    const store = createStore();
    const productReader = createProductReader();
    const now = new Date("2026-05-20T10:00:00.000Z");

    await expect(
      putDefaultAvailabilitySchedule({
        store,
        productReader,
        ownerUserId,
        input: { ...replacement, expectedVersion: null },
        now
      })
    ).resolves.toMatchObject({ version: 1 });
    expect(store.putDefault).toHaveBeenCalledWith({
      ownerUserId,
      ...replacement,
      expectedVersion: null,
      now: now.toISOString()
    });

    vi.mocked(store.putDefault).mockResolvedValue({ kind: "version_conflict", currentVersion: 2 });
    await expect(
      putDefaultAvailabilitySchedule({
        store,
        productReader,
        ownerUserId,
        input: replacement,
        now
      })
    ).rejects.toEqual(new AvailabilityVersionConflictError(2));
  });

  it("uses a safe not-found error for a missing owner schedule", async () => {
    const store = createStore();
    vi.mocked(store.findDefaultByOwner).mockResolvedValue(null);

    await expect(getDefaultAvailabilitySchedule({ store, ownerUserId })).rejects.toBeInstanceOf(
      AvailabilityScheduleNotFoundError
    );
  });

  it("validates products and atomically replaces the complete aggregate", async () => {
    const store = createStore();
    const productReader = createProductReader();
    const now = new Date("2026-05-20T10:00:00.000Z");

    await expect(
      replaceAvailabilitySchedule({
        store,
        productReader,
        ownerUserId,
        scheduleId,
        input: replacement,
        now
      })
    ).resolves.toMatchObject({ version: 3 });
    expect(productReader.findBookableProductIds).toHaveBeenCalledWith({
      ownerUserId,
      productIds: [productId]
    });
    expect(store.replace).toHaveBeenCalledWith({
      ownerUserId,
      scheduleId,
      ...replacement,
      now: now.toISOString()
    } satisfies AvailabilityStoreReplaceInput);
  });

  it("rejects foreign, inactive or non-live product assignments", async () => {
    await expect(
      replaceAvailabilitySchedule({
        store: createStore(),
        productReader: createProductReader([]),
        ownerUserId,
        scheduleId,
        input: replacement,
        now: new Date()
      })
    ).rejects.toEqual(new AvailabilityProductNotBookableError(productId));
  });

  it("rejects invalid timezone, overlapping periods and duplicate overrides", async () => {
    const unavailableOverride = replacement.dateOverrides[0]!;
    const common = {
      store: createStore(),
      productReader: createProductReader(),
      ownerUserId,
      scheduleId,
      now: new Date()
    };

    await expect(
      replaceAvailabilitySchedule({
        ...common,
        input: { ...replacement, timeZone: "Mars/Olympus" }
      })
    ).rejects.toBeInstanceOf(AvailabilityValidationError);
    await expect(
      replaceAvailabilitySchedule({
        ...common,
        input: {
          ...replacement,
          weeklyPeriods: [
            { weekday: 1, startMinute: 600, endMinute: 780 },
            { weekday: 1, startMinute: 720, endMinute: 840 }
          ]
        }
      })
    ).rejects.toThrow("Availability periods cannot overlap");
    await expect(
      replaceAvailabilitySchedule({
        ...common,
        input: {
          ...replacement,
          dateOverrides: [unavailableOverride, unavailableOverride]
        }
      })
    ).rejects.toThrow("Date overrides must be unique");
  });

  it("maps store not-found and optimistic-version results to typed errors", async () => {
    await expect(
      replaceAvailabilitySchedule({
        store: createStore({ kind: "not_found" }),
        productReader: createProductReader(),
        ownerUserId,
        scheduleId,
        input: replacement,
        now: new Date()
      })
    ).rejects.toBeInstanceOf(AvailabilityScheduleNotFoundError);
    await expect(
      replaceAvailabilitySchedule({
        store: createStore({ kind: "version_conflict", currentVersion: 4 }),
        productReader: createProductReader(),
        ownerUserId,
        scheduleId,
        input: replacement,
        now: new Date()
      })
    ).rejects.toEqual(new AvailabilityVersionConflictError(4));
  });
});
