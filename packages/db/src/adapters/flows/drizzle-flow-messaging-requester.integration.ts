import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleFlowMessagingRequester } from "./drizzle-flow-messaging-requester";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const createdUserIds: string[] = [];
let runtime: PostgresRuntime;

describe("flow messaging requester Drizzle/PostgreSQL integration", () => {
  beforeAll(async () => {
    runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
    await runtime.pool.query("select 1");
  });

  afterEach(async () => {
    const userIds = createdUserIds.splice(0);
    if (userIds.length === 0) return;

    const client = await runtime.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `delete from outbox_events
         where aggregate_id in (
           select m.id
           from messages m
           inner join messaging_threads t on t.id = m.thread_id
           where t.astrologer_user_id = any($1)
         )`,
        [userIds]
      );
      await client.query(
        `delete from messages
         where thread_id in (
           select id from messaging_threads where astrologer_user_id = any($1)
         )`,
        [userIds]
      );
      await client.query(
        `delete from messaging_thread_identities
         where thread_id in (
           select id from messaging_threads where astrologer_user_id = any($1)
         )`,
        [userIds]
      );
      await client.query("delete from messaging_threads where astrologer_user_id = any($1)", [
        userIds
      ]);
      await client.query(
        "delete from messaging_external_identities where channel_connection_id in (select id from messaging_channel_connections where astrologer_user_id = any($1))",
        [userIds]
      );
      await client.query(
        "delete from messaging_channel_connections where astrologer_user_id = any($1)",
        [userIds]
      );
      await client.query("delete from users where id = any($1)", [userIds]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await runtime?.close();
  });

  it("routes through a send-capable active Instagram conversation without provider-specific Flow logic", async () => {
    const fixture = await createFixture({ provider: "instagram" });
    const requester = createDrizzleFlowMessagingRequester(runtime.database, {
      now: () => new Date("2026-08-07T12:00:00.000Z")
    });

    const result = await requester.prepare({
      ownerUserId: fixture.ownerUserId,
      clientUserId: fixture.clientUserId,
      runId: randomUUID(),
      tokenId: randomUUID(),
      nodeActivationSequence: 1n,
      textTemplate: "Напоминание о консультации"
    });

    expect(result).toMatchObject({ kind: "queued" });
    if (result.kind !== "queued") throw new Error("Expected queued flow message");

    await expect(
      runtime.pool.query("select channel_connection_id, status from messages where id = $1", [
        result.messageId
      ])
    ).resolves.toMatchObject({
      rows: [{ channel_connection_id: fixture.channelConnectionId, status: "queued" }]
    });
  });

  it("rejects an active conversation that does not permit outbound delivery", async () => {
    const fixture = await createFixture({ canSend: false });
    const requester = createDrizzleFlowMessagingRequester(runtime.database);

    await expect(
      requester.prepare({
        ownerUserId: fixture.ownerUserId,
        clientUserId: fixture.clientUserId,
        runId: randomUUID(),
        tokenId: randomUUID(),
        nodeActivationSequence: 1n,
        textTemplate: "Напоминание о консультации"
      })
    ).resolves.toEqual({ kind: "rejected" });

    await expect(
      runtime.pool.query("select count(*)::text as count from messages where thread_id = $1", [
        fixture.threadId
      ])
    ).resolves.toMatchObject({ rows: [{ count: "0" }] });
  });
});

async function createFixture(
  input: { readonly canSend?: boolean; readonly provider?: "telegram" | "instagram" } = {}
) {
  const ownerUserId = await createUser();
  const clientUserId = await createUser();
  const channelConnectionId = randomUUID();
  const externalIdentityId = randomUUID();
  const threadId = randomUUID();
  const now = "2026-08-07T12:00:00.000Z";
  const provider = input.provider ?? "telegram";
  const mode = provider === "instagram" ? "instagram_graph" : "telegram_business_bot";

  await runtime.pool.query(
    `insert into messaging_channel_connections
      (id, astrologer_user_id, provider, mode, status, external_account_id, capabilities, created_at, updated_at)
     values ($1, $2, $3, $4, 'active', $5, $6::jsonb, $7, $7)`,
    [
      channelConnectionId,
      ownerUserId,
      provider,
      mode,
      `business-${randomUUID()}`,
      JSON.stringify({ canSend: input.canSend ?? true }),
      now
    ]
  );
  await runtime.pool.query(
    `insert into messaging_external_identities
      (id, channel_connection_id, provider, provider_chat_id, link_status, first_seen_at, last_seen_at)
     values ($1, $2, $3, $4, 'linked', $5, $5)`,
    [externalIdentityId, channelConnectionId, provider, `chat-${randomUUID()}`, now]
  );
  await runtime.pool.query(
    `insert into messaging_threads
      (id, astrologer_user_id, client_user_id, status, unread_astrologer_count, created_at, updated_at)
     values ($1, $2, $3, 'open', 0, $4, $4)`,
    [threadId, ownerUserId, clientUserId, now]
  );
  await runtime.pool.query(
    `insert into messaging_thread_identities
      (thread_id, external_identity_id, provider, is_primary, created_at)
     values ($1, $2, $3, true, $4)`,
    [threadId, externalIdentityId, provider, now]
  );

  return { ownerUserId, clientUserId, channelConnectionId, threadId };
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
