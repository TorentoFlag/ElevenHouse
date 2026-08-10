import { randomUUID } from "node:crypto";

import { type ChartExecutionProfile } from "@elevenhouse/contracts";
import {
  createBookingLifecycleEvent,
  FlowExecutionIntegrityError,
  type ChartCalculationCommandStore
} from "@elevenhouse/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import type { ElevenHouseDatabase } from "../../runtime";
import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { createDrizzleFlowNatalChartRequester } from "./drizzle-flow-natal-chart-requester";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_flow_natal_requester_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
const executionProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};
let runtime: {
  readonly pool: Pool;
  readonly database: ElevenHouseDatabase;
  readonly close: () => Promise<void>;
};

describe("Drizzle flow natal chart requester integration", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    const pool = new Pool({ connectionString: isolatedDatabaseUrl });
    runtime = {
      pool,
      database: drizzle(pool) as unknown as ElevenHouseDatabase,
      close: () => pool.end()
    };
  }, 30_000);

  beforeEach(async () => {
    await runtime.pool.query("DROP SCHEMA public CASCADE");
    await runtime.pool.query("CREATE SCHEMA public");
    await runtime.pool.query(readCurrentMigrationSql());
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime?.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  }, 30_000);

  it("fails closed when the client-astrologer relationship was archived after booking confirmation", async () => {
    const fixture = await createArchivedRelationshipFixture();
    const requester = createDrizzleFlowNatalChartRequester(runtime.database, {
      commandStore: {} as ChartCalculationCommandStore,
      executionProfile
    });

    await expect(
      requester.request({
        ownerUserId: fixture.ownerUserId,
        bookingId: fixture.bookingId,
        clientUserId: fixture.clientUserId,
        interpretationMode: "adult_natal",
        settings: {
          zodiac: "tropical",
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).rejects.toMatchObject({
      code: "FLOW_TOKEN_RUNTIME_STATE_INVALID"
    } satisfies Partial<FlowExecutionIntegrityError>);
  });
});

async function createArchivedRelationshipFixture(): Promise<{
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly bookingId: string;
}> {
  const ownerUserId = randomUUID();
  const clientUserId = randomUUID();
  const bookingId = randomUUID();
  const productId = randomUUID();
  const startAt = "2026-08-10T10:00:00.000Z";
  const endAt = "2026-08-10T11:00:00.000Z";
  const lifecycleEvent = createBookingLifecycleEvent({
    id: randomUUID(),
    bookingId,
    ownerUserId,
    revision: 1,
    kind: "confirmed",
    actor: { kind: "system", userId: null },
    reasonCode: null,
    before: null,
    after: { startAt, endAt, timeZone: "Europe/Moscow" },
    occurredAt: "2026-08-10T09:00:00.000Z"
  });
  const client = await runtime.pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("insert into users (id, status) values ($1, 'active'), ($2, 'active')", [
      ownerUserId,
      clientUserId
    ]);
    await client.query(
      `insert into products
      (id, owner_user_id, type, status, title, price_minor, currency,
       execution_mode, payment_model, duration_minutes, participant_mode)
     values ($1, $2, 'single', 'active', 'Natal consultation', 10000, 'RUB',
       'live', 'once', 60, 'solo')`,
      [productId, ownerUserId]
    );
    const schedule = await client.query<{ id: string }>(
      `insert into availability_schedules
      (owner_user_id, name, time_zone, is_default, version, start_interval_minutes,
       buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days)
     values ($1, 'Default', 'Europe/Moscow', true, 1, 30, 0, 0, 0, 60)
     returning id`,
      [ownerUserId]
    );
    const scheduleId = schedule.rows[0]?.id;
    if (!scheduleId) throw new Error("Expected schedule id");
    const reservation = await client.query<{ id: string }>(
      `insert into schedule_reservations
      (owner_user_id, schedule_id, kind, lifecycle, service_start_at, service_end_at,
       occupied_start_at, occupied_end_at, source_aggregate_id)
     values ($1, $2, 'booking', 'active', $3, $4, $3, $4, $5)
     returning id`,
      [ownerUserId, scheduleId, startAt, endAt, bookingId]
    );
    const reservationId = reservation.rows[0]?.id;
    if (!reservationId) throw new Error("Expected reservation id");
    await client.query(
      `insert into bookings
      (id, owner_user_id, client_user_id, product_id, reservation_id, source, state,
       lifecycle_revision, service_start_at, service_end_at, product_title_snapshot,
       duration_minutes_snapshot, delivery_format_snapshot, price_minor_snapshot,
       currency_snapshot, time_zone_snapshot, policy_snapshot, client_data_requirements_snapshot)
     values ($1, $2, $3, $4, $5, 'manual', 'confirmed', 1, $6, $7,
       'Natal consultation', 60, 'video', 10000, 'RUB', 'Europe/Moscow', '{}'::jsonb, $8::jsonb)`,
      [
        bookingId,
        ownerUserId,
        clientUserId,
        productId,
        reservationId,
        startAt,
        endAt,
        JSON.stringify({
          schemaVersion: "booking-client-data-requirements.v1",
          executionMode: "live",
          participantMode: "solo",
          requiredClientData: ["chart1"],
          methods: ["natal"]
        })
      ]
    );
    await client.query(
      `insert into booking_lifecycle_events
        (id, booking_id, owner_user_id, revision, event_kind, actor_kind,
         actor_user_id, reason_code, before_start_at, before_end_at, before_time_zone,
         after_start_at, after_end_at, after_time_zone, canonical_digest, occurred_at,
         created_at)
       values ($1, $2, $3, 1, 'confirmed', 'system', null, null, null, null, null,
         $4, $5, $6, $7, $8, $8)`,
      [
        lifecycleEvent.id,
        bookingId,
        ownerUserId,
        startAt,
        endAt,
        "Europe/Moscow",
        lifecycleEvent.canonicalDigest,
        lifecycleEvent.occurredAt
      ]
    );
    await client.query(
      `insert into client_astrologer_relationships
      (client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at,
       archived_at, created_at, updated_at)
     values ($1, $2, 'booking', 'archived', transaction_timestamp(), transaction_timestamp(),
       transaction_timestamp(), transaction_timestamp(), transaction_timestamp())`,
      [clientUserId, ownerUserId]
    );
    await client.query(
      `insert into client_birth_data
      (client_user_id, birth_date, birth_time, birth_time_precision, birth_place_text,
       birth_country_code, birth_city, birth_timezone, birth_latitude, birth_longitude,
       source, revision, last_edited_by_user_id, last_edited_by_role)
     values ($1, '1990-02-02', '12:00', 'exact', 'Moscow', 'RU', 'Moscow',
       'Europe/Moscow', 55.7558, 37.6173, 'client_profile', 1, $1, 'client')`,
      [clientUserId]
    );

    await client.query("COMMIT");
    return { ownerUserId, clientUserId, bookingId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required");
  assertDevelopmentDatabaseUrl(value);
  return value;
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}
