import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { SessionMessageOperationConflictError } from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { createDrizzleSessionCommandStore } from "./drizzle-session-command-store";
import { createDrizzleSessionLifecycleStore } from "./drizzle-session-provisioning-store";
import { createDrizzleSessionReadStore } from "./drizzle-session-read-store";

const integrationDatabaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const databaseName = `elevenhouse_sessions_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = withDatabaseName(integrationDatabaseUrl, databaseName);
const adminClient = new Client({ connectionString: integrationDatabaseUrl });
let runtime: PostgresRuntime;

describe("Session Drizzle/PostgreSQL stores", () => {
  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });
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

  it("authorizes only the exact Session participant and keeps provider identifiers server-side", async () => {
    const fixture = await createFixture();
    const store = createDrizzleSessionCommandStore(runtime.database);

    await expect(
      store.issueJoin({
        actor: { userId: fixture.ownerUserId, role: "astrologer" },
        sessionId: fixture.sessionId,
        now: "2026-08-13T09:50:00.000Z"
      })
    ).resolves.toEqual({
      kind: "authorized",
      sessionId: fixture.sessionId,
      providerRoomName: fixture.providerRoomName,
      providerParticipantId: fixture.ownerParticipantId,
      participantRole: "astrologer",
      participantDisplayName: "Анна Смирнова"
    });

    await expect(
      store.issueJoin({
        actor: { userId: fixture.clientUserId, role: "astrologer" },
        sessionId: fixture.sessionId,
        now: "2026-08-13T09:50:00.000Z"
      })
    ).resolves.toEqual({ kind: "denied", reason: "not_found" });
  });

  it("deduplicates provider delivery, activates the Session and exposes an IDs-only replay event", async () => {
    const fixture = await createFixture();
    const commands = createDrizzleSessionCommandStore(runtime.database);
    const reads = createDrizzleSessionReadStore(runtime.database);
    const event = {
      id: randomUUID(),
      kind: "participant_joined" as const,
      roomName: fixture.providerRoomName,
      participantId: fixture.ownerParticipantId,
      occurredAt: "2026-08-13T09:55:00.000Z"
    };

    await expect(
      commands.applyProviderEvent({ event, payloadDigest: digest("join"), receivedAt: event.occurredAt })
    ).resolves.toEqual({ kind: "applied", state: "active" });
    await expect(
      commands.applyProviderEvent({ event, payloadDigest: digest("join"), receivedAt: event.occurredAt })
    ).resolves.toEqual({ kind: "replayed", state: "active" });

    await expect(
      reads.listRealtimeEvents({
        actor: { userId: fixture.clientUserId, role: "client" },
        sessionId: fixture.sessionId,
        afterEventId: undefined,
        limit: 20
      })
    ).resolves.toEqual({
      events: [
        {
          eventId: "1",
          sessionId: fixture.sessionId,
          type: "session.updated",
          occurredAt: event.occurredAt,
          messageId: null,
          state: "active"
        }
      ]
    });
  });

  it("persists one ordered chat message per actor operation and rejects changed reuse", async () => {
    const fixture = await createFixture();
    const commands = createDrizzleSessionCommandStore(runtime.database);
    const reads = createDrizzleSessionReadStore(runtime.database);
    await commands.applyProviderEvent({
      event: {
        id: randomUUID(),
        kind: "participant_joined",
        roomName: fixture.providerRoomName,
        participantId: fixture.clientParticipantId,
        occurredAt: "2026-08-13T09:55:00.000Z"
      },
      payloadDigest: digest("activate"),
      receivedAt: "2026-08-13T09:55:00.000Z"
    });
    const operationId = randomUUID();
    const input = {
      actor: { userId: fixture.clientUserId, role: "client" as const },
      sessionId: fixture.sessionId,
      operationId,
      requestHash: digest("message-a"),
      text: "Здравствуйте!",
      now: "2026-08-13T09:56:00.000Z"
    };

    const created = await commands.recordMessage(input);
    await expect(commands.recordMessage(input)).resolves.toEqual({
      kind: "replayed",
      message: created.message
    });
    await expect(
      commands.recordMessage({ ...input, requestHash: digest("message-b"), text: "Другой текст" })
    ).rejects.toBeInstanceOf(SessionMessageOperationConflictError);
    await expect(
      reads.listMessages({
        actor: input.actor,
        sessionId: fixture.sessionId,
        afterSequence: "0",
        limit: 50
      })
    ).resolves.toEqual({ messages: [created.message], nextAfterSequence: null });
  });

  it("projects each immutable Booking lifecycle event once without competing for the Flow outbox", async () => {
    const fixture = await createFixture();
    await runtime.pool.query("delete from sessions where id = $1", [fixture.sessionId]);
    const store = createDrizzleSessionLifecycleStore(runtime.database);

    await expect(
      store.processPending({ now: "2026-08-13T09:00:00.000Z", limit: 100 })
    ).resolves.toMatchObject({ processed: expect.any(Number), provisioned: expect.any(Number) });
    const projected = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from sessions where booking_id = $1",
      [fixture.bookingId]
    );
    expect(projected.rows).toEqual([{ count: "1" }]);
    await expect(
      store.processPending({ now: "2026-08-13T09:01:00.000Z", limit: 100 })
    ).resolves.toEqual({ processed: 0, provisioned: 0, updated: 0, ignored: 0 });
  });

  it("expires never-started Sessions and ends active Sessions after both participants are absent", async () => {
    const scheduled = await createFixture();
    const active = await createFixture();
    await runtime.pool.query(
      "update sessions set state = 'active', started_at = $2, lifecycle_revision = 2 where id = $1",
      [active.sessionId, "2026-08-13T09:55:00.000Z"]
    );
    await runtime.pool.query(
      `update session_participants
          set presence_state = 'absent', presence_updated_at = $2
        where session_id = $1`,
      [active.sessionId, "2026-08-13T11:00:00.000Z"]
    );
    const store = createDrizzleSessionLifecycleStore(runtime.database);

    await expect(
      store.expireScheduled({ now: "2026-08-13T11:30:00.000Z", limit: 100 })
    ).resolves.toContain(scheduled.sessionId);
    await expect(
      store.endAbsentActive({
        now: "2026-08-13T11:30:00.000Z",
        absentBefore: "2026-08-13T11:15:00.000Z",
        limit: 100
      })
    ).resolves.toContain(active.sessionId);
  });

  async function createFixture() {
    const ownerUserId = await createUser();
    const clientUserId = await createUser();
    await runtime.pool.query(
      `insert into astrologer_profiles
        (owner_user_id, public_handle, public_name, timezone, locale, consultation_languages)
       values ($1, $2, 'Анна Смирнова', 'Europe/Moscow', 'ru', '["ru"]'::jsonb)`,
      [ownerUserId, `anna-${randomUUID().slice(0, 8)}`]
    );
    await runtime.pool.query(
      "insert into client_profiles (user_id, display_name_snapshot) values ($1, 'Марина К')",
      [clientUserId]
    );
    await runtime.pool.query(
      `insert into client_astrologer_relationships
        (client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at)
       values ($1, $2, 'direct_link', 'active', $3, $3)`,
      [clientUserId, ownerUserId, "2026-08-01T00:00:00.000Z"]
    );
    const productId = rowId(
      await runtime.pool.query<{ id: string }>(
        `insert into products
          (owner_user_id, type, status, title, price_minor, currency,
           execution_mode, payment_model, duration_minutes, participant_mode)
         values ($1, 'single', 'active', 'Натальная консультация', 490000, 'RUB',
           'live', 'once', 60, 'solo') returning id`,
        [ownerUserId]
      )
    );
    const scheduleId = rowId(
      await runtime.pool.query<{ id: string }>(
        `insert into availability_schedules
          (owner_user_id, name, time_zone, start_interval_minutes, booking_horizon_days)
         values ($1, 'Default', 'Europe/Moscow', 30, 365) returning id`,
        [ownerUserId]
      )
    );
    const reservationId = randomUUID();
    const bookingId = randomUUID();
    await runtime.pool.query(
      `insert into schedule_reservations
        (id, owner_user_id, schedule_id, kind, lifecycle, service_start_at, service_end_at,
         occupied_start_at, occupied_end_at, source_aggregate_id)
       values ($1, $2, $3, 'booking', 'active', $4, $5, $4, $5, $6)`,
      [
        reservationId,
        ownerUserId,
        scheduleId,
        "2026-08-13T10:00:00.000Z",
        "2026-08-13T11:00:00.000Z",
        bookingId
      ]
    );
    const fixtureClient = await runtime.pool.connect();
    try {
      await fixtureClient.query("begin");
      await fixtureClient.query(
        `insert into bookings
          (id, owner_user_id, client_user_id, product_id, reservation_id, source, state,
           lifecycle_revision, service_start_at, service_end_at, product_title_snapshot,
           duration_minutes_snapshot, delivery_format_snapshot, price_minor_snapshot,
           currency_snapshot, time_zone_snapshot, policy_snapshot, client_data_requirements_snapshot)
         values ($1, $2, $3, $4, $5, 'manual', 'confirmed', 1, $6, $7,
           'Натальная консультация', 60, 'video', 490000, 'RUB', 'Europe/Moscow',
           '{"bufferBeforeMinutes":0,"bufferAfterMinutes":0,"minimumNoticeMinutes":0}'::jsonb,
           '{"schemaVersion":"booking-client-data-requirements.v1","executionMode":"live","participantMode":"solo","requiredClientData":[],"methods":[]}'::jsonb)`,
        [
          bookingId,
          ownerUserId,
          clientUserId,
          productId,
          reservationId,
          "2026-08-13T10:00:00.000Z",
          "2026-08-13T11:00:00.000Z"
        ]
      );
      await fixtureClient.query(
        `insert into booking_lifecycle_events
          (id, booking_id, owner_user_id, revision, event_kind, actor_kind, actor_user_id,
           after_start_at, after_end_at, after_time_zone, canonical_digest, occurred_at)
         values ($1, $2, $3, 1, 'confirmed', 'astrologer', $3, $4, $5,
           'Europe/Moscow', $6, $7)`,
        [
          randomUUID(),
          bookingId,
          ownerUserId,
          "2026-08-13T10:00:00.000Z",
          "2026-08-13T11:00:00.000Z",
          digest("booking-confirmed"),
          "2026-08-01T00:00:00.000Z"
        ]
      );
      await fixtureClient.query("commit");
    } catch (error) {
      await fixtureClient.query("rollback");
      throw error;
    } finally {
      fixtureClient.release();
    }
    const sessionId = randomUUID();
    const providerRoomName = `session_${randomUUID().replaceAll("-", "")}`;
    await runtime.pool.query(
      `insert into sessions
        (id, booking_id, owner_user_id, client_user_id, state, lifecycle_revision,
         scheduled_start_at, scheduled_end_at, time_zone_snapshot, product_title_snapshot,
         provider, provider_room_name)
       values ($1, $2, $3, $4, 'scheduled', 1, $5, $6, 'Europe/Moscow',
         'Натальная консультация', 'livekit', $7)`,
      [
        sessionId,
        bookingId,
        ownerUserId,
        clientUserId,
        "2026-08-13T10:00:00.000Z",
        "2026-08-13T11:00:00.000Z",
        providerRoomName
      ]
    );
    const ownerParticipantId = randomUUID();
    const clientParticipantId = randomUUID();
    await runtime.pool.query(
      `insert into session_participants
        (session_id, user_id, role, provider_participant_id, display_name_snapshot)
       values ($1, $2, 'astrologer', $3, 'Анна Смирнова'),
              ($1, $4, 'client', $5, 'Марина К')`,
      [sessionId, ownerUserId, ownerParticipantId, clientUserId, clientParticipantId]
    );
    return {
      ownerUserId,
      clientUserId,
      bookingId,
      sessionId,
      providerRoomName,
      ownerParticipantId,
      clientParticipantId
    };
  }

  async function createUser(): Promise<string> {
    return rowId(await runtime.pool.query<{ id: string }>("insert into users default values returning id"));
  }
});

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function rowId(result: { readonly rows: readonly { readonly id: string }[] }): string {
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Expected inserted id");
  return id;
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run Session integration tests against");
}

function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
