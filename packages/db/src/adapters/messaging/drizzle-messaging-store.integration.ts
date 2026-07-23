import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleMessagingStore } from "./drizzle-messaging-store";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const createdUserIds: string[] = [];
let runtime: PostgresRuntime;

describe("messaging Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
    await runtime.pool.query("select 1");
  });

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await runtime.pool.query("delete from users where id = any($1)", [createdUserIds.splice(0)]);
    }
  });

  afterAll(async () => {
    await runtime?.close();
  });

  it("records one inbound provider message and one durable realtime event across a duplicate delivery", async () => {
    const fixture = await createFixture();
    const store = createDrizzleMessagingStore(runtime.database);
    const providerMessageId = `provider-${randomUUID()}`;
    const firstMessageId = randomUUID();

    await expect(
      store.recordInboundProviderMessage(inboundInput(fixture, firstMessageId, providerMessageId))
    ).resolves.toMatchObject({ kind: "created", message: { id: firstMessageId, status: "received" } });
    await expect(
      store.recordInboundProviderMessage(inboundInput(fixture, randomUUID(), providerMessageId))
    ).resolves.toMatchObject({ kind: "duplicate", message: { id: firstMessageId } });

    const messages = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from messages where thread_id = $1",
      [fixture.threadId]
    );
    const thread = await runtime.pool.query<{ unread_astrologer_count: number }>(
      "select unread_astrologer_count from messaging_threads where id = $1",
      [fixture.threadId]
    );
    const events = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from messaging_realtime_events where thread_id = $1",
      [fixture.threadId]
    );
    expect(messages.rows).toEqual([{ count: "1" }]);
    expect(thread.rows).toEqual([{ unread_astrologer_count: 1 }]);
    expect(events.rows).toEqual([{ count: "1" }]);
  });

  it("creates an outbound message and identifier-only delivery outbox event", async () => {
    const fixture = await createFixture();
    const store = createDrizzleMessagingStore(runtime.database);
    const messageId = randomUUID();
    const eventId = randomUUID();
    const occurredAt = "2026-07-22T10:00:00.000Z";

    await expect(
      store.createOutboundMessage({
        messageId,
        astrologerUserId: fixture.astrologerUserId,
        threadId: fixture.threadId,
        channelConnectionId: fixture.channelConnectionId,
        text: "Test outbound body",
        idempotencyKey: `outbound-${randomUUID()}`,
        requestHash: `sha256:${"a".repeat(64)}`,
        now: occurredAt,
        deliveryRequestedEvent: {
          id: eventId,
          type: "messaging.message.delivery_requested",
          occurredAt,
          payload: {
            messageId,
            threadId: fixture.threadId,
            channelConnectionId: fixture.channelConnectionId,
            astrologerUserId: fixture.astrologerUserId
          }
        }
      })
    ).resolves.toMatchObject({ id: messageId, direction: "outbound", status: "queued" });

    const outbox = await runtime.pool.query<{
      event_type: string;
      aggregate_id: string;
      payload: Record<string, unknown>;
    }>("select event_type, aggregate_id, payload from outbox_events where id = $1", [eventId]);
    expect(outbox.rows).toEqual([
      {
        event_type: "messaging.message.delivery_requested",
        aggregate_id: messageId,
        payload: {
          messageId,
          threadId: fixture.threadId,
          channelConnectionId: fixture.channelConnectionId,
          astrologerUserId: fixture.astrologerUserId
        }
      }
    ]);
    expect(JSON.stringify(outbox.rows[0]?.payload)).not.toContain("Test outbound body");
  });

  it("appends a bigint-cursor realtime event and rejects cross-owner thread access without mutation", async () => {
    const fixture = await createFixture();
    const store = createDrizzleMessagingStore(runtime.database);
    const event = await store.appendRealtimeEvent({
      astrologerUserId: fixture.astrologerUserId,
      type: "thread.updated",
      occurredAt: "2026-07-22T10:00:00.000Z",
      threadId: fixture.threadId,
      messageId: undefined,
      channelConnectionId: fixture.channelConnectionId,
      externalIdentityId: fixture.externalIdentityId
    });

    expect(event.eventId).toMatch(/^\d+$/);
    const listedAfterPreviousCursor = await runtime.pool.query<{ event_id: string }>(
      `select event_id::text as event_id
       from messaging_realtime_events
       where astrologer_user_id = $1 and event_id >= $2::bigint
       order by event_id`,
      [fixture.astrologerUserId, event.eventId]
    );
    expect(listedAfterPreviousCursor.rows).toEqual([{ event_id: event.eventId }]);

    await expect(
      store.findThreadForAstrologer({
        astrologerUserId: fixture.otherAstrologerUserId,
        threadId: fixture.threadId
      })
    ).resolves.toBeNull();
    await expect(
      store.markThreadRead({
        astrologerUserId: fixture.otherAstrologerUserId,
        threadId: fixture.threadId,
        now: "2026-07-22T10:01:00.000Z",
        realtimeEvent: {
          astrologerUserId: fixture.otherAstrologerUserId,
          type: "thread.updated",
          occurredAt: "2026-07-22T10:01:00.000Z",
          threadId: fixture.threadId,
          messageId: undefined,
          channelConnectionId: fixture.channelConnectionId,
          externalIdentityId: fixture.externalIdentityId
        }
      })
    ).rejects.toThrow("Messaging thread is not owned by the astrologer");

    const unchanged = await runtime.pool.query<{
      unread_astrologer_count: number;
      client_user_id: string | null;
    }>(
      "select unread_astrologer_count, client_user_id from messaging_threads where id = $1",
      [fixture.threadId]
    );
    expect(unchanged.rows).toEqual([{ unread_astrologer_count: 0, client_user_id: null }]);
  });
});

async function createFixture() {
  const astrologerUserId = await createUser();
  const otherAstrologerUserId = await createUser();
  const channelConnectionId = randomUUID();
  const externalIdentityId = randomUUID();
  const threadId = randomUUID();
  const timestamp = "2026-07-22T09:00:00.000Z";

  await runtime.pool.query(
    `insert into messaging_channel_connections
      (id, astrologer_user_id, provider, mode, status, capabilities, created_at, updated_at)
     values ($1, $2, 'telegram', 'telegram_business_bot', 'active', $3, $4, $4)`,
    [channelConnectionId, astrologerUserId, {}, timestamp]
  );
  await runtime.pool.query(
    `insert into messaging_external_identities
      (id, channel_connection_id, provider, provider_chat_id, link_status, first_seen_at, last_seen_at)
     values ($1, $2, 'telegram', $3, 'unlinked', $4, $4)`,
    [externalIdentityId, channelConnectionId, `chat-${randomUUID()}`, timestamp]
  );
  await runtime.pool.query(
    `insert into messaging_threads
      (id, astrologer_user_id, status, unread_astrologer_count, created_at, updated_at)
     values ($1, $2, 'open', 0, $3, $3)`,
    [threadId, astrologerUserId, timestamp]
  );
  await runtime.pool.query(
    `insert into messaging_thread_identities
      (thread_id, external_identity_id, provider, is_primary, created_at)
     values ($1, $2, 'telegram', true, $3)`,
    [threadId, externalIdentityId, timestamp]
  );

  return {
    astrologerUserId,
    otherAstrologerUserId,
    channelConnectionId,
    externalIdentityId,
    threadId
  };
}

function inboundInput(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  messageId: string,
  providerMessageId: string
) {
  const occurredAt = "2026-07-22T10:00:00.000Z";
  return {
    messageId,
    astrologerUserId: fixture.astrologerUserId,
    threadId: fixture.threadId,
    channelConnectionId: fixture.channelConnectionId,
    externalIdentityId: fixture.externalIdentityId,
    providerMessageId,
    text: "Test inbound body",
    now: occurredAt,
    receivedEvent: {
      astrologerUserId: fixture.astrologerUserId,
      type: "message.received" as const,
      occurredAt,
      threadId: fixture.threadId,
      messageId,
      channelConnectionId: fixture.channelConnectionId,
      externalIdentityId: fixture.externalIdentityId
    }
  };
}

async function createUser(): Promise<string> {
  const userId = randomUUID();
  createdUserIds.push(userId);
  await runtime.pool.query("insert into users (id, status) values ($1, 'active')", [userId]);
  return userId;
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}
