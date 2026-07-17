import { HttpException } from "@nestjs/common";
import type {
  AvailabilityStore,
  AvailabilitySchedule,
  CalendarReadStore,
  ManualCalendarBlock,
  ManualCalendarBlockCommandStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { CalendarService } from "./calendar.service";

const ownerUserId = "22222222-2222-4222-8222-222222222222";
const blockId = "11111111-1111-4111-8111-111111111111";
const schedule: AvailabilitySchedule = {
  id: "33333333-3333-4333-8333-333333333333",
  ownerUserId,
  name: "Default",
  timeZone: "Europe/Moscow",
  isDefault: true,
  version: 1,
  startIntervalMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minimumNoticeMinutes: 0,
  bookingHorizonDays: 60,
  maximumBookingsPerDay: null,
  weeklyPeriods: [{ weekday: 1 as const, startMinute: 600, endMinute: 720 }],
  dateOverrides: [],
  productIds: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z"
};
const block: ManualCalendarBlock = {
  id: blockId,
  reservationId: "44444444-4444-4444-8444-444444444444",
  ownerUserId,
  scheduleId: schedule.id,
  title: "Отпуск",
  state: "active" as const,
  startAt: "2026-07-20T07:00:00.000Z",
  endAt: "2026-07-20T08:00:00.000Z",
  createdAt: "2026-07-17T09:00:00.000Z",
  updatedAt: "2026-07-17T09:00:00.000Z"
};

describe("CalendarService", () => {
  it("returns bounded entries, schedule backgrounds and non-financial summary", async () => {
    const service = createService();
    const response = await service.getRange(
      { start: "2026-07-20T00:00:00Z", end: "2026-07-21T00:00:00Z", timeZone: "Europe/Moscow" },
      request()
    );
    expect(response).toMatchObject({
      timeZone: "Europe/Moscow",
      availability: [{ startAt: "2026-07-20T07:00:00Z", endAt: "2026-07-20T09:00:00Z" }],
      summary: { bookingCount: 0, bookedMinutes: 0 }
    });
    expect(response.summary).not.toHaveProperty("revenue");
  });

  it("creates and idempotently releases owner-scoped manual blocks", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });
    await expect(
      service.createBlock(
        { title: "Отпуск", startAt: block.startAt, endAt: block.endAt },
        "calendar-block:request-1",
        request()
      )
    ).resolves.toMatchObject({ block: { id: blockId }, replayed: false });
    await expect(service.releaseBlock(blockId, request())).resolves.toMatchObject({
      block: { id: blockId }
    });
    expect(commandStore.release).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId }));
  });

  it("maps overlap and not-found failures to stable safe errors", async () => {
    const conflictStore = createCommandStore({
      executeCreate: vi.fn(async () => {
        const { ManualCalendarBlockConflictError } = await import("@elevenhouse/domain");
        throw new ManualCalendarBlockConflictError();
      })
    });
    const conflict = createService({ commandStore: conflictStore });
    await expect(
      conflict.createBlock(
        { title: "Отпуск", startAt: block.startAt, endAt: block.endAt },
        "calendar-block:request-1",
        request()
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException &&
        error.getStatus() === 409 &&
        (error.getResponse() as { code: string }).code === "slot_no_longer_available"
    );

    const missing = createService({
      commandStore: createCommandStore({ release: vi.fn(async () => null) })
    });
    await expect(missing.releaseBlock(blockId, request())).rejects.toMatchObject({ status: 404 });
  });
});

function request() {
  return { currentAstrologerAccount: { account: { id: ownerUserId } } } as never;
}

function createService(overrides: { commandStore?: ManualCalendarBlockCommandStore } = {}) {
  const availabilityStore: AvailabilityStore = {
    findDefaultByOwner: vi.fn(async () => schedule),
    putDefault: vi.fn(async () => ({ kind: "created" as const, schedule })),
    replace: vi.fn(async () => ({ kind: "updated" as const, schedule })),
    readProjectionContext: vi.fn(async () => null)
  };
  const readStore: CalendarReadStore = {
    readRange: vi.fn(async () => ({
      entries: [],
      summary: { bookingCount: 0, bookedMinutes: 0, byDisplayStatus: {} }
    }))
  };
  return new CalendarService(
    availabilityStore,
    readStore,
    overrides.commandStore ?? createCommandStore(),
    { now: () => new Date("2026-07-17T09:00:00Z") }
  );
}

function createCommandStore(
  overrides: Partial<ManualCalendarBlockCommandStore> = {}
): ManualCalendarBlockCommandStore {
  return {
    executeCreate: vi.fn(async () => ({ kind: "created" as const, block })),
    release: vi.fn(async () => ({ ...block, state: "released" as const })),
    ...overrides
  };
}
