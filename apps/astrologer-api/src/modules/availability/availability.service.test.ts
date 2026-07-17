import { HttpException } from "@nestjs/common";
import type {
  AvailabilityProductReader,
  AvailabilitySchedule,
  AvailabilityStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { AvailabilityService } from "./availability.service";

const ownerUserId = "22222222-2222-4222-8222-222222222222";
const productId = "11111111-1111-4111-8111-111111111111";
const schedule: AvailabilitySchedule = {
  id: "33333333-3333-4333-8333-333333333333",
  ownerUserId,
  name: "Default",
  timeZone: "Europe/Moscow",
  isDefault: true,
  version: 1,
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 10,
  minimumNoticeMinutes: 360,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: 5,
  weeklyPeriods: [{ weekday: 1 as const, startMinute: 600, endMinute: 720 }],
  dateOverrides: [],
  productIds: [productId],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z"
};

describe("AvailabilityService", () => {
  it("returns a contract-safe default schedule without creating it on read", async () => {
    const store = createStore();
    const service = createService(store);
    await expect(service.getDefaultSchedule(request())).resolves.toEqual({
      schedule: expect.not.objectContaining({ ownerUserId: expect.anything() })
    });
    expect(store.putDefault).not.toHaveBeenCalled();
  });

  it("returns stable not-found and version-conflict errors", async () => {
    const missing = createService(createStore({ findDefaultByOwner: vi.fn(async () => null) }));
    await expect(missing.getDefaultSchedule(request())).rejects.toMatchObject({ status: 404 });

    const conflict = createService(
      createStore({
        putDefault: vi.fn(async () => ({
          kind: "version_conflict" as const,
          currentVersion: 4
        }))
      })
    );
    await expect(conflict.putDefaultSchedule(validBody(), request())).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 409 &&
        (error.getResponse() as { code: string; currentVersion: number }).code ===
          "availability_version_conflict" &&
        (error.getResponse() as { currentVersion: number }).currentVersion === 4
    );
  });

  it("parses the PUT contract and scopes product validation to the actor", async () => {
    const store = createStore();
    const productReader: AvailabilityProductReader = {
      findBookableProductIds: vi.fn(async () => [productId])
    };
    const service = createService(store, productReader);
    await expect(service.putDefaultSchedule(validBody(), request())).resolves.toMatchObject({
      schedule: { id: schedule.id, version: 1 }
    });
    expect(productReader.findBookableProductIds).toHaveBeenCalledWith({
      ownerUserId,
      productIds: [productId]
    });
    expect(store.putDefault).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId }));
  });
});

function validBody() {
  return {
    expectedVersion: null,
    timeZone: schedule.timeZone,
    startIntervalMinutes: schedule.startIntervalMinutes,
    bufferBeforeMinutes: schedule.bufferBeforeMinutes,
    bufferAfterMinutes: schedule.bufferAfterMinutes,
    minimumNoticeMinutes: schedule.minimumNoticeMinutes,
    bookingHorizonDays: schedule.bookingHorizonDays,
    maximumBookingsPerDay: schedule.maximumBookingsPerDay,
    weeklyPeriods: schedule.weeklyPeriods,
    dateOverrides: schedule.dateOverrides,
    productIds: schedule.productIds
  };
}

function request() {
  return { currentAstrologerAccount: { account: { id: ownerUserId } } } as never;
}

function createService(
  store: AvailabilityStore,
  productReader: AvailabilityProductReader = { findBookableProductIds: vi.fn(async () => [productId]) }
) {
  return new AvailabilityService(store, productReader, { now: () => new Date("2026-07-17T09:00:00Z") });
}

function createStore(overrides: Partial<AvailabilityStore> = {}): AvailabilityStore {
  return {
    findDefaultByOwner: vi.fn(async () => schedule),
    putDefault: vi.fn(async () => ({ kind: "created" as const, schedule })),
    replace: vi.fn(async () => ({ kind: "updated" as const, schedule })),
    readProjectionContext: vi.fn(async () => null),
    ...overrides
  };
}
