import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AvailabilityStorePutDefaultInput } from "@elevenhouse/domain";
import { Client } from "pg";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleAvailabilityStore } from "./drizzle-availability-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_scheduling_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("availability Drizzle/PostgreSQL integration", () => {
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

  it("creates and replaces the complete default aggregate with optimistic ownership", async () => {
    const store = createDrizzleAvailabilityStore(runtime.database);
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    const productId = await createProduct(ownerUserId, "Consultation");
    const initial = scheduleInput(ownerUserId, productId, null);

    await expect(store.putDefault(initial)).resolves.toMatchObject({
      kind: "created",
      schedule: {
        ownerUserId,
        version: 1,
        weeklyPeriods: initial.weeklyPeriods,
        dateOverrides: initial.dateOverrides,
        productIds: [productId]
      }
    });
    const created = await store.findDefaultByOwner({ ownerUserId });
    expect(created).not.toBeNull();
    await expect(store.findDefaultByOwner({ ownerUserId: otherOwnerUserId })).resolves.toBeNull();

    const update = {
      ...scheduleInput(ownerUserId, productId, 1),
      startIntervalMinutes: 15,
      weeklyPeriods: [{ weekday: 3 as const, startMinute: 720, endMinute: 900 }],
      dateOverrides: [
        {
          date: "2026-05-29",
          mode: "available" as const,
          periods: [{ startMinute: 600, endMinute: 660 }]
        }
      ]
    };
    await expect(store.putDefault(update)).resolves.toMatchObject({
      kind: "updated",
      schedule: {
        id: created?.id,
        version: 2,
        startIntervalMinutes: 15,
        weeklyPeriods: update.weeklyPeriods,
        dateOverrides: update.dateOverrides
      }
    });
    await expect(store.putDefault(update)).resolves.toEqual({
      kind: "version_conflict",
      currentVersion: 2
    });
    await expect(
      store.replace({
        ...update,
        ownerUserId: otherOwnerUserId,
        scheduleId: created?.id ?? raise("Expected created schedule"),
        expectedVersion: 2
      })
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("rolls back parent and child changes when an owner-scoped assignment is invalid", async () => {
    const store = createDrizzleAvailabilityStore(runtime.database);
    const ownerUserId = await createUser();
    const foreignOwnerUserId = await createUser();
    const productId = await createProduct(ownerUserId, "Owned product");
    const foreignProductId = await createProduct(foreignOwnerUserId, "Foreign product");
    const created = await store.putDefault(scheduleInput(ownerUserId, productId, null));
    if (created.kind !== "created") throw new Error("Expected schedule creation");

    await expect(
      store.putDefault({
        ...scheduleInput(ownerUserId, foreignProductId, 1),
        startIntervalMinutes: 10
      })
    ).rejects.toThrow();
    await expect(store.findDefaultByOwner({ ownerUserId })).resolves.toMatchObject({
      version: 1,
      startIntervalMinutes: 30,
      productIds: [productId]
    });
  });

  it("hydrates active occupancy and confirmed counts in the schedule timezone", async () => {
    const store = createDrizzleAvailabilityStore(runtime.database);
    const ownerUserId = await createUser();
    const clientUserId = await createUser();
    const productId = await createProduct(ownerUserId, "Projection product");
    const created = await store.putDefault(scheduleInput(ownerUserId, productId, null));
    if (created.kind !== "created") throw new Error("Expected schedule creation");
    const reservationId = randomUUID();
    const bookingId = randomUUID();
    await runtime.pool.query(
      `insert into schedule_reservations
        (id, owner_user_id, schedule_id, kind, lifecycle, service_start_at,
         service_end_at, occupied_start_at, occupied_end_at, source_aggregate_id)
       values ($1, $2, $3, 'booking', 'active', $4, $5, $4, $5, $6)`,
      [
        reservationId,
        ownerUserId,
        created.schedule.id,
        "2026-05-28T21:30:00.000Z",
        "2026-05-28T22:30:00.000Z",
        bookingId
      ]
    );
    await runtime.pool.query(
      `insert into bookings
        (id, owner_user_id, client_user_id, product_id, reservation_id, state,
         service_start_at, service_end_at, product_title_snapshot,
         duration_minutes_snapshot, delivery_format_snapshot, price_minor_snapshot,
         currency_snapshot, time_zone_snapshot, policy_snapshot)
       values ($1, $2, $3, $4, $5, 'confirmed', $6, $7, 'Projection product',
         60, 'video', 490000, 'RUB', 'Europe/Moscow', $8)`,
      [
        bookingId,
        ownerUserId,
        clientUserId,
        productId,
        reservationId,
        "2026-05-28T21:30:00.000Z",
        "2026-05-28T22:30:00.000Z",
        { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minimumNoticeMinutes: 0 }
      ]
    );

    await expect(
      store.readProjectionContext({
        ownerUserId,
        scheduleId: created.schedule.id,
        rangeStartAt: "2026-05-28T20:00:00.000Z",
        rangeEndAt: "2026-05-29T00:00:00.000Z"
      })
    ).resolves.toMatchObject({
      schedule: { id: created.schedule.id },
      activeReservations: [
        {
          occupiedStartAt: "2026-05-28T21:30:00.000Z",
          occupiedEndAt: "2026-05-28T22:30:00.000Z"
        }
      ],
      confirmedBookingCountByLocalDate: { "2026-05-29": 1 }
    });
    await expect(
      store.readProjectionContext({
        ownerUserId: randomUUID(),
        scheduleId: created.schedule.id,
        rangeStartAt: "2026-05-28T20:00:00.000Z",
        rangeEndAt: "2026-05-29T00:00:00.000Z"
      })
    ).resolves.toBeNull();
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user id");
  }

  async function createProduct(ownerUserId: string, title: string): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      `insert into products
        (owner_user_id, type, status, title, price_minor, currency,
         execution_mode, payment_model, duration_minutes, participant_mode)
       values ($1, 'single', 'active', $2, 490000, 'RUB',
         'live', 'once', 60, 'solo')
       returning id`,
      [ownerUserId, title]
    );
    return result.rows[0]?.id ?? raise("Expected product id");
  }
});

function scheduleInput(
  ownerUserId: string,
  productId: string,
  expectedVersion: number | null
): AvailabilityStorePutDefaultInput {
  return {
    ownerUserId,
    expectedVersion,
    timeZone: "Europe/Moscow",
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
    now: "2026-05-20T10:00:00.000Z"
  };
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
