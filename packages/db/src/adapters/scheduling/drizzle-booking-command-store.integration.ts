import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  IdempotencyKeyReuseError,
  BookingCancellationRequiresRefundAuthorityError,
  BookingLifecycleRevisionConflictError,
  ManualCalendarBlockConflictError,
  SlotNoLongerAvailableError,
  BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
  type ManualBookingClaim,
  type ManualBookingCommand,
  type ManualCalendarBlockClaim,
  type ManualCalendarBlockCommand,
  type OwnerCancelBookingCommand,
  type OwnerCompleteBookingCommand,
  type OwnerRescheduleBookingCommand,
  type BookingRescheduleClaim,
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
      store.executeManualBooking(
        bookingCommand(fixture.ownerUserId, "booking-adjacent", "c"),
        async () => bookingClaim(fixture, "2026-05-29T11:00:00Z", "2026-05-29T12:00:00Z")
      )
    ).resolves.toMatchObject({ kind: "created" });

    const reservationCountBeforeFailure = await activeReservationCount(fixture.ownerUserId);
    await expect(
      store.executeManualBooking(
        bookingCommand(fixture.ownerUserId, "booking-invalid", "d"),
        async () => ({
          ...bookingClaim(fixture, "2026-05-29T12:00:00Z", "2026-05-29T13:00:00Z"),
          productId: randomUUID()
        })
      )
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
    expect(results[0]?.booking.clientDataRequirementsSnapshot).toEqual(
      claim.productSnapshot.clientDataRequirements
    );
    expect(createClaim).toHaveBeenCalledTimes(1);
    const outbox = await runtime.pool.query<{
      event_type: string;
      aggregate_id: string;
      status: string;
      payload: {
        schemaVersion: string;
        lifecycleEventId: string;
      };
      revision: number;
      event_kind: string;
    }>(
      `select o.event_type, o.aggregate_id, o.status, o.payload,
              e.revision, e.event_kind
         from outbox_events o
         inner join booking_lifecycle_events e on e.id = o.aggregate_id
        where e.booking_id = $1`,
      [results[0]?.booking.id]
    );
    expect(outbox.rows).toHaveLength(1);
    expect(outbox.rows[0]).toMatchObject({
      event_type: BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
      status: "pending",
      revision: 1,
      event_kind: "confirmed",
      payload: {
        schemaVersion: "booking-lifecycle-event-dispatch-request.v1",
        lifecycleEventId: expect.any(String)
      }
    });
    expect(outbox.rows[0]?.aggregate_id).toBe(outbox.rows[0]?.payload.lifecycleEventId);

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

  it("emits the canonical booking-confirmed event when a paid booking is confirmed", async () => {
    const fixture = await createFixture();
    const store = createDrizzleBookingCommandStore(runtime.database);
    const held = await store.executePaidHold(
      paidBookingHoldCommand(fixture.clientUserId, "paid-booking-confirmation", "p"),
      async () => ({
        ...bookingClaim(fixture, "2026-05-30T12:00:00Z", "2026-05-30T13:00:00Z"),
        holdExpiresAt: "2026-05-20T10:15:00.000Z"
      })
    );
    await runtime.pool.query(
      `update bookings
          set state = 'pending_payment', hold_expires_at = null
        where id = $1`,
      [held.booking.id]
    );
    await runtime.pool.query(
      `update schedule_reservations
          set kind = 'booking', source_aggregate_id = $1, hold_expires_at = null
        where id = $2`,
      [held.booking.id, held.booking.reservationId]
    );

    const confirmedAt = "2026-05-20T10:05:00.000Z";
    await expect(
      store.confirmPaidBooking({
        bookingId: held.booking.id,
        orderId: randomUUID(),
        now: confirmedAt
      })
    ).resolves.toMatchObject({
      id: held.booking.id,
      state: "confirmed",
      updatedAt: confirmedAt
    });

    const outbox = await runtime.pool.query<{
      event_type: string;
      aggregate_id: string;
      status: string;
      payload: {
        schemaVersion: string;
        lifecycleEventId: string;
      };
      revision: number;
      event_kind: string;
    }>(
      `select o.event_type, o.aggregate_id, o.status, o.payload,
              e.revision, e.event_kind
         from outbox_events o
         inner join booking_lifecycle_events e on e.id = o.aggregate_id
        where e.booking_id = $1`,
      [held.booking.id]
    );
    expect(outbox.rows).toEqual([
      expect.objectContaining({
        event_type: BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
        status: "pending",
        revision: 1,
        event_kind: "confirmed",
        payload: {
          schemaVersion: "booking-lifecycle-event-dispatch-request.v1",
          lifecycleEventId: expect.any(String)
        }
      })
    ]);
    expect(outbox.rows[0]?.aggregate_id).toBe(outbox.rows[0]?.payload.lifecycleEventId);
  });

  it("completes only a paid live booking after its service ends and emits one immutable outbox event", async () => {
    const fixture = await createFixture();
    const store = createDrizzleBookingCommandStore(runtime.database);
    const held = await store.executePaidHold(
      paidBookingHoldCommand(fixture.clientUserId, "paid-booking-completion", "q"),
      async () => ({
        ...bookingClaim(fixture, "2026-05-20T08:00:00Z", "2026-05-20T09:00:00Z"),
        holdExpiresAt: "2026-05-20T10:15:00.000Z"
      })
    );
    await runtime.pool.query(
      `update bookings set state = 'pending_payment', hold_expires_at = null where id = $1`,
      [held.booking.id]
    );
    await runtime.pool.query(
      `update schedule_reservations
          set kind = 'booking', source_aggregate_id = $1, hold_expires_at = null
        where id = $2`,
      [held.booking.id, held.booking.reservationId]
    );
    await store.confirmPaidBooking({
      bookingId: held.booking.id,
      orderId: randomUUID(),
      now: "2026-05-20T07:00:00.000Z"
    });
    const command = ownerCompleteBookingCommand(
      fixture.ownerUserId,
      "paid-booking-completion-command",
      "r",
      "2026-05-20T09:01:00.000Z"
    );

    await expect(
      store.executeOwnerCompletion(command, {
        bookingId: held.booking.id,
        expectedLifecycleRevision: 1
      })
    ).resolves.toMatchObject({
      kind: "created",
      booking: { state: "completed", lifecycleRevision: 2 },
      lifecycleEvent: { kind: "completed", revision: 2, occurredAt: command.now }
    });
    await expect(
      store.executeOwnerCompletion(command, {
        bookingId: held.booking.id,
        expectedLifecycleRevision: 1
      })
    ).resolves.toMatchObject({ kind: "replayed" });

    const history = await runtime.pool.query<{
      state: string;
      lifecycle_revision: number;
      event_kind: string;
      event_count: string;
    }>(
      `select b.state, b.lifecycle_revision, e.event_kind,
              (select count(*)::text from booking_lifecycle_events where booking_id = b.id) as event_count
         from bookings b
         join booking_lifecycle_events e
           on e.booking_id = b.id and e.revision = b.lifecycle_revision
        where b.id = $1`,
      [held.booking.id]
    );
    expect(history.rows).toEqual([
      { state: "completed", lifecycle_revision: 2, event_kind: "completed", event_count: "2" }
    ]);
  });

  it("atomically cancels a manual booking and fails paid cancellation closed", async () => {
    const fixture = await createFixture();
    const store = createDrizzleBookingCommandStore(runtime.database);
    const created = await store.executeManualBooking(
      bookingCommand(fixture.ownerUserId, "booking-cancel-source", "c"),
      async () => bookingClaim(fixture, "2026-06-02T10:00:00Z", "2026-06-02T11:00:00Z")
    );
    const command = ownerCancelBookingCommand(
      fixture.ownerUserId,
      "booking-cancel-command",
      "d"
    );

    const cancelled = await store.executeOwnerCancellation(command, {
      bookingId: created.booking.id,
      expectedLifecycleRevision: 1,
      reasonCode: "astrologer_unavailable"
    });
    await expect(
      store.executeOwnerCancellation(command, {
        bookingId: created.booking.id,
        expectedLifecycleRevision: 1,
        reasonCode: "astrologer_unavailable"
      })
    ).resolves.toEqual({ ...cancelled, kind: "replayed" });
    expect(cancelled).toMatchObject({
      kind: "created",
      booking: { state: "cancelled", lifecycleRevision: 2 },
      lifecycleEvent: {
        revision: 2,
        kind: "cancelled",
        reasonCode: "astrologer_unavailable"
      }
    });

    const persisted = await runtime.pool.query<{
      booking_state: string;
      lifecycle_revision: number;
      reservation_lifecycle: string;
      lifecycle_event_count: string;
      outbox_count: string;
    }>(
      `select b.state as booking_state,
              b.lifecycle_revision,
              r.lifecycle as reservation_lifecycle,
              (select count(*)::text from booking_lifecycle_events e
                where e.booking_id = b.id) as lifecycle_event_count,
              (select count(*)::text from outbox_events o
                inner join booking_lifecycle_events e on e.id = o.aggregate_id
                where e.booking_id = b.id) as outbox_count
         from bookings b
         inner join schedule_reservations r on r.id = b.reservation_id
        where b.id = $1`,
      [created.booking.id]
    );
    expect(persisted.rows[0]).toEqual({
      booking_state: "cancelled",
      lifecycle_revision: 2,
      reservation_lifecycle: "released",
      lifecycle_event_count: "2",
      outbox_count: "2"
    });

    await expect(
      store.executeOwnerCancellation(
        ownerCancelBookingCommand(fixture.ownerUserId, "booking-cancel-stale", "e"),
        {
          bookingId: created.booking.id,
          expectedLifecycleRevision: 1,
          reasonCode: "other"
        }
      )
    ).rejects.toBeInstanceOf(BookingLifecycleRevisionConflictError);

    const held = await store.executePaidHold(
      paidBookingHoldCommand(fixture.clientUserId, "paid-cancel-source", "f"),
      async () => ({
        ...bookingClaim(fixture, "2026-06-03T10:00:00Z", "2026-06-03T11:00:00Z"),
        holdExpiresAt: "2026-05-20T10:15:00.000Z"
      })
    );
    await runtime.pool.query(
      `update bookings set state = 'pending_payment', hold_expires_at = null where id = $1`,
      [held.booking.id]
    );
    await runtime.pool.query(
      `update schedule_reservations
          set kind = 'booking', source_aggregate_id = $1, hold_expires_at = null
        where id = $2`,
      [held.booking.id, held.booking.reservationId]
    );
    await store.confirmPaidBooking({
      bookingId: held.booking.id,
      orderId: randomUUID(),
      now: "2026-05-20T10:05:00.000Z"
    });
    await expect(
      store.executeOwnerCancellation(
        ownerCancelBookingCommand(fixture.ownerUserId, "paid-cancel-command", "g"),
        {
          bookingId: held.booking.id,
          expectedLifecycleRevision: 1,
          reasonCode: "client_request"
        }
      )
    ).rejects.toBeInstanceOf(BookingCancellationRequiresRefundAuthorityError);
  });

  it("moves the same confirmed booking reservation and persists one replayable reschedule event", async () => {
    const fixture = await createFixture();
    const store = createDrizzleBookingCommandStore(runtime.database);
    const created = await store.executeManualBooking(
      bookingCommand(fixture.ownerUserId, "booking-reschedule-source", "r"),
      async () => bookingClaim(fixture, "2026-06-04T10:00:00Z", "2026-06-04T11:00:00Z")
    );
    const command = ownerRescheduleBookingCommand(
      fixture.ownerUserId,
      "booking-reschedule-command",
      "s"
    );
    const claim = bookingRescheduleClaim(
      fixture,
      created.booking.id,
      created.booking.reservationId,
      1,
      "2026-06-04T12:00:00Z",
      "2026-06-04T13:00:00Z"
    );

    const moved = await store.executeOwnerReschedule(
      command,
      {
        bookingId: created.booking.id,
        expectedLifecycleRevision: 1,
        projectedStartAt: claim.serviceStartAt
      },
      async (context) => {
        expect(context.booking).toMatchObject({
          id: created.booking.id,
          reservationId: created.booking.reservationId,
          lifecycleRevision: 1,
          state: "confirmed"
        });
        expect(context.scheduleId).toBe(fixture.scheduleId);
        expect(context.availability.activeReservations).toEqual([]);
        expect(context.availability.confirmedBookingCountByLocalDate).toEqual({});
        return claim;
      }
    );
    await expect(
      store.executeOwnerReschedule(
        command,
        {
          bookingId: created.booking.id,
          expectedLifecycleRevision: 1,
          projectedStartAt: claim.serviceStartAt
        },
        async () => raise("Replay must not recompute availability")
      )
    ).resolves.toEqual({ ...moved, kind: "replayed" });
    expect(moved).toMatchObject({
      kind: "created",
      booking: {
        id: created.booking.id,
        reservationId: created.booking.reservationId,
        clientUserId: created.booking.clientUserId,
        productId: created.booking.productId,
        source: "manual",
        state: "confirmed",
        lifecycleRevision: 2,
        startAt: "2026-06-04T12:00:00.000Z",
        endAt: "2026-06-04T13:00:00.000Z",
        priceMinor: created.booking.priceMinor,
        policySnapshot: created.booking.policySnapshot
      },
      lifecycleEvent: {
        revision: 2,
        kind: "rescheduled",
        reasonCode: null,
        before: {
          startAt: "2026-06-04T10:00:00.000Z",
          endAt: "2026-06-04T11:00:00.000Z"
        },
        after: {
          startAt: "2026-06-04T12:00:00.000Z",
          endAt: "2026-06-04T13:00:00.000Z"
        }
      }
    });

    const persistence = await runtime.pool.query<{
      booking_revision: number;
      booking_start_at: Date;
      reservation_id: string;
      reservation_start_at: Date;
      lifecycle_event_count: string;
      outbox_count: string;
    }>(
      `select b.lifecycle_revision as booking_revision,
              b.service_start_at as booking_start_at,
              r.id as reservation_id,
              r.service_start_at as reservation_start_at,
              (select count(*)::text from booking_lifecycle_events e
                where e.booking_id = b.id) as lifecycle_event_count,
              (select count(*)::text from outbox_events o
                inner join booking_lifecycle_events e on e.id = o.aggregate_id
                where e.booking_id = b.id) as outbox_count
         from bookings b
         inner join schedule_reservations r on r.id = b.reservation_id
        where b.id = $1`,
      [created.booking.id]
    );
    expect(persistence.rows[0]).toEqual({
      booking_revision: 2,
      booking_start_at: new Date("2026-06-04T12:00:00Z"),
      reservation_id: created.booking.reservationId,
      reservation_start_at: new Date("2026-06-04T12:00:00Z"),
      lifecycle_event_count: "2",
      outbox_count: "2"
    });

    await expect(
      store.executeOwnerReschedule(
        ownerRescheduleBookingCommand(fixture.ownerUserId, "booking-reschedule-stale", "t"),
        {
          bookingId: created.booking.id,
          expectedLifecycleRevision: 1,
          projectedStartAt: "2026-06-04T14:00:00Z"
        },
        async () => claim
      )
    ).rejects.toBeInstanceOf(BookingLifecycleRevisionConflictError);

    const occupied = await store.executeManualBooking(
      bookingCommand(fixture.ownerUserId, "booking-reschedule-conflict-source", "u"),
      async () => bookingClaim(fixture, "2026-06-04T14:00:00Z", "2026-06-04T15:00:00Z")
    );
    await expect(
      store.executeOwnerReschedule(
        ownerRescheduleBookingCommand(fixture.ownerUserId, "booking-reschedule-conflict", "v"),
        {
          bookingId: created.booking.id,
          expectedLifecycleRevision: 2,
          projectedStartAt: "2026-06-04T14:00:00Z"
        },
        async () =>
          bookingRescheduleClaim(
            fixture,
            created.booking.id,
            created.booking.reservationId,
            2,
            "2026-06-04T14:00:00Z",
            "2026-06-04T15:00:00Z"
          )
      )
    ).rejects.toBeInstanceOf(SlotNoLongerAvailableError);
    await expect(
      store.findByOwnerAndId({ ownerUserId: fixture.ownerUserId, bookingId: created.booking.id })
    ).resolves.toMatchObject({ lifecycleRevision: 2, startAt: "2026-06-04T12:00:00.000Z" });
    expect(occupied.booking.state).toBe("confirmed");

    const held = await store.executePaidHold(
      paidBookingHoldCommand(fixture.clientUserId, "paid-reschedule-source", "w"),
      async () => ({
        ...bookingClaim(fixture, "2026-06-05T10:00:00Z", "2026-06-05T11:00:00Z"),
        holdExpiresAt: "2026-05-20T10:15:00.000Z"
      })
    );
    await runtime.pool.query(
      "update bookings set state = 'pending_payment', hold_expires_at = null where id = $1",
      [held.booking.id]
    );
    await runtime.pool.query(
      `update schedule_reservations
          set kind = 'booking', source_aggregate_id = $1, hold_expires_at = null
        where id = $2`,
      [held.booking.id, held.booking.reservationId]
    );
    const paid = await store.confirmPaidBooking({
      bookingId: held.booking.id,
      orderId: randomUUID(),
      now: "2026-05-20T10:05:00.000Z"
    });
    if (!paid) throw new Error("Expected paid booking confirmation");
    await expect(
      store.executeOwnerReschedule(
        ownerRescheduleBookingCommand(fixture.ownerUserId, "paid-reschedule-command", "x"),
        {
          bookingId: paid.id,
          expectedLifecycleRevision: 1,
          projectedStartAt: "2026-06-05T12:00:00Z"
        },
        async () =>
          bookingRescheduleClaim(
            fixture,
            paid.id,
            paid.reservationId,
            1,
            "2026-06-05T12:00:00Z",
            "2026-06-05T13:00:00Z"
          )
      )
    ).resolves.toMatchObject({
      booking: {
        id: paid.id,
        source: "client_paid",
        state: "confirmed",
        lifecycleRevision: 2,
        priceMinor: paid.priceMinor
      },
      lifecycleEvent: { kind: "rescheduled", revision: 2 }
    });
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
    const claim = manualBlockClaim(fixture, "2026-05-31T10:00:00Z", "2026-05-31T12:00:00Z");
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
      bookingStore.executeManualBooking(
        bookingCommand(fixture.ownerUserId, "booking-blocked", "4"),
        async () => bookingClaim(fixture, claim.startAt, "2026-05-31T11:00:00Z")
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
      bookingStore.executeManualBooking(
        bookingCommand(fixture.ownerUserId, "booking-after-release", "5"),
        async () => bookingClaim(fixture, claim.startAt, "2026-05-31T11:00:00Z")
      )
    ).resolves.toMatchObject({ kind: "created" });
  });

  it("returns owner-scoped booking and block entries with authoritative summaries", async () => {
    const fixture = await createFixture("Марина Краснова");
    const bookingStore = createDrizzleBookingCommandStore(runtime.database);
    const blockStore = createDrizzleManualBlockCommandStore(runtime.database);
    const readStore = createDrizzleCalendarReadStore(runtime.database);
    await bookingStore.executeManualBooking(
      bookingCommand(fixture.ownerUserId, "calendar-booking", "6"),
      async () => bookingClaim(fixture, "2026-06-01T10:00:00Z", "2026-06-01T11:00:00Z")
    );
    await blockStore.executeCreate(
      manualBlockCommand(fixture.ownerUserId, "calendar-block", "7"),
      async () => manualBlockClaim(fixture, "2026-06-01T12:00:00Z", "2026-06-01T14:00:00Z")
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
      currency: "RUB",
      clientDataRequirements: {
        schemaVersion: "booking-client-data-requirements.v1",
        executionMode: "live",
        participantMode: "solo",
        requiredClientData: ["chart1"],
        methods: ["natal"]
      }
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

function ownerCancelBookingCommand(
  actorUserId: string,
  key: string,
  hashCharacter: string
): OwnerCancelBookingCommand {
  return {
    actorUserId,
    scope: "bookings.owner.cancel",
    key,
    requestHash: digest(hashCharacter),
    now: "2026-05-20T11:00:00.000Z",
    expiresAt: "2026-05-21T11:00:00.000Z"
  };
}

function ownerRescheduleBookingCommand(
  actorUserId: string,
  key: string,
  hashCharacter: string
): OwnerRescheduleBookingCommand {
  return {
    actorUserId,
    scope: "bookings.owner.reschedule",
    key,
    requestHash: digest(hashCharacter),
    now: "2026-05-20T11:00:00.000Z",
    expiresAt: "2026-05-21T11:00:00.000Z"
  };
}

function ownerCompleteBookingCommand(
  actorUserId: string,
  key: string,
  hashCharacter: string,
  now: string
): OwnerCompleteBookingCommand {
  return {
    actorUserId,
    scope: "bookings.owner.complete",
    key,
    requestHash: digest(hashCharacter),
    now,
    expiresAt: "2026-05-21T09:01:00.000Z"
  };
}

function bookingRescheduleClaim(
  fixture: { readonly ownerUserId: string; readonly scheduleId: string },
  bookingId: string,
  reservationId: string,
  expectedLifecycleRevision: number,
  startAt: string,
  endAt: string
): BookingRescheduleClaim {
  return {
    ownerUserId: fixture.ownerUserId,
    bookingId,
    reservationId,
    scheduleId: fixture.scheduleId,
    expectedLifecycleRevision,
    serviceStartAt: startAt,
    serviceEndAt: endAt,
    occupiedStartAt: startAt,
    occupiedEndAt: endAt,
    scheduleSnapshot: {
      timeZone: "Europe/Moscow",
      policy: { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumNoticeMinutes: 0 }
    }
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
  return `sha256:${createHash("sha256").update(character).digest("hex")}`;
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
