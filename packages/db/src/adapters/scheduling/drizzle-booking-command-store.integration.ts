import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  IdempotencyKeyReuseError,
  ManualCalendarBlockConflictError,
  SlotNoLongerAvailableError,
  type ManualBookingClaim,
  type ManualBookingCommand,
  type ManualCalendarBlockClaim,
  type ManualCalendarBlockCommand,
  type PaidBookingHoldCommand
} from "@elevenhouse/domain";
import { Client } from "pg";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleAvailabilityStore } from "./drizzle-availability-store";
import { createDrizzleBookingCommandStore } from "./drizzle-booking-command-store";
import { createDrizzleCalendarReadStore } from "./drizzle-calendar-read-store";
import { createDrizzleManualBlockCommandStore } from "./drizzle-manual-block-command-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_booking_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("scheduling command stores Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
    await runtime.pool.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("serializes overlapping claims, permits adjacency and rolls back failed booking inserts", async () => {
    const fixture = await createFixture();
    const store = createDrizzleBookingCommandStore(runtime.database);
    const overlapClaim = bookingClaim(fixture, "2026-05-29T10:00:00Z", "2026-05-29T11:00:00Z");

    const race = await Promise.allSettled([
      store.executeManualBooking(
        bookingCommand(fixture.ownerUserId, "booking-race-a", "a"),
        async () => overlapClaim
      ),
      store.executeManualBooking(
        bookingCommand(fixture.ownerUserId, "booking-race-b", "b"),
        async () => overlapClaim
      )
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = race.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(SlotNoLongerAvailableError) });

    await expect(
      store.executeManualBooking(bookingCommand(fixture.ownerUserId, "booking-adjacent", "c"), async () =>
        bookingClaim(fixture, "2026-05-29T11:00:00Z", "2026-05-29T12:00:00Z")
      )
    ).resolves.toMatchObject({ kind: "created" });

    const reservationCountBeforeFailure = await activeReservationCount(fixture.ownerUserId);
    await expect(
      store.executeManualBooking(bookingCommand(fixture.ownerUserId, "booking-invalid", "d"), async () => ({
        ...bookingClaim(fixture, "2026-05-29T12:00:00Z", "2026-05-29T13:00:00Z"),
        productId: randomUUID()
      }))
    ).rejects.toThrow();
    await expect(activeReservationCount(fixture.ownerUserId)).resolves.toBe(
      reservationCountBeforeFailure
    );
  });

  it("persists one concurrent idempotent result and rejects changed-key reuse", async () => {
    const fixture = await createFixture();
    const store = createDrizzleBookingCommandStore(runtime.database);
    const claim = bookingClaim(fixture, "2026-05-30T10:00:00Z", "2026-05-30T11:00:00Z");
    const createClaim = vi.fn(async () => claim);
    const command = bookingCommand(fixture.ownerUserId, "booking-replay-key", "e");

    const results = await Promise.all([
      store.executeManualBooking(command, createClaim),
      store.executeManualBooking(command, createClaim)
    ]);
    expect(results.map((result) => result.kind).sort()).toEqual(["created", "replayed"]);
    expect(results[0]?.booking.id).toBe(results[1]?.booking.id);
    expect(createClaim).toHaveBeenCalledTimes(1);

    await expect(
      store.executeManualBooking({ ...command, requestHash: digest("f") }, async () => claim)
    ).rejects.toBeInstanceOf(IdempotencyKeyReuseError);
    await expect(
      store.findByOwnerAndId({
        ownerUserId: randomUUID(),
        bookingId: results[0]?.booking.id ?? raise("Expected booking")
      })
    ).resolves.toBeNull();
  });

  it("releases an expired paid hold before inserting a new overlapping booking", async () => {
    const fixture = await createFixture();
    const store = createDrizzleBookingCommandStore(runtime.database);
    const claim = bookingClaim(fixture, "2026-05-30T14:00:00Z", "2026-05-30T15:00:00Z");
    const held = await store.executePaidHold(
      paidBookingHoldCommand(fixture.clientUserId, "paid-hold-expired", "x"),
      async () => ({
        ...claim,
        holdExpiresAt: "2026-05-20T10:15:00.000Z"
      })
    );

    await expect(
      store.executeManualBooking(
        bookingCommand(
          fixture.ownerUserId,
          "booking-after-expired-paid-hold",
          "y",
          "2026-05-20T10:16:00.000Z"
        ),
        async () => claim
      )
    ).resolves.toMatchObject({ kind: "created" });

    const result = await runtime.pool.query<{
      booking_state: string;
      booking_hold_expires_at: Date | null;
      reservation_lifecycle: string;
    }>(
      `select b.state as booking_state,
              b.hold_expires_at as booking_hold_expires_at,
              r.lifecycle as reservation_lifecycle
         from bookings b
         inner join schedule_reservations r on r.id = b.reservation_id
        where b.id = $1`,
      [held.booking.id]
    );
    expect(result.rows[0]).toEqual({
      booking_state: "expired",
      booking_hold_expires_at: null,
      reservation_lifecycle: "released"
    });
  });

  it("creates, replays and idempotently releases owner-scoped manual blocks", async () => {
    const fixture = await createFixture();
    const bookingStore = createDrizzleBookingCommandStore(runtime.database);
    const blockStore = createDrizzleManualBlockCommandStore(runtime.database);
    const claim = manualBlockClaim(
      fixture,
      "2026-05-31T10:00:00Z",
      "2026-05-31T12:00:00Z"
    );
    const command = manualBlockCommand(fixture.ownerUserId, "manual-block-key", "1");
    const created = await blockStore.executeCreate(command, async () => claim);

    await expect(blockStore.executeCreate(command, async () => claim)).resolves.toEqual({
      kind: "replayed",
      block: created.block
    });
    await expect(
      blockStore.executeCreate({ ...command, requestHash: digest("2") }, async () => claim)
    ).rejects.toBeInstanceOf(IdempotencyKeyReuseError);
    await expect(
      blockStore.executeCreate(
        manualBlockCommand(fixture.ownerUserId, "manual-block-overlap", "3"),
        async () => claim
      )
    ).rejects.toBeInstanceOf(ManualCalendarBlockConflictError);
    await expect(
      bookingStore.executeManualBooking(bookingCommand(fixture.ownerUserId, "booking-blocked", "4"), async () =>
        bookingClaim(fixture, claim.startAt, "2026-05-31T11:00:00Z")
      )
    ).rejects.toBeInstanceOf(SlotNoLongerAvailableError);

    await expect(
      blockStore.release({
        ownerUserId: fixture.otherOwnerUserId,
        blockId: created.block.id,
        now: "2026-05-20T12:00:00.000Z"
      })
    ).resolves.toBeNull();
    const released = await blockStore.release({
      ownerUserId: fixture.ownerUserId,
      blockId: created.block.id,
      now: "2026-05-20T12:00:00.000Z"
    });
    await expect(
      blockStore.release({
        ownerUserId: fixture.ownerUserId,
        blockId: created.block.id,
        now: "2026-05-20T12:01:00.000Z"
      })
    ).resolves.toEqual(released);
    await expect(
      bookingStore.executeManualBooking(bookingCommand(fixture.ownerUserId, "booking-after-release", "5"), async () =>
        bookingClaim(fixture, claim.startAt, "2026-05-31T11:00:00Z")
      )
    ).resolves.toMatchObject({ kind: "created" });
  });

  it("returns owner-scoped booking and block entries with authoritative summaries", async () => {
    const fixture = await createFixture("Марина Краснова");
    const bookingStore = createDrizzleBookingCommandStore(runtime.database);
    const blockStore = createDrizzleManualBlockCommandStore(runtime.database);
    const readStore = createDrizzleCalendarReadStore(runtime.database);
    await bookingStore.executeManualBooking(bookingCommand(fixture.ownerUserId, "calendar-booking", "6"), async () =>
      bookingClaim(fixture, "2026-06-01T10:00:00Z", "2026-06-01T11:00:00Z")
    );
    await blockStore.executeCreate(manualBlockCommand(fixture.ownerUserId, "calendar-block", "7"), async () =>
      manualBlockClaim(fixture, "2026-06-01T12:00:00Z", "2026-06-01T14:00:00Z")
    );

    await expect(
      readStore.readRange({
        ownerUserId: fixture.ownerUserId,
        startAt: "2026-06-01T00:00:00Z",
        endAt: "2026-06-02T00:00:00Z"
      })
    ).resolves.toEqual({
      entries: [
        expect.objectContaining({
          kind: "booking",
          title: "Марина Краснова",
          subtitle: "Consultation",
          displayStatus: "confirmed"
        }),
        expect.objectContaining({
          kind: "manual_block",
          title: "Отпуск",
          displayStatus: "blocked"
        })
      ],
      summary: {
        bookingCount: 1,
        bookedMinutes: 60,
        byDisplayStatus: { confirmed: 1, blocked: 1 }
      }
    });
    await expect(
      readStore.readRange({
        ownerUserId: fixture.otherOwnerUserId,
        startAt: "2026-06-01T00:00:00Z",
        endAt: "2026-06-02T00:00:00Z"
      })
    ).resolves.toEqual({
      entries: [],
      summary: { bookingCount: 0, bookedMinutes: 0, byDisplayStatus: {} }
    });
  });

  async function createFixture(clientDisplayName = "Client") {
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    const clientUserId = await createUser();
    await runtime.pool.query(
      "insert into client_profiles (user_id, display_name_snapshot) values ($1, $2)",
      [clientUserId, clientDisplayName]
    );
    const productId = await createProduct(ownerUserId);
    const availabilityStore = createDrizzleAvailabilityStore(runtime.database);
    const scheduleResult = await availabilityStore.putDefault({
      ownerUserId,
      expectedVersion: null,
      timeZone: "Europe/Moscow",
      startIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      bookingHorizonDays: 60,
      maximumBookingsPerDay: null,
      weeklyPeriods: [],
      dateOverrides: [],
      productIds: [productId],
      now: "2026-05-20T10:00:00.000Z"
    });
    if (scheduleResult.kind !== "created") throw new Error("Expected schedule creation");
    return {
      ownerUserId,
      otherOwnerUserId,
      clientUserId,
      productId,
      scheduleId: scheduleResult.schedule.id
    };
  }

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user id");
  }

  async function createProduct(ownerUserId: string): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      `insert into products
        (owner_user_id, type, status, title, price_minor, currency,
         execution_mode, payment_model, duration_minutes, participant_mode)
       values ($1, 'single', 'active', 'Consultation', 490000, 'RUB',
         'live', 'once', 60, 'solo')
       returning id`,
      [ownerUserId]
    );
    return result.rows[0]?.id ?? raise("Expected product id");
  }

  async function activeReservationCount(ownerUserId: string): Promise<number> {
    const result = await runtime.pool.query<{ value: string }>(
      "select count(*)::text as value from schedule_reservations where owner_user_id = $1",
      [ownerUserId]
    );
    return Number(result.rows[0]?.value ?? 0);
  }
});

function bookingClaim(
  fixture: {
    ownerUserId: string;
    clientUserId: string;
    productId: string;
    scheduleId: string;
  },
  startAt: string,
  endAt: string
): ManualBookingClaim {
  return {
    ownerUserId: fixture.ownerUserId,
    clientUserId: fixture.clientUserId,
    productId: fixture.productId,
    scheduleId: fixture.scheduleId,
    serviceStartAt: startAt,
    serviceEndAt: endAt,
    occupiedStartAt: startAt,
    occupiedEndAt: endAt,
    productSnapshot: {
      title: "Consultation",
      durationMinutes: 60,
      deliveryFormat: "video",
      priceMinor: 490000,
      currency: "RUB"
    },
    scheduleSnapshot: {
      timeZone: "Europe/Moscow",
      policy: { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumNoticeMinutes: 0 }
    }
  };
}

function manualBlockClaim(
  fixture: { ownerUserId: string; scheduleId: string },
  startAt: string,
  endAt: string
): ManualCalendarBlockClaim {
  return {
    ownerUserId: fixture.ownerUserId,
    scheduleId: fixture.scheduleId,
    title: "Отпуск",
    startAt,
    endAt
  };
}

function bookingCommand(
  actorUserId: string,
  key: string,
  hashCharacter: string,
  now = "2026-05-20T10:00:00.000Z"
): ManualBookingCommand {
  return {
    actorUserId,
    scope: "bookings.manual.create",
    key,
    requestHash: digest(hashCharacter),
    now,
    expiresAt: "2026-05-21T10:00:00.000Z"
  };
}

function paidBookingHoldCommand(
  actorUserId: string,
  key: string,
  hashCharacter: string
): PaidBookingHoldCommand {
  return {
    actorUserId,
    scope: "bookings.paid.hold.create",
    key,
    requestHash: digest(hashCharacter),
    now: "2026-05-20T10:00:00.000Z",
    expiresAt: "2026-05-20T10:15:00.000Z"
  };
}

function manualBlockCommand(
  actorUserId: string,
  key: string,
  hashCharacter: string
): ManualCalendarBlockCommand {
  return {
    actorUserId,
    scope: "calendar.manual-block.create",
    key,
    requestHash: digest(hashCharacter),
    now: "2026-05-20T10:00:00.000Z",
    expiresAt: "2026-05-21T10:00:00.000Z"
  };
}

function digest(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function raise(message: string): never {
  throw new Error(message);
}
