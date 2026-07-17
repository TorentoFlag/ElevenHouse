import { describe, expect, it, vi } from "vitest";
import type { AvailabilityStore } from "./availability-store";
import type { AvailabilitySchedule } from "./availability-types";
import {
  createManualCalendarBlock,
  ManualCalendarBlockNotFoundError,
  ManualCalendarBlockValidationError,
  releaseManualCalendarBlock,
  type ManualCalendarBlockCommandStore
} from "./manual-calendar-blocks";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const blockId = "33333333-3333-4333-8333-333333333333";
const reservationId = "44444444-4444-4444-8444-444444444444";

const schedule: AvailabilitySchedule = {
  id: scheduleId,
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
  weeklyPeriods: [],
  dateOverrides: [],
  productIds: [],
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

const activeBlock = {
  id: blockId,
  reservationId,
  ownerUserId,
  scheduleId,
  title: "Отпуск",
  state: "active" as const,
  startAt: "2026-05-28T10:00:00Z",
  endAt: "2026-05-28T15:00:00Z",
  createdAt: "2026-05-20T10:00:00.000Z",
  updatedAt: "2026-05-20T10:00:00.000Z"
};

function createAvailabilityStore(): AvailabilityStore {
  return {
    findDefaultByOwner: vi.fn(async () => schedule),
    putDefault: vi.fn(async () => ({ kind: "not_found" as const })),
    replace: vi.fn(async () => ({ kind: "not_found" as const })),
    readProjectionContext: vi.fn(async () => null)
  };
}

function createCommandStore(): ManualCalendarBlockCommandStore {
  return {
    executeCreate: vi.fn(async (_command, createClaim) => {
      await createClaim();
      return { kind: "created" as const, block: activeBlock };
    }),
    release: vi.fn(async () => ({ ...activeBlock, state: "released" as const }))
  };
}

describe("manual calendar block use cases", () => {
  it("claims an exact owner-scoped range through an idempotent command", async () => {
    const availabilityStore = createAvailabilityStore();
    const commandStore = createCommandStore();

    await expect(
      createManualCalendarBlock({
        availabilityStore,
        commandStore,
        ownerUserId,
        idempotencyKey: "block-create-1",
        input: {
          title: "  Отпуск  ",
          startAt: "2026-05-28T13:00:00+03:00",
          endAt: "2026-05-28T18:00:00+03:00"
        },
        now: new Date("2026-05-20T10:00:00.000Z")
      })
    ).resolves.toEqual({ block: activeBlock, replayed: false });

    expect(commandStore.executeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ownerUserId,
        scope: "calendar.manual-block.create",
        key: "block-create-1",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      }),
      expect.any(Function)
    );
    const createClaim = vi.mocked(commandStore.executeCreate).mock.calls[0]?.[1];
    await expect(createClaim?.()).resolves.toEqual({
      ownerUserId,
      scheduleId,
      title: "Отпуск",
      startAt: "2026-05-28T10:00:00Z",
      endAt: "2026-05-28T15:00:00Z"
    });
  });

  it("rejects invalid or excessively long ranges before persistence", async () => {
    const common = {
      availabilityStore: createAvailabilityStore(),
      commandStore: createCommandStore(),
      ownerUserId,
      idempotencyKey: "block-create-2",
      now: new Date("2026-05-20T10:00:00.000Z")
    };

    await expect(
      createManualCalendarBlock({
        ...common,
        input: { title: " ", startAt: activeBlock.startAt, endAt: activeBlock.endAt }
      })
    ).rejects.toBeInstanceOf(ManualCalendarBlockValidationError);
    await expect(
      createManualCalendarBlock({
        ...common,
        input: {
          title: "Too long",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2027-01-03T00:00:00Z"
        }
      })
    ).rejects.toBeInstanceOf(ManualCalendarBlockValidationError);
  });

  it("releases only an owner-scoped block and safely hides missing records", async () => {
    const commandStore = createCommandStore();
    await expect(
      releaseManualCalendarBlock({
        commandStore,
        ownerUserId,
        blockId,
        now: new Date("2026-05-20T11:00:00.000Z")
      })
    ).resolves.toMatchObject({ id: blockId, state: "released" });
    expect(commandStore.release).toHaveBeenCalledWith({
      ownerUserId,
      blockId,
      now: "2026-05-20T11:00:00.000Z"
    });

    vi.mocked(commandStore.release).mockResolvedValue(null);
    await expect(
      releaseManualCalendarBlock({
        commandStore,
        ownerUserId,
        blockId,
        now: new Date()
      })
    ).rejects.toBeInstanceOf(ManualCalendarBlockNotFoundError);
  });
});
