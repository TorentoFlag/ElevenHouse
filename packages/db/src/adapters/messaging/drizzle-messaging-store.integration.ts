import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime, type PostgresRuntime } from "../../runtime";
import { createDrizzleMessagingMediaIngestionProcessingStore } from "./drizzle-messaging-media-ingestion-processing-store";
import { createDrizzleMessagingReadStore } from "./drizzle-messaging-read-store";
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
      const userIds = createdUserIds.splice(0);
      const client = await runtime.pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `delete from messaging_realtime_events
           where astrologer_user_id = any($1)`,
          [userIds]
        );
        await client.query(
          `delete from outbox_events
           where aggregate_id in (
             select id from messages
             where channel_connection_id in (
               select id from messaging_channel_connections where astrologer_user_id = any($1)
             )
          )`,
          [userIds]
        );
        await client.query(
          `delete from message_media_ingestions
           where message_id in (
             select id from messages
             where channel_connection_id in (
               select id from messaging_channel_connections where astrologer_user_id = any($1)
             )
          )`,
          [userIds]
        );
        await client.query(
          `delete from messages
           where channel_connection_id in (
             select id from messaging_channel_connections where astrologer_user_id = any($1)
           )`,
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

  it("emits a first-inbound-message Flow outbox event for the first linked client inbound only", async () => {
    const fixture = await createFixture();
    const clientUserId = await createUser();
    const relationshipId = randomUUID();
    await runtime.pool.query(
      `insert into client_astrologer_relationships (
         id, client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at
       ) values ($1, $2, $3, 'manual', 'active', '2026-07-22T09:00:00.000Z', '2026-07-22T09:00:00.000Z')`,
      [relationshipId, clientUserId, fixture.astrologerUserId]
    );
    await runtime.pool.query(
      "update messaging_threads set client_user_id = $1 where id = $2",
      [clientUserId, fixture.threadId]
    );
    const store = createDrizzleMessagingStore(runtime.database);
    const firstMessageId = randomUUID();

    await store.recordInboundProviderMessage(
      inboundInput(fixture, firstMessageId, `provider-${randomUUID()}`)
    );
    await store.recordInboundProviderMessage(
      inboundInput(fixture, randomUUID(), `provider-${randomUUID()}`)
    );

    const outbox = await runtime.pool.query<{
      aggregate_id: string;
      payload: {
        eventKind: string;
        subjectId: string;
        payload: { messageId: string; relationshipId: string };
      };
    }>(
      `select aggregate_id, payload
         from outbox_events
        where event_type = 'flows.first_inbound_message.enrollment_requested.v1'`
    );
    expect(outbox.rows).toMatchObject([
      {
        aggregate_id: clientUserId,
        payload: {
          eventKind: "first_inbound_message",
          subjectId: clientUserId,
          payload: { messageId: firstMessageId, relationshipId }
        }
      }
    ]);
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

  it("records Telegram Business connection changes as durable realtime events", async () => {
    const fixture = await createFixture();
    const store = createDrizzleMessagingStore(runtime.database);
    const occurredAt = "2026-07-22T10:01:00.000Z";

    await expect(
      store.recordTelegramBusinessConnection({
        businessConnectionId: fixture.businessConnectionId,
        userId: "987654321",
        userChatId: "123456789",
        username: "alisa_astro",
        displayName: "Alisa",
        connectedAt: occurredAt,
        enabled: true,
        rights: {
          canReply: true,
          canReadMessages: true,
          canDeleteSentMessages: true,
          canDeleteAllMessages: false,
          canEditName: false,
          canEditBio: false,
          canEditProfilePhoto: false,
          canEditUsername: false,
          canChangeGiftSettings: false,
          canViewGiftsAndStars: false,
          canConvertGiftsToStars: false,
          canTransferAndUpgradeGifts: false,
          canTransferStars: false,
          canManageStories: false
        },
        now: occurredAt
      })
    ).resolves.toEqual({ kind: "recorded" });

    const events = await runtime.pool.query<{
      type: string;
      astrologer_user_id: string;
      channel_connection_id: string | null;
      thread_id: string | null;
      message_id: string | null;
      external_identity_id: string | null;
    }>(
      `select type, astrologer_user_id, channel_connection_id, thread_id, message_id, external_identity_id
       from messaging_realtime_events
       where astrologer_user_id = $1 and type = 'channelConnection.updated'
       order by event_id desc
       limit 1`,
      [fixture.astrologerUserId]
    );

    expect(events.rows).toEqual([
      {
        type: "channelConnection.updated",
        astrologer_user_id: fixture.astrologerUserId,
        channel_connection_id: fixture.channelConnectionId,
        thread_id: null,
        message_id: null,
        external_identity_id: null
      }
    ]);
  });

  it("records Telegram Business voice messages and exposes voice content type in the read model", async () => {
    const fixture = await createFixture();
    const store = createDrizzleMessagingStore(runtime.database);
    const providerMessageId = `provider-${randomUUID()}`;

    await expect(
      store.recordTelegramBusinessMessage({
        updateId: "1008",
        businessConnectionId: fixture.businessConnectionId,
        providerMessageId,
        providerChatId: fixture.providerChatId,
        providerUserId: "telegram-client-1",
        username: "marina",
        displayName: "Marina",
        chatUsername: "marina",
        chatDisplayName: "Marina",
        contentType: "voice",
        text: "Голосовое сообщение (0:12)",
        mediaAttachment: {
          kind: "voice",
          providerFileId: `voice-file-${randomUUID()}`,
          providerFileUniqueId: `voice-unique-${randomUUID()}`,
          durationSeconds: 12,
          width: null,
          height: null,
          providerMimeType: "audio/ogg",
          providerSizeBytes: 3210
        },
        providerSentAt: "2026-07-22T10:02:00.000Z",
        now: "2026-07-22T10:02:01.000Z"
      })
    ).resolves.toMatchObject({
      kind: "created",
      message: { text: "Голосовое сообщение (0:12)", status: "received" }
    });

    const messages = await runtime.pool.query<{
      id: string;
      content_type: string;
      text: string;
    }>(
      "select id, content_type, text from messages where provider_message_id = $1",
      [providerMessageId]
    );
    expect(messages.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content_type: "voice",
          text: "Голосовое сообщение (0:12)"
        })
      ])
    );
    const messageId = messages.rows[0]?.id;
    expect(messageId).toBeDefined();
    const ingestions = await runtime.pool.query<{
      message_id: string;
      download_status: string;
      provider_mime_type: string | null;
      provider_size_bytes: number | null;
      duration_seconds: number | null;
      width: number | null;
      height: number | null;
    }>(
      `select message_id, download_status, provider_mime_type, provider_size_bytes, duration_seconds, width, height
       from message_media_ingestions
       where message_id = $1`,
      [messageId]
    );
    expect(ingestions.rows).toEqual([
      {
        message_id: messageId,
        download_status: "pending",
        provider_mime_type: "audio/ogg",
        provider_size_bytes: 3210,
        duration_seconds: 12,
        width: null,
        height: null
      }
    ]);

    await expect(
      createDrizzleMessagingReadStore(runtime.database).getThread({
        astrologerUserId: fixture.astrologerUserId,
        threadId: fixture.threadId,
        offset: 0
      })
    ).resolves.toMatchObject({
      thread: {
        lastMessage: {
          contentType: "voice",
          text: "Голосовое сообщение (0:12)",
          media: {
            kind: "voice",
            status: "pending",
            durationSeconds: 12,
            width: null,
            height: null,
            mimeType: "audio/ogg",
            sizeBytes: 3210
          }
        }
      },
      messages: [
        {
          contentType: "voice",
          text: "Голосовое сообщение (0:12)",
          media: {
            kind: "voice",
            status: "pending",
            durationSeconds: 12,
            width: null,
            height: null,
            mimeType: "audio/ogg",
            sizeBytes: 3210
          }
        }
      ]
    });
  });

  it("records Telegram Business image media metadata and exposes it in the read model", async () => {
    const fixture = await createFixture();
    const store = createDrizzleMessagingStore(runtime.database);
    const providerMessageId = `provider-${randomUUID()}`;

    await expect(
      store.recordTelegramBusinessMessage({
        updateId: "1011",
        businessConnectionId: fixture.businessConnectionId,
        providerMessageId,
        providerChatId: fixture.providerChatId,
        providerUserId: "telegram-client-1",
        username: "marina",
        displayName: "Marina",
        chatUsername: "marina",
        chatDisplayName: "Marina",
        contentType: "image",
        text: "Фото карты",
        mediaAttachment: {
          kind: "image",
          providerFileId: `image-file-${randomUUID()}`,
          providerFileUniqueId: `image-unique-${randomUUID()}`,
          durationSeconds: null,
          width: 1280,
          height: 720,
          providerMimeType: null,
          providerSizeBytes: 98765
        },
        providerSentAt: "2026-07-22T10:02:30.000Z",
        now: "2026-07-22T10:02:31.000Z"
      })
    ).resolves.toMatchObject({
      kind: "created",
      message: { text: "Фото карты", status: "received" }
    });

    await expect(
      createDrizzleMessagingReadStore(runtime.database).getThread({
        astrologerUserId: fixture.astrologerUserId,
        threadId: fixture.threadId,
        offset: 0
      })
    ).resolves.toMatchObject({
      thread: {
        lastMessage: {
          contentType: "image",
          text: "Фото карты",
          media: {
            kind: "image",
            status: "pending",
            durationSeconds: null,
            width: 1280,
            height: 720,
            mimeType: null,
            sizeBytes: 98765
          }
        }
      },
      messages: expect.arrayContaining([
        expect.objectContaining({
          contentType: "image",
          media: expect.objectContaining({
            kind: "image",
            width: 1280,
            height: 720
          })
        })
      ])
    });
  });

  it("claims and completes pending message media ingestion atomically", async () => {
    const fixture = await createFixture();
    const store = createDrizzleMessagingStore(runtime.database);
    const processingStore = createDrizzleMessagingMediaIngestionProcessingStore(runtime.database);
    const providerMessageId = `provider-${randomUUID()}`;
    const mediaAssetId = randomUUID();

    await store.recordTelegramBusinessMessage({
      updateId: "1009",
      businessConnectionId: fixture.businessConnectionId,
      providerMessageId,
      providerChatId: fixture.providerChatId,
      providerUserId: "telegram-client-1",
      username: "marina",
      displayName: "Marina",
      chatUsername: "marina",
      chatDisplayName: "Marina",
      contentType: "voice",
      text: "Голосовое сообщение (0:09)",
      mediaAttachment: {
        kind: "voice",
        providerFileId: "voice-file-id",
        providerFileUniqueId: "voice-file-unique-id",
        durationSeconds: 9,
        width: null,
        height: null,
        providerMimeType: "audio/ogg",
        providerSizeBytes: 2048
      },
      providerSentAt: "2026-07-22T10:03:00.000Z",
      now: "2026-07-22T10:03:01.000Z"
    });
    const ingestion = await runtime.pool.query<{ id: string; message_id: string }>(
      `select id, message_id
       from message_media_ingestions
       where provider_file_id = 'voice-file-id'`
    );
    const ingestionId = ingestion.rows[0]!.id;
    const messageId = ingestion.rows[0]!.message_id;

    await expect(
      processingStore.listDueIds({
        now: new Date("2026-07-22T10:03:02.000Z"),
        limit: 10
      })
    ).resolves.toContain(ingestionId);

    await expect(
      processingStore.claimDueById({
        ingestionId,
        now: new Date("2026-07-22T10:03:02.000Z")
      })
    ).resolves.toMatchObject({
      ingestionId,
      messageId,
      channelConnectionId: fixture.channelConnectionId,
      astrologerUserId: fixture.astrologerUserId,
      provider: "telegram",
      kind: "voice",
      providerFileId: "voice-file-id",
      providerMimeType: "audio/ogg",
      providerSizeBytes: 2048,
      durationSeconds: 9,
      width: null,
      height: null
    });

    await processingStore.markReady({
      ingestionId,
      messageId,
      mediaAssetId,
      ownerUserId: fixture.astrologerUserId,
      storageBucket: "elevenhouse-local-private",
      storageKey: `${fixture.astrologerUserId}/messaging_attachment/${mediaAssetId}/telegram-voice.ogg`,
      originalFileName: "telegram-voice.ogg",
      mimeType: "audio/ogg",
      sizeBytes: 2048,
      checksumSha256: "b".repeat(64),
      width: null,
      height: null,
      now: new Date("2026-07-22T10:03:03.000Z")
    });

    const completed = await runtime.pool.query<{
      media_asset_id: string | null;
      download_status: string;
      checksum_sha256: string | null;
    }>(
      `select m.media_asset_id, i.download_status, i.checksum_sha256
       from messages m
       inner join message_media_ingestions i on i.message_id = m.id
       where m.id = $1`,
      [messageId]
    );
    const media = await runtime.pool.query<{
      id: string;
      owner_user_id: string;
      purpose: string;
      visibility: string;
      status: string;
      mime_type: string;
      size_bytes: number;
    }>("select id, owner_user_id, purpose, visibility, status, mime_type, size_bytes from media_assets where id = $1", [mediaAssetId]);
    const events = await runtime.pool.query<{ type: string; message_id: string }>(
      "select type, message_id from messaging_realtime_events where message_id = $1 and type = 'message.updated'",
      [messageId]
    );

    expect(completed.rows).toEqual([
      { media_asset_id: mediaAssetId, download_status: "ready", checksum_sha256: "b".repeat(64) }
    ]);
    expect(media.rows).toEqual([
      {
        id: mediaAssetId,
        owner_user_id: fixture.astrologerUserId,
        purpose: "messaging_attachment",
        visibility: "private",
        status: "ready",
        mime_type: "audio/ogg",
        size_bytes: 2048
      }
    ]);
    expect(events.rows).toEqual([{ type: "message.updated", message_id: messageId }]);
    await expect(
      createDrizzleMessagingReadStore(runtime.database).findMessageMediaSource({
        astrologerUserId: fixture.astrologerUserId,
        messageId
      })
    ).resolves.toEqual({
      status: "ready",
      mediaAssetId,
      storageBucket: "elevenhouse-local-private",
      storageKey: `${fixture.astrologerUserId}/messaging_attachment/${mediaAssetId}/telegram-voice.ogg`,
      originalFileName: "telegram-voice.ogg",
      mimeType: "audio/ogg"
    });
    await expect(
      createDrizzleMessagingReadStore(runtime.database).findMessageMediaSource({
        astrologerUserId: fixture.otherAstrologerUserId,
        messageId
      })
    ).resolves.toBeNull();
  });

  it("marks Telegram Business deleted messages as deleted and moves thread preview to the previous visible message", async () => {
    const fixture = await createFixture();
    const store = createDrizzleMessagingStore(runtime.database);
    const firstMessageId = randomUUID();
    const deletedMessageId = randomUUID();
    const firstProviderMessageId = `provider-${randomUUID()}`;
    const deletedProviderMessageId = `provider-${randomUUID()}`;

    await store.recordInboundProviderMessage(
      inboundInput(fixture, firstMessageId, firstProviderMessageId, "First visible message")
    );
    await store.recordInboundProviderMessage(
      inboundInput(fixture, deletedMessageId, deletedProviderMessageId, "Deleted message")
    );

    await expect(
      store.recordTelegramBusinessDeletedMessages({
        businessConnectionId: fixture.businessConnectionId,
        providerChatId: fixture.providerChatId,
        providerMessageIds: [deletedProviderMessageId],
        now: "2026-07-22T10:03:00.000Z"
      })
    ).resolves.toEqual({ kind: "recorded", deletedCount: 1 });
    await expect(
      store.recordTelegramBusinessDeletedMessages({
        businessConnectionId: fixture.businessConnectionId,
        providerChatId: fixture.providerChatId,
        providerMessageIds: [deletedProviderMessageId],
        now: "2026-07-22T10:04:00.000Z"
      })
    ).resolves.toEqual({ kind: "recorded", deletedCount: 0 });

    const messages = await runtime.pool.query<{
      id: string;
      status: string;
    }>("select id, status from messages where id = any($1) order by id", [
      [firstMessageId, deletedMessageId]
    ]);
    const thread = await runtime.pool.query<{
      last_message_id: string | null;
      unread_astrologer_count: number;
    }>(
      "select last_message_id, unread_astrologer_count from messaging_threads where id = $1",
      [fixture.threadId]
    );
    const events = await runtime.pool.query<{ type: string; message_id: string }>(
      "select type, message_id from messaging_realtime_events where message_id = $1",
      [deletedMessageId]
    );

    expect(messages.rows).toEqual(
      expect.arrayContaining([
        { id: firstMessageId, status: "received" },
        { id: deletedMessageId, status: "deleted" }
      ])
    );
    expect(thread.rows).toEqual([
      { last_message_id: firstMessageId, unread_astrologer_count: 1 }
    ]);
    expect(events.rows).toContainEqual({ type: "message.deleted", message_id: deletedMessageId });

    await expect(
      createDrizzleMessagingReadStore(runtime.database).getThread({
        astrologerUserId: fixture.astrologerUserId,
        threadId: fixture.threadId,
        offset: 0
      })
    ).resolves.toMatchObject({
      thread: { lastMessage: { id: firstMessageId } },
      messages: [{ id: firstMessageId }]
    });
  });

  it("updates Telegram Business edited messages and emits a durable realtime update", async () => {
    const fixture = await createFixture();
    const store = createDrizzleMessagingStore(runtime.database);
    const messageId = randomUUID();
    const providerMessageId = `provider-${randomUUID()}`;

    await store.recordInboundProviderMessage(
      inboundInput(fixture, messageId, providerMessageId, "Original message")
    );

    await expect(
      store.recordTelegramBusinessEditedMessage({
        updateId: "1007",
        businessConnectionId: fixture.businessConnectionId,
        providerChatId: fixture.providerChatId,
        providerMessageId,
        text: "Edited message",
        providerSentAt: "2026-07-22T10:00:00.000Z",
        providerEditedAt: "2026-07-22T10:05:00.000Z",
        now: "2026-07-22T10:05:01.000Z"
      })
    ).resolves.toEqual({ kind: "recorded", updatedCount: 1 });
    await expect(
      store.recordTelegramBusinessEditedMessage({
        updateId: "1007",
        businessConnectionId: fixture.businessConnectionId,
        providerChatId: fixture.providerChatId,
        providerMessageId,
        text: "Edited message",
        providerSentAt: "2026-07-22T10:00:00.000Z",
        providerEditedAt: "2026-07-22T10:05:00.000Z",
        now: "2026-07-22T10:05:02.000Z"
      })
    ).resolves.toEqual({ kind: "recorded", updatedCount: 0 });

    const messages = await runtime.pool.query<{
      text: string;
      provider_update_id: string;
      provider_sent_at: Date;
      updated_at: Date;
    }>("select text, provider_update_id, provider_sent_at, updated_at from messages where id = $1", [messageId]);
    const events = await runtime.pool.query<{ type: string; message_id: string }>(
      "select type, message_id from messaging_realtime_events where message_id = $1 and type = 'message.updated'",
      [messageId]
    );

    expect(messages.rows).toEqual([
      {
        text: "Edited message",
        provider_update_id: "1007",
        provider_sent_at: new Date("2026-07-22T10:00:00.000Z"),
        updated_at: new Date("2026-07-22T10:05:01.000Z")
      }
    ]);
    expect(events.rows).toEqual([{ type: "message.updated", message_id: messageId }]);

    await expect(
      createDrizzleMessagingReadStore(runtime.database).getThread({
        astrologerUserId: fixture.astrologerUserId,
        threadId: fixture.threadId,
        offset: 0
      })
    ).resolves.toMatchObject({
      thread: { lastMessage: { id: messageId, text: "Edited message" } },
      messages: [{ id: messageId, text: "Edited message" }]
    });
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
  const businessConnectionId = `bc-${randomUUID()}`;
  const externalIdentityId = randomUUID();
  const providerChatId = `chat-${randomUUID()}`;
  const threadId = randomUUID();
  const timestamp = "2026-07-22T09:00:00.000Z";

  await runtime.pool.query(
    `insert into messaging_channel_connections
      (id, astrologer_user_id, provider, mode, status, external_account_id, capabilities, created_at, updated_at)
     values ($1, $2, 'telegram', 'telegram_business_bot', 'active', $3, $4, $5, $5)`,
    [channelConnectionId, astrologerUserId, businessConnectionId, {}, timestamp]
  );
  await runtime.pool.query(
    `insert into messaging_external_identities
      (id, channel_connection_id, provider, provider_chat_id, link_status, first_seen_at, last_seen_at)
     values ($1, $2, 'telegram', $3, 'unlinked', $4, $4)`,
    [externalIdentityId, channelConnectionId, providerChatId, timestamp]
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
    businessConnectionId,
    externalIdentityId,
    providerChatId,
    threadId
  };
}

function inboundInput(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  messageId: string,
  providerMessageId: string,
  text = "Test inbound body"
) {
  const occurredAt = "2026-07-22T10:00:00.000Z";
  return {
    messageId,
    astrologerUserId: fixture.astrologerUserId,
    threadId: fixture.threadId,
    channelConnectionId: fixture.channelConnectionId,
    externalIdentityId: fixture.externalIdentityId,
    providerMessageId,
    text,
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
