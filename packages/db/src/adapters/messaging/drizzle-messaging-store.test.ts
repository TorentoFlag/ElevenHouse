import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { CreateOutboundMessageStoreInput, StartTelegramMtprotoConnectionStoreInput } from "@elevenhouse/domain";
import {
  clientAstrologerRelationships,
  clientProfiles,
  idempotencyCommands,
  messagingChannelConnections,
  messagingExternalIdentities,
  messagingMessages,
  messagingRealtimeEvents,
  messagingTelegramMtprotoSessions,
  messagingThreadIdentities,
  messagingThreads,
  outboxEvents,
  userRoleAssignments,
  users
} from "../../schema";
import { createDrizzleMessagingStore } from "./drizzle-messaging-store";

const astrologerUserId = "00000000-0000-4000-8000-000000000001";
const threadId = "00000000-0000-4000-8000-000000000002";
const channelConnectionId = "00000000-0000-4000-8000-000000000003";
const externalIdentityId = "00000000-0000-4000-8000-000000000004";
const messageId = "00000000-0000-4000-8000-000000000005";
const now = new Date("2026-07-22T10:00:00.000Z");

describe("createDrizzleMessagingStore", () => {
  it("creates an outbound message and identifier-only delivery outbox event in one transaction", async () => {
    const fake = createFakeDatabase([messageRow()]);
    const store = createDrizzleMessagingStore(fake.database as never);

    const message = await store.createOutboundMessage({
      messageId,
      astrologerUserId,
      threadId,
      channelConnectionId,
      text: "Test outbound body",
      idempotencyKey: "message-key-1",
      requestHash: `sha256:${"a".repeat(64)}`,
      now: now.toISOString(),
      deliveryRequestedEvent: {
        id: "00000000-0000-4000-8000-000000000006",
        type: "messaging.message.delivery_requested",
        occurredAt: now.toISOString(),
        payload: { messageId, threadId, channelConnectionId, astrologerUserId }
      }
    });

    expect(message).toMatchObject({
      id: messageId,
      direction: "outbound",
      status: "queued",
      createdAt: now.toISOString()
    });
    expect(fake.transactionCount).toBe(1);
    expect(fake.inserts).toEqual([
      {
        table: messagingMessages,
        value: expect.objectContaining({
          id: messageId,
          threadId,
          channelConnectionId,
          direction: "outbound",
          senderKind: "astrologer",
          status: "queued",
          idempotencyKey: "message-key-1",
          requestHash: `sha256:${"a".repeat(64)}`
        })
      },
      {
        table: outboxEvents,
        value: {
          id: "00000000-0000-4000-8000-000000000006",
          eventType: "messaging.message.delivery_requested",
          aggregateId: messageId,
          payload: { messageId, threadId, channelConnectionId, astrologerUserId },
          status: "pending",
          attempts: 0,
          availableAt: now,
          lockedAt: null,
          publishedAt: null,
          lastError: null,
          createdAt: now,
          updatedAt: now
        }
      }
    ]);
    expect(fake.updates).toContainEqual({
      table: messagingThreads,
      value: expect.objectContaining({
        lastMessageId: messageId,
        lastMessageAt: now,
        updatedAt: now
      })
    });
    expect(JSON.stringify(fake.inserts[1]?.value)).not.toContain("Test outbound body");
  });

  it("maps bigint realtime event IDs to domain strings", async () => {
    const fake = createFakeDatabase([], [realtimeEventRow()]);
    const event = await createDrizzleMessagingStore(fake.database as never).appendRealtimeEvent({
      astrologerUserId,
      type: "thread.updated",
      occurredAt: now.toISOString(),
      threadId,
      messageId: undefined,
      channelConnectionId,
      externalIdentityId: undefined
    });

    expect(event).toEqual({
      eventId: "42",
      astrologerUserId,
      type: "thread.updated",
      occurredAt: now.toISOString(),
      threadId,
      messageId: undefined,
      channelConnectionId,
      externalIdentityId: undefined
    });
    expect(fake.inserts).toEqual([
      {
        table: messagingRealtimeEvents,
        value: expect.objectContaining({
          astrologerUserId,
          type: "thread.updated",
          threadId,
          messageId: null,
          channelConnectionId,
          externalIdentityId: null,
          createdAt: now
        })
      }
    ]);
  });

  it("returns the existing inbound message after the provider dedupe constraint and does not append another event", async () => {
    const existing = messageRow({
      externalIdentityId,
      direction: "inbound",
      providerMessageId: "provider-message-1",
      status: "received"
    });
    const otherChatMessage = messageRow({
      id: "00000000-0000-4000-8000-000000000011",
      externalIdentityId: "00000000-0000-4000-8000-000000000012",
      direction: "inbound",
      providerMessageId: "provider-message-1",
      status: "received",
      text: "Other chat body"
    });
    const fake = createDuplicateInboundDatabase([existing, otherChatMessage]);
    const result = await createDrizzleMessagingStore(fake.database as never).recordInboundProviderMessage({
      messageId,
      astrologerUserId,
      threadId,
      channelConnectionId,
      externalIdentityId,
      providerMessageId: "provider-message-1",
      text: "Test inbound body",
      now: now.toISOString(),
      receivedEvent: {
        astrologerUserId,
        type: "message.received",
        occurredAt: now.toISOString(),
        threadId,
        messageId,
        channelConnectionId,
        externalIdentityId
      }
    });

    expect(result).toMatchObject({ kind: "duplicate", message: { id: messageId, text: "Test outbound body" } });
    expect(fake.insertCount).toBe(1);
    const duplicateLookup = fake.wheres
      .map(renderWhere)
      .find((query) => query.sql.includes('"messages"."provider_message_id"'));
    expect(duplicateLookup?.sql).toContain('"messages"."external_identity_id" =');
    expect(duplicateLookup?.params).toContain(externalIdentityId);
  });

  it("normalizes inbound realtime references from the persisted message and thread", async () => {
    const fake = createFakeDatabase([
      messageRow({
        direction: "inbound",
        status: "received",
        externalIdentityId,
        providerMessageId: "provider-message-1"
      })
    ], [realtimeEventRow({ type: "message.received", messageId })]);

    await createDrizzleMessagingStore(fake.database as never).recordInboundProviderMessage({
      messageId,
      astrologerUserId,
      threadId,
      channelConnectionId,
      externalIdentityId,
      providerMessageId: "provider-message-1",
      text: "Test inbound body",
      now: now.toISOString(),
      receivedEvent: {
        astrologerUserId,
        type: "message.received",
        occurredAt: now.toISOString(),
        threadId: "00000000-0000-4000-8000-000000000012",
        messageId: "00000000-0000-4000-8000-000000000013",
        channelConnectionId: "00000000-0000-4000-8000-000000000014",
        externalIdentityId: "00000000-0000-4000-8000-000000000015"
      }
    });

    expect(realtimeEventInsert(fake)).toEqual(
      expect.objectContaining({
        astrologerUserId,
        threadId,
        messageId,
        channelConnectionId,
        externalIdentityId
      })
    );
  });

  it("normalizes mark-read realtime references from the updated thread", async () => {
    const fake = createFakeDatabase([], [realtimeEventRow()]);

    await createDrizzleMessagingStore(fake.database as never).markThreadRead({
      astrologerUserId,
      threadId,
      now: now.toISOString(),
      realtimeEvent: {
        astrologerUserId,
        type: "thread.updated",
        occurredAt: now.toISOString(),
        threadId: "00000000-0000-4000-8000-000000000012",
        messageId: "00000000-0000-4000-8000-000000000013",
        channelConnectionId: "00000000-0000-4000-8000-000000000014",
        externalIdentityId: "00000000-0000-4000-8000-000000000015"
      }
    });

    expect(realtimeEventInsert(fake)).toEqual(
      expect.objectContaining({
        astrologerUserId,
        threadId,
        messageId: null,
        channelConnectionId,
        externalIdentityId
      })
    );
  });

  it("replays an outbound idempotency race without appending a second outbox event", async () => {
    const fake = createDuplicateOutboundDatabase(messageRow());

    await expect(
      createDrizzleMessagingStore(fake.database as never).createOutboundMessage(outboundInput())
    ).resolves.toMatchObject({ id: messageId });
    expect(fake.insertCount).toBe(1);
    expect(fake.outboxInsertCount).toBe(0);
  });

  it("translates an outbound idempotency race with a different request hash", async () => {
    const fake = createDuplicateOutboundDatabase(messageRow());

    await expect(
      createDrizzleMessagingStore(fake.database as never).createOutboundMessage(
        outboundInput({ requestHash: `sha256:${"b".repeat(64)}` })
      )
    ).rejects.toMatchObject({ code: "messaging_idempotency_conflict" });
    expect(fake.insertCount).toBe(1);
    expect(fake.outboxInsertCount).toBe(0);
  });

  it("links the owned thread and its primary external identity in one idempotent transaction", async () => {
    const fake = createFakeDatabase([]);
    const store = createDrizzleMessagingStore(fake.database as never);

    await (store as unknown as {
      linkThreadToClient: (input: Record<string, unknown>) => Promise<unknown>;
    }).linkThreadToClient({
      astrologerUserId,
      threadId,
      clientUserId: "00000000-0000-4000-8000-000000000010",
      idempotencyKey: "thread-link:request-1",
      requestHash: `sha256:${"c".repeat(64)}`,
      now: now.toISOString(),
      expiresAt: "2026-07-23T10:00:00.000Z"
    });

    expect(fake.transactionCount).toBe(1);
    expect(fake.inserts).toContainEqual(
      expect.objectContaining({
        table: idempotencyCommands,
        value: expect.objectContaining({
          commandScope: "messaging.threads.link-client",
          key: "thread-link:request-1"
        })
      })
    );
    expect(fake.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: messagingThreads, value: expect.objectContaining({ clientUserId: "00000000-0000-4000-8000-000000000010" }) }),
        expect.objectContaining({ table: messagingExternalIdentities, value: { linkedClientUserId: "00000000-0000-4000-8000-000000000010", linkStatus: "linked" } })
      ])
    );
  });

  it("creates the manual client, active relationship, thread link and primary identity link in one transaction", async () => {
    const fake = createFakeDatabase([]);
    const store = createDrizzleMessagingStore(fake.database as never);

    await (store as unknown as {
      createClientFromThread: (input: Record<string, unknown>) => Promise<unknown>;
    }).createClientFromThread({
      astrologerUserId,
      threadId,
      displayName: "Telegram contact",
      idempotencyKey: "thread-create:request-1",
      requestHash: `sha256:${"d".repeat(64)}`,
      now: now.toISOString(),
      expiresAt: "2026-07-23T10:00:00.000Z"
    });

    expect(fake.transactionCount).toBe(1);
    expect(fake.inserts.map((entry) => entry.table)).toEqual(
      expect.arrayContaining([
        idempotencyCommands,
        users,
        userRoleAssignments,
        clientProfiles,
        clientAstrologerRelationships
      ])
    );
    expect(fake.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: messagingThreads }),
        expect.objectContaining({ table: messagingExternalIdentities, value: expect.objectContaining({ linkStatus: "linked" }) })
      ])
    );
  });

  it("replays a completed link-client command without another durable write", async () => {
    const fake = createDuplicateThreadClientCommandDatabase(`sha256:${"e".repeat(64)}`);
    const store = createDrizzleMessagingStore(fake.database as never);

    await expect(
      store.linkThreadToClient({
        astrologerUserId,
        threadId,
        clientUserId: "00000000-0000-4000-8000-000000000010",
        idempotencyKey: "thread-link:replay-1",
        requestHash: `sha256:${"e".repeat(64)}`,
        now: now.toISOString(),
        expiresAt: "2026-07-23T10:00:00.000Z"
      })
    ).resolves.toMatchObject({ id: threadId, clientUserId: "00000000-0000-4000-8000-000000000010" });
    expect(fake.userInsertCount).toBe(0);
    expect(fake.threadUpdateCount).toBe(0);
  });

  it("rejects a replayed create-client key with a different request hash before creating another user", async () => {
    const fake = createDuplicateThreadClientCommandDatabase(`sha256:${"f".repeat(64)}`);
    const store = createDrizzleMessagingStore(fake.database as never);

    await expect(
      store.createClientFromThread({
        astrologerUserId,
        threadId,
        displayName: "Telegram contact",
        idempotencyKey: "thread-create:replay-1",
        requestHash: `sha256:${"0".repeat(64)}`,
        now: now.toISOString(),
        expiresAt: "2026-07-23T10:00:00.000Z"
      })
    ).rejects.toMatchObject({ code: "messaging_idempotency_conflict" });
    expect(fake.userInsertCount).toBe(0);
  });

  it("records Telegram Business connection rights as channel capabilities", async () => {
    const fake = createFakeDatabase([]);

    await expect(
      createDrizzleMessagingStore(fake.database as never).recordTelegramBusinessConnection({
        businessConnectionId: "bc_123",
        userId: "987654321",
        userChatId: "123456789",
        username: "alisa_astro",
        displayName: "Alisa",
        connectedAt: now.toISOString(),
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
        now: now.toISOString()
      })
    ).resolves.toEqual({ kind: "recorded" });

    expect(fake.updates).toContainEqual({
      table: messagingChannelConnections,
      value: expect.objectContaining({
        status: "active",
        externalOwnerUserId: "987654321",
        displayNameSnapshot: "Alisa",
        usernameSnapshot: "alisa_astro",
        capabilities: {
          canSend: true,
          canReceive: true,
          canRead: true,
          supportsHistoryImport: false,
          supportsMessageEdits: false,
          supportsMessageDeletes: true,
          supportsAttachments: false
        },
        lastErrorCode: null,
        lastErrorMessage: null
      })
    });
    expect(fake.inserts).toContainEqual({
      table: messagingRealtimeEvents,
      value: expect.objectContaining({
        astrologerUserId,
        type: "channelConnection.updated",
        channelConnectionId,
        threadId: null,
        messageId: null,
        externalIdentityId: null,
        createdAt: now
      })
    });
  });

  it("records Telegram Business messages sent directly by the business account as outbound", async () => {
    const fake = createTelegramBusinessMessageDatabase({
      externalOwnerUserId: "987654321"
    });

    await expect(
      createDrizzleMessagingStore(fake.database as never).recordTelegramBusinessMessage({
        updateId: "100501",
        businessConnectionId: "bc_real",
        providerMessageId: "346",
        providerChatId: "777",
        providerUserId: "987654321",
        username: "alisa_astro",
        displayName: "Alisa",
        chatUsername: "marina",
        chatDisplayName: "Marina",
        contentType: "text",
        text: "Ок, записал на 12",
        providerSentAt: now.toISOString(),
        now: now.toISOString()
      })
    ).resolves.toMatchObject({
      kind: "created",
      message: {
        direction: "outbound",
        status: "sent",
        text: "Ок, записал на 12"
      }
    });

    expect(fake.externalIdentityUpserts).toEqual([
      expect.objectContaining({
        providerUserId: null,
        usernameSnapshot: "marina",
        displayNameSnapshot: "Marina"
      })
    ]);
    expect(fake.messageInserts).toEqual([
      expect.objectContaining({
        direction: "outbound",
        senderKind: "astrologer",
        status: "sent",
        providerMessageId: "346",
        idempotencyKey: "telegram-business:bc_real:777:346",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      })
    ]);
    expect(fake.threadUpdates).toEqual([
      expect.objectContaining({
        lastMessageAt: now
      })
    ]);
    expect(fake.threadUpdates[0]).not.toHaveProperty("unreadAstrologerCount");
    expect(fake.realtimeEventInserts).toEqual([
      expect.objectContaining({
        type: "message.received",
        channelConnectionId
      })
    ]);
  });

  it("continues recording Telegram Business client messages as inbound", async () => {
    const fake = createTelegramBusinessMessageDatabase({
      externalOwnerUserId: "987654321"
    });

    await createDrizzleMessagingStore(fake.database as never).recordTelegramBusinessMessage({
      updateId: "100502",
      businessConnectionId: "bc_real",
      providerMessageId: "347",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina",
        displayName: "Marina",
        chatUsername: "marina",
        chatDisplayName: "Marina",
        contentType: "text",
        text: "Например на 12",
      providerSentAt: now.toISOString(),
      now: now.toISOString()
    });

    expect(fake.messageInserts).toEqual([
      expect.objectContaining({
        direction: "inbound",
        senderKind: "client",
        contentType: "text",
        status: "received",
        idempotencyKey: null,
        requestHash: null
      })
    ]);
    expect(fake.threadUpdates).toEqual([
      expect.objectContaining({
        unreadAstrologerCount: expect.anything()
      })
    ]);
  });

  it("records Telegram Business voice messages with voice content type", async () => {
    const fake = createTelegramBusinessMessageDatabase({
      externalOwnerUserId: "987654321"
    });

    await createDrizzleMessagingStore(fake.database as never).recordTelegramBusinessMessage({
      updateId: "100503",
      businessConnectionId: "bc_real",
      providerMessageId: "348",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina",
      displayName: "Marina",
      chatUsername: "marina",
      chatDisplayName: "Marina",
      contentType: "voice",
      text: "Голосовое сообщение (0:12)",
      providerSentAt: now.toISOString(),
      now: now.toISOString()
    });

    expect(fake.messageInserts).toEqual([
      expect.objectContaining({
        contentType: "voice",
        text: "Голосовое сообщение (0:12)",
        mediaAssetId: null
      })
    ]);
  });

  it("claims a single pending Telegram Business connection when the first business connection id arrives", async () => {
    const fake = createPendingTelegramBusinessConnectionDatabase();

    await expect(
      createDrizzleMessagingStore(fake.database as never).recordTelegramBusinessConnection({
        businessConnectionId: "bc_real",
        userId: "987654321",
        userChatId: "123456789",
        username: "alisa_astro",
        displayName: "Alisa",
        connectedAt: now.toISOString(),
        enabled: true,
        rights: {
          canReply: true,
          canReadMessages: true,
          canDeleteSentMessages: false,
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
        now: now.toISOString()
      })
    ).resolves.toEqual({ kind: "recorded" });

    expect(fake.updates).toContainEqual({
      table: messagingChannelConnections,
      value: expect.objectContaining({
        status: "active",
        externalAccountId: "bc_real",
        displayNameSnapshot: "Alisa",
        usernameSnapshot: "alisa_astro"
      })
    });
    expect(fake.realtimeEventInserts).toEqual([
      expect.objectContaining({
        astrologerUserId,
        type: "channelConnection.updated",
        channelConnectionId,
        threadId: null,
        messageId: null,
        externalIdentityId: null,
        createdAt: now
      })
    ]);
  });

  it("creates one pending Telegram Business connection for the astrologer start flow", async () => {
    const fake = createStartTelegramBusinessConnectionDatabase();

    await expect(
      createDrizzleMessagingStore(fake.database as never).startTelegramBusinessConnection({
        connectionId: "00000000-0000-4000-8000-000000000030",
        astrologerUserId,
        now: now.toISOString()
      })
    ).resolves.toEqual({ connectionId: "00000000-0000-4000-8000-000000000030" });

    expect(fake.transactionCount).toBe(1);
    expect(fake.inserts).toEqual([
      {
        table: messagingChannelConnections,
        value: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000030",
          astrologerUserId,
          provider: "telegram",
          mode: "telegram_business_bot",
          status: "connecting",
          externalAccountId: null,
          capabilities: {
            canSend: false,
            canReceive: false,
            canRead: false,
            supportsHistoryImport: false,
            supportsMessageEdits: false,
            supportsMessageDeletes: false,
            supportsAttachments: false
          }
        })
      }
    ]);
  });

  it("creates one pending Telegram Account connection and encrypted session state for the start flow", async () => {
    const fake = createStartTelegramMtprotoConnectionDatabase();
    const encryptedSecret = encryptedSecretSnapshot("ciphertext");

    await expect(
      createDrizzleMessagingStore(fake.database as never).startTelegramMtprotoConnection({
        connectionId: "00000000-0000-4000-8000-000000000031",
        astrologerUserId,
        phoneNumberLast4: "3535",
        maskedPhoneNumber: "+7******3535",
        encryptedPhoneNumber: encryptedSecret,
        encryptedPhoneCodeHash: encryptedSecretSnapshot("phone-code-hash"),
        consentAccepted: true,
        now: now.toISOString()
      })
    ).resolves.toEqual({
      connectionId: "00000000-0000-4000-8000-000000000031",
      loginStep: "code_required",
      maskedPhoneNumber: "+7******3535"
    });

    expect(fake.transactionCount).toBe(1);
    expect(fake.inserts).toEqual([
      {
        table: messagingChannelConnections,
        value: expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000031",
          astrologerUserId,
          provider: "telegram",
          mode: "telegram_mtproto_account",
          status: "connecting",
          externalAccountId: null,
          displayNameSnapshot: null,
          usernameSnapshot: null,
          capabilities: {
            canSend: false,
            canReceive: false,
            canRead: false,
            supportsHistoryImport: false,
            supportsMessageEdits: false,
            supportsMessageDeletes: false,
            supportsAttachments: false
          }
        })
      },
      {
        table: messagingTelegramMtprotoSessions,
        value: expect.objectContaining({
          channelConnectionId: "00000000-0000-4000-8000-000000000031",
          loginState: "code_required",
          phoneNumberEncrypted: encryptedSecret,
          phoneCodeHashEncrypted: encryptedSecretSnapshot("phone-code-hash"),
          sessionEncrypted: null,
          phoneNumberLast4: "3535"
        })
      }
    ]);
    expect(fake.inserts.map((insert) => JSON.stringify(insert.value)).join("\n")).not.toContain(
      "78005553535"
    );
  });

  it("does not claim a pending Telegram Business connection with an unmatched revoked update", async () => {
    const fake = createPendingTelegramBusinessConnectionDatabase();

    await expect(
      createDrizzleMessagingStore(fake.database as never).recordTelegramBusinessConnection({
        businessConnectionId: "bc_disabled",
        userId: "987654321",
        userChatId: "123456789",
        username: "alisa_astro",
        displayName: "Alisa",
        connectedAt: now.toISOString(),
        enabled: false,
        rights: {
          canReply: false,
          canReadMessages: false,
          canDeleteSentMessages: false,
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
        now: now.toISOString()
      })
    ).resolves.toEqual({ kind: "unmatched" });

    expect(fake.updates).toEqual([]);
  });

  it("rejects ambiguous Telegram Business message connection resolution", async () => {
    const fake = createAmbiguousTelegramConnectionDatabase();

    await expect(
      createDrizzleMessagingStore(fake.database as never).recordTelegramBusinessMessage({
        updateId: "100500",
        businessConnectionId: "bc_ambiguous",
        providerMessageId: "345",
        providerChatId: "777",
        providerUserId: "555",
        username: "marina",
        displayName: "Marina",
        chatUsername: "marina",
        chatDisplayName: "Marina",
        contentType: "text",
        text: "Здравствуйте",
        providerSentAt: now.toISOString(),
        now: now.toISOString()
      })
    ).rejects.toThrow("Telegram business connection is not uniquely bound to one channel connection");
  });
});

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: messageId,
    threadId,
    channelConnectionId,
    externalIdentityId: null,
    direction: "outbound",
    senderKind: "astrologer",
    providerMessageId: null,
    providerUpdateId: null,
    providerSentAt: null,
    contentType: "text",
    text: "Test outbound body",
    mediaAssetId: null,
    status: "queued",
    failureCode: null,
    idempotencyKey: "message-key-1",
    requestHash: `sha256:${"a".repeat(64)}`,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function realtimeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000007",
    eventId: 42n,
    astrologerUserId,
    type: "thread.updated",
    threadId,
    messageId: null,
    channelConnectionId,
    externalIdentityId: null,
    createdAt: now,
    ...overrides
  };
}

function outboundInput(
  overrides: Partial<CreateOutboundMessageStoreInput> = {}
): CreateOutboundMessageStoreInput {
  return {
    messageId,
    astrologerUserId,
    threadId,
    channelConnectionId,
    text: "Test outbound body",
    idempotencyKey: "message-key-1",
    requestHash: `sha256:${"a".repeat(64)}`,
    now: now.toISOString(),
    deliveryRequestedEvent: {
      id: "00000000-0000-4000-8000-000000000006",
      type: "messaging.message.delivery_requested" as const,
      occurredAt: now.toISOString(),
      payload: { messageId, threadId, channelConnectionId, astrologerUserId }
    },
    ...overrides
  };
}

function realtimeEventInsert(fake: {
  readonly inserts: readonly { readonly table: unknown; readonly value: Record<string, unknown> }[];
}): Record<string, unknown> {
  const insert = fake.inserts.find((candidate) => candidate.table === messagingRealtimeEvents);
  if (!insert) throw new Error("Expected realtime event insert");
  return insert.value;
}

function createFakeDatabase(
  messageRows: readonly Record<string, unknown>[],
  realtimeRows: readonly Record<string, unknown>[] = []
) {
  const inserts: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  const updates: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  let messageRowIndex = 0;
  let realtimeRowIndex = 0;
  let transactionCount = 0;

  const insert = (table: unknown) => ({
    values: (value: Record<string, unknown>) => ({
      returning: async () => {
        inserts.push({ table, value });
        if (table === messagingMessages) return take(messageRows, () => messageRowIndex++);
        if (table === messagingRealtimeEvents) return take(realtimeRows, () => realtimeRowIndex++);
        if (table === idempotencyCommands) return [{ id: "00000000-0000-4000-8000-000000000009" }];
        if (table === users) return [{ id: "00000000-0000-4000-8000-000000000010" }];
        return [];
      },
      then: (resolve: (value: undefined) => unknown) => {
        inserts.push({ table, value });
        return resolve(undefined);
      }
    })
  });
  const database: {
    insert: typeof insert;
    update: (table: unknown) => {
      set: (value: Record<string, unknown>) => {
        where: () => {
          returning: () => Promise<readonly Record<string, unknown>[]>;
          then: (resolve: (value: undefined) => unknown) => unknown;
        };
      };
    };
    select: (selection?: Record<string, unknown>) => ReturnType<typeof selectChain>;
    transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
  } = {
    insert,
    update: (table: unknown) => ({
      set: (value: Record<string, unknown>) => ({
        where: () => {
          updates.push({ table, value });
          return {
            returning: async () => [{}],
            then: (resolve: (value: undefined) => unknown) => resolve(undefined)
          };
        }
      })
    }),
    select: (selection) =>
      selectChain(
        selection && "thread" in selection
          ? [threadProjection()]
          : selection && "externalIdentity" in selection
            ? [externalIdentityProjection()]
            : selection && "externalOwnerUserId" in selection
              ? [{ id: channelConnectionId, astrologerUserId, externalOwnerUserId: "987654321" }]
            : [{}]
      ),
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => {
      transactionCount += 1;
      return callback(database);
    }
  };

  return { database, inserts, updates, get transactionCount() { return transactionCount; } };
}

function createDuplicateOutboundDatabase(existingMessage: Record<string, unknown>) {
  let insertCount = 0;
  let outboxInsertCount = 0;
  const database: {
    insert: (table: unknown) => { values: () => { returning: () => Promise<never>; then: (resolve: (value: undefined) => unknown) => unknown } };
    transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
    select: (selection?: Record<string, unknown>) => ReturnType<typeof selectChain>;
  } = {
    insert: (table) => ({
      values: () => ({
        returning: async () => {
          if (table === messagingMessages) {
            insertCount += 1;
            throw { code: "23505", constraint: "messages_outbound_idempotency_unique" };
          }
          return [] as never;
        },
        then: (resolve) => {
          if (table === outboxEvents) outboxInsertCount += 1;
          return resolve(undefined);
        }
      })
    }),
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(database),
    select: (selection) =>
      selectChain(
        selection && "thread" in selection
          ? [threadProjection()]
          : selection && "externalIdentity" in selection
            ? [externalIdentityProjection()]
            : [existingMessage]
      )
  };
  return {
    database,
    get insertCount() {
      return insertCount;
    },
    get outboxInsertCount() {
      return outboxInsertCount;
    }
  };
}

function createDuplicateInboundDatabase(existingMessages: readonly Record<string, unknown>[]) {
  let insertCount = 0;
  let duplicateInput: Record<string, unknown> | null = null;
  const wheres: SQL[] = [];
  const database: {
    insert: () => { values: (value: Record<string, unknown>) => { returning: () => Promise<never> } };
    transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
    select: (selection?: Record<string, unknown>) => ReturnType<typeof selectChain>;
  } = {
    insert: () => ({
      values: (value) => ({
        returning: async () => {
          insertCount += 1;
          duplicateInput = value;
          throw { code: "23505", constraint: "messages_inbound_provider_dedupe_unique" };
        }
      })
    }),
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(database),
    select: (selection?: Record<string, unknown>) =>
      selectChain(
        selection && "thread" in selection
          ? [threadProjection()]
          : selection && "externalIdentity" in selection
            ? [externalIdentityProjection()]
            : existingMessages.filter(
                (message) =>
                  message.channelConnectionId === duplicateInput?.channelConnectionId &&
                  message.externalIdentityId === duplicateInput?.externalIdentityId &&
                  message.providerMessageId === duplicateInput?.providerMessageId &&
                  message.direction === "inbound"
              )
            ,
        (where) => {
          wheres.push(where);
        }
      )
  };
  return { database, get insertCount() { return insertCount; }, wheres };
}

function createDuplicateThreadClientCommandDatabase(requestHash: string) {
  let userInsertCount = 0;
  let threadUpdateCount = 0;
  const database: {
    insert: (table: unknown) => { values: () => { returning: () => Promise<never> } };
    update: (table: unknown) => { set: () => { where: () => { returning: () => Promise<readonly Record<string, unknown>[]>; then: (resolve: (value: undefined) => unknown) => unknown } } };
    select: (selection?: Record<string, unknown>) => ReturnType<typeof selectChain>;
    transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
  } = {
    insert: (table) => ({
      values: () => ({
        returning: async () => {
          if (table === idempotencyCommands) {
            throw { code: "23505", constraint: "idempotency_commands_scope_key_unique" };
          }
          if (table === users) userInsertCount += 1;
          return [] as never;
        }
      })
    }),
    update: (table) => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            if (table === messagingThreads) threadUpdateCount += 1;
            return [{}];
          },
          then: (resolve) => resolve(undefined)
        })
      })
    }),
    select: (selection) =>
      selectChain(
        selection && "thread" in selection
          ? [threadProjection()]
          : selection && "requestHash" in selection
            ? [{ requestHash, state: "completed", result: { threadId, clientUserId: "00000000-0000-4000-8000-000000000010" } }]
            : [{}]
      ),
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(database)
  };
  return {
    database,
    get userInsertCount() {
      return userInsertCount;
    },
    get threadUpdateCount() {
      return threadUpdateCount;
    }
  };
}

function createTelegramBusinessMessageDatabase(input: { readonly externalOwnerUserId: string | null }) {
  const externalIdentityUpserts: Record<string, unknown>[] = [];
  const messageInserts: Record<string, unknown>[] = [];
  const threadUpdates: Record<string, unknown>[] = [];
  const realtimeEventInserts: Record<string, unknown>[] = [];

  const database: {
    insert: (table: unknown) => {
      values: (value: Record<string, unknown>) => {
        onConflictDoUpdate?: (config: Record<string, unknown>) => {
          returning: () => Promise<readonly Record<string, unknown>[]>;
        };
        returning: () => Promise<readonly Record<string, unknown>[]>;
        then: (resolve: (value: undefined) => unknown) => unknown;
      };
    };
    update: (table: unknown) => {
      set: (value: Record<string, unknown>) => {
        where: () => {
          returning: () => Promise<readonly Record<string, unknown>[]>;
        };
      };
    };
    select: (selection?: Record<string, unknown>) => ReturnType<typeof selectChain>;
    transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
  } = {
    insert: (table) => ({
      values: (value) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            if (table !== messagingExternalIdentities) return [];
            externalIdentityUpserts.push(value);
            return [externalIdentityProjection().externalIdentity];
          }
        }),
        returning: async () => {
          if (table === messagingMessages) {
            messageInserts.push(value);
            return [
              messageRow({
                externalIdentityId,
                direction: value.direction,
                senderKind: value.senderKind,
                providerMessageId: value.providerMessageId,
                providerUpdateId: value.providerUpdateId,
                providerSentAt: value.providerSentAt,
                text: value.text,
                status: value.status,
                idempotencyKey: value.idempotencyKey,
                requestHash: value.requestHash,
                createdAt: value.createdAt,
                updatedAt: value.updatedAt
              })
            ];
          }
          if (table === messagingThreads) {
            return [{ id: threadId }];
          }
          if (table === messagingRealtimeEvents) {
            realtimeEventInserts.push(value);
            return [realtimeEventRow(value)];
          }
          return [];
        },
        then: (resolve) => {
          if (table === messagingThreadIdentities) return resolve(undefined);
          return resolve(undefined);
        }
      })
    }),
    update: (table) => ({
      set: (value) => ({
        where: () => ({
          returning: async () => {
            if (table === messagingThreads) threadUpdates.push(value);
            return [{ id: threadId }];
          }
        })
      })
    }),
    select: (selection) => {
      if (selection && "externalOwnerUserId" in selection) {
        return selectChain([{ id: channelConnectionId, astrologerUserId, externalOwnerUserId: input.externalOwnerUserId }]);
      }
      if (selection && "thread" in selection) {
        return selectChain([threadProjection()]);
      }
      if (selection && "id" in selection) {
        return selectChain([{}]);
      }
      return selectChain([]);
    },
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(database)
  };

  return {
    database,
    externalIdentityUpserts,
    messageInserts,
    threadUpdates,
    realtimeEventInserts
  };
}

function createPendingTelegramBusinessConnectionDatabase() {
  const updates: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  const realtimeEventInserts: Record<string, unknown>[] = [];
  let selectCount = 0;
  const database = {
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => {
        if (table === messagingRealtimeEvents) realtimeEventInserts.push(value);
        return {
          returning: async () => table === messagingRealtimeEvents ? [realtimeEventRow(value)] : []
        };
      }
    }),
    update: (table: unknown) => ({
      set: (value: Record<string, unknown>) => ({
        where: () => {
          updates.push({ table, value });
          return { returning: async () => [{ id: channelConnectionId }] };
        }
      })
    }),
    select: () => {
      const rows = selectCount === 0
        ? []
        : [{ id: channelConnectionId, astrologerUserId }];
      selectCount += 1;
      return selectChain(rows);
    },
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(database)
  };

  return { database, updates, realtimeEventInserts };
}

function createAmbiguousTelegramConnectionDatabase() {
  const database: {
    insert: () => never;
    update: () => never;
    transaction: <T>(callback: (transaction: unknown) => Promise<T>) => Promise<T>;
    select: () => ReturnType<typeof selectChain>;
  } = {
    insert: () => {
      throw new Error("Unexpected insert for ambiguous Telegram connection");
    },
    update: () => {
      throw new Error("Unexpected update for ambiguous Telegram connection");
    },
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(database),
    select: () =>
      selectChain([
        { id: channelConnectionId, astrologerUserId },
        {
          id: "00000000-0000-4000-8000-000000000020",
          astrologerUserId: "00000000-0000-4000-8000-000000000021"
        }
      ])
  };
  return { database };
}

function createStartTelegramBusinessConnectionDatabase() {
  const inserts: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  let transactionCount = 0;
  const database = {
    execute: async () => undefined,
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          inserts.push({ table, value });
          return [{ id: value.id }];
        }
      })
    }),
    select: () => selectChain([]),
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => {
      transactionCount += 1;
      return callback(database);
    }
  };
  return {
    database,
    inserts,
    get transactionCount() {
      return transactionCount;
    }
  };
}

function createStartTelegramMtprotoConnectionDatabase() {
  const inserts: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  let transactionCount = 0;
  const database = {
    execute: async () => undefined,
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          inserts.push({ table, value });
          if (table === messagingChannelConnections) return [{ id: value.id }];
          return [{ id: "00000000-0000-4000-8000-000000000032" }];
        },
        then: (resolve: (value: undefined) => unknown) => {
          inserts.push({ table, value });
          return resolve(undefined);
        }
      })
    }),
    select: () => selectChain([]),
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => {
      transactionCount += 1;
      return callback(database);
    }
  };
  return {
    database,
    inserts,
    get transactionCount() {
      return transactionCount;
    }
  };
}

function encryptedSecretSnapshot(
  ciphertext: string
): StartTelegramMtprotoConnectionStoreInput["encryptedPhoneNumber"] {
  return {
    algorithm: "aes-256-gcm",
    keyId: "mtproto-key-1",
    iv: "base64-iv",
    authTag: "base64-tag",
    ciphertext
  };
}

function take<T>(values: readonly T[], next: () => number): readonly T[] {
  const value = values[next()];
  return value ? [value] : [];
}

function selectChain(rows: readonly Record<string, unknown>[], onWhere?: (where: SQL) => void) {
  const query = {
    from: () => query,
    innerJoin: () => query,
    leftJoin: () => query,
    where: (where?: SQL) => {
      if (where) onWhere?.(where);
      return query;
    },
    limit: async () => rows
  };
  return query;
}

function renderWhere(where: SQL) {
  return new PgDialect().sqlToQuery(where);
}

function threadProjection() {
  return {
    thread: {
      id: threadId,
      astrologerUserId,
      clientUserId: "00000000-0000-4000-8000-000000000010",
      status: "open",
      lastMessageId: null,
      lastMessageAt: null,
      unreadAstrologerCount: 0,
      createdAt: now,
      updatedAt: now
    },
    externalIdentity: externalIdentityProjection().externalIdentity,
    channelConnection: externalIdentityProjection().channelConnection
  };
}

function externalIdentityProjection() {
  return {
    externalIdentity: {
      id: externalIdentityId,
      channelConnectionId,
      provider: "telegram",
      providerUserId: "provider-user-1",
      providerChatId: "provider-chat-1",
      usernameSnapshot: null,
      displayNameSnapshot: null,
      avatarMediaId: null,
      linkedClientUserId: null,
      linkStatus: "unlinked",
      firstSeenAt: now,
      lastSeenAt: now
    },
    channelConnection: {
      id: channelConnectionId,
      astrologerUserId,
      provider: "telegram",
      mode: "telegram_business_bot",
      status: "active",
      externalAccountId: null,
      externalOwnerUserId: null,
      displayNameSnapshot: null,
      usernameSnapshot: null,
      capabilities: {},
      consentRecordId: null,
      connectedAt: now,
      lastSyncedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: now,
      updatedAt: now
    }
  };
}
