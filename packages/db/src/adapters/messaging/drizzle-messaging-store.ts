import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  MessagingClientRelationshipError,
  MessagingIdempotencyConflictError,
  messagingMessageDeletedEventType,
  messagingMessageReceivedEventType,
  messagingMessageUpdatedEventType
} from "@elevenhouse/domain";
import type {
  AppendMessagingRealtimeEventInput,
  CreateClientFromThreadStoreInput,
  CreateOutboundMessageStoreInput,
  LinkThreadToClientStoreInput,
  MarkThreadReadStoreInput,
  MarkThreadReadStoreResult,
  MessagingMessage,
  MessagingMessageWithRequestHash,
  MessagingRealtimeEvent,
  MessagingStore,
  MessagingThread,
  MessagingThreadExternalIdentity,
  RecordInboundProviderMessageStoreInput,
  RecordTelegramBusinessConnectionStoreInput,
  RecordTelegramBusinessConnectionStoreResult,
  RecordTelegramBusinessDeletedMessagesStoreInput,
  RecordTelegramBusinessDeletedMessagesStoreResult,
  RecordTelegramBusinessEditedMessageStoreInput,
  RecordTelegramBusinessEditedMessageStoreResult,
  RecordTelegramBusinessMessageStoreInput,
  StartTelegramBusinessConnectionStoreInput,
  StartTelegramBusinessConnectionStoreResult
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientAstrologerRelationships,
  clientProfiles,
  idempotencyCommands,
  messagingChannelConnections,
  messagingExternalIdentities,
  messageMediaIngestions,
  messagingMessages,
  messagingRealtimeEvents,
  messagingThreadIdentities,
  messagingThreads,
  outboxEvents,
  userRoleAssignments,
  users
} from "../../schema";
import { hasPostgresConstraintViolation } from "../scheduling/drizzle-idempotent-scheduling-command";

type MessagingTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type MessagingDatabase = ElevenHouseDatabase | MessagingTransaction;
type MessagingChannelConnectionRow = typeof messagingChannelConnections.$inferSelect;
type MessagingExternalIdentityRow = typeof messagingExternalIdentities.$inferSelect;
type MessagingMessageRow = typeof messagingMessages.$inferSelect;
type MessagingRealtimeEventRow = typeof messagingRealtimeEvents.$inferSelect;
type MessagingThreadRow = typeof messagingThreads.$inferSelect;

type ThreadProjection = {
  readonly thread: MessagingThreadRow;
  readonly externalIdentity: MessagingExternalIdentityRow;
  readonly channelConnection: MessagingChannelConnectionRow;
};

const inboundProviderDedupeConstraint = "messages_inbound_provider_dedupe_unique";
const outboundIdempotencyConstraint = "messages_outbound_idempotency_unique";
const threadIdentityExternalIdentityConstraint = "messaging_thread_identities_external_identity_unique";
const threadClientIdempotencyConstraint = "idempotency_commands_scope_key_unique";
const astrologerApiSurface = "astrologer-api";
const linkThreadClientScope = "messaging.threads.link-client";
const createThreadClientScope = "messaging.threads.create-client";

export function createDrizzleMessagingStore(database: ElevenHouseDatabase): MessagingStore {
  return {
    findThreadForAstrologer: (input) => findThreadForAstrologer(database, input),
    findExternalIdentityForThread: (input) => findExternalIdentityForThread(database, input),
    findOutboundMessageByIdempotencyKey: (input) =>
      findOutboundMessageByIdempotencyKey(database, input),
    createOutboundMessage: (input) => createOutboundMessage(database, input),
    recordInboundProviderMessage: (input) => recordInboundProviderMessage(database, input),
    recordTelegramBusinessConnection: (input) => recordTelegramBusinessConnection(database, input),
    startTelegramBusinessConnection: (input) => startTelegramBusinessConnection(database, input),
    recordTelegramBusinessMessage: (input) => recordTelegramBusinessMessage(database, input),
    recordTelegramBusinessDeletedMessages: (input) =>
      recordTelegramBusinessDeletedMessages(database, input),
    recordTelegramBusinessEditedMessage: (input) =>
      recordTelegramBusinessEditedMessage(database, input),
    linkThreadToClient: (input) => linkThreadToClient(database, input),
    createClientFromThread: (input) => createClientFromThread(database, input),
    markThreadRead: (input) => markThreadRead(database, input),
    appendRealtimeEvent: (input) => appendRealtimeEvent(database, input)
  };
}

async function findThreadForAstrologer(
  database: MessagingDatabase,
  input: { readonly astrologerUserId: string; readonly threadId: string }
): Promise<MessagingThread | null> {
  const [row] = await database
    .select({
      thread: messagingThreads,
      externalIdentity: messagingExternalIdentities,
      channelConnection: messagingChannelConnections
    })
    .from(messagingThreads)
    .innerJoin(
      messagingThreadIdentities,
      and(
        eq(messagingThreadIdentities.threadId, messagingThreads.id),
        eq(messagingThreadIdentities.isPrimary, true)
      )
    )
    .innerJoin(
      messagingExternalIdentities,
      eq(messagingExternalIdentities.id, messagingThreadIdentities.externalIdentityId)
    )
    .innerJoin(
      messagingChannelConnections,
      and(
        eq(messagingChannelConnections.id, messagingExternalIdentities.channelConnectionId),
        eq(messagingChannelConnections.astrologerUserId, input.astrologerUserId)
      )
    )
    .where(
      and(
        eq(messagingThreads.id, input.threadId),
        eq(messagingThreads.astrologerUserId, input.astrologerUserId)
      )
    )
    .limit(1);

  return row ? toMessagingThread(row) : null;
}

async function findExternalIdentityForThread(
  database: MessagingDatabase,
  input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly externalIdentityId: string;
  }
): Promise<MessagingThreadExternalIdentity | null> {
  const [row] = await database
    .select({ externalIdentity: messagingExternalIdentities })
    .from(messagingThreadIdentities)
    .innerJoin(messagingThreads, eq(messagingThreads.id, messagingThreadIdentities.threadId))
    .innerJoin(
      messagingExternalIdentities,
      eq(messagingExternalIdentities.id, messagingThreadIdentities.externalIdentityId)
    )
    .innerJoin(
      messagingChannelConnections,
      and(
        eq(messagingChannelConnections.id, messagingExternalIdentities.channelConnectionId),
        eq(messagingChannelConnections.astrologerUserId, input.astrologerUserId)
      )
    )
    .where(
      and(
        eq(messagingThreads.id, input.threadId),
        eq(messagingThreads.astrologerUserId, input.astrologerUserId),
        eq(messagingThreadIdentities.externalIdentityId, input.externalIdentityId)
      )
    )
    .limit(1);

  return row ? toMessagingExternalIdentity(row.externalIdentity) : null;
}

async function findOutboundMessageByIdempotencyKey(
  database: MessagingDatabase,
  input: { readonly threadId: string; readonly idempotencyKey: string }
): Promise<MessagingMessageWithRequestHash | null> {
  const [row] = await database
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.threadId, input.threadId),
        eq(messagingMessages.direction, "outbound"),
        eq(messagingMessages.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);

  return row ? toMessagingMessageWithRequestHash(row) : null;
}

async function createOutboundMessage(
  database: ElevenHouseDatabase,
  input: CreateOutboundMessageStoreInput
): Promise<MessagingMessage> {
  try {
    return await database.transaction(async (transaction) => {
      await requireOwnedThreadChannel(transaction, input);
      const timestamp = new Date(input.now);
      const [row] = await transaction
        .insert(messagingMessages)
        .values({
          id: input.messageId,
          threadId: input.threadId,
          channelConnectionId: input.channelConnectionId,
          externalIdentityId: null,
          direction: "outbound",
          senderKind: "astrologer",
          providerMessageId: null,
          providerUpdateId: null,
          providerSentAt: null,
          contentType: "text",
          text: input.text,
          mediaAssetId: null,
          status: "queued",
          failureCode: null,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .returning();
      if (!row) throw new Error("Expected messaging outbound message insert to return a row");

      const [updatedThread] = await transaction
        .update(messagingThreads)
        .set({
          lastMessageId: row.id,
          lastMessageAt: timestamp,
          updatedAt: timestamp
        })
        .where(
          and(
            eq(messagingThreads.id, input.threadId),
            eq(messagingThreads.astrologerUserId, input.astrologerUserId)
          )
        )
        .returning({ id: messagingThreads.id });
      if (!updatedThread) throw new Error("Messaging thread is not owned by the astrologer");

      await transaction.insert(outboxEvents).values({
        id: input.deliveryRequestedEvent.id,
        eventType: "messaging.message.delivery_requested",
        aggregateId: row.id,
        payload: {
          messageId: row.id,
          threadId: input.threadId,
          channelConnectionId: input.channelConnectionId,
          astrologerUserId: input.astrologerUserId
        },
        status: "pending",
        attempts: 0,
        availableAt: timestamp,
        lockedAt: null,
        publishedAt: null,
        lastError: null,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      return toMessagingMessage(row);
    });
  } catch (error) {
    if (!isOutboundIdempotencyViolation(error)) throw error;
  }

  const existing = await findOutboundMessageByIdempotencyKey(database, input);
  if (!existing) throw new Error("Expected existing messaging outbound message after idempotency conflict");
  if (existing.requestHash !== input.requestHash) throw new MessagingIdempotencyConflictError();
  return existing;
}

async function recordInboundProviderMessage(
  database: ElevenHouseDatabase,
  input: RecordInboundProviderMessageStoreInput
): Promise<{ readonly kind: "created" | "duplicate"; readonly message: MessagingMessage }> {
  try {
    const message = await database.transaction(async (transaction) => {
      const thread = await requireOwnedThreadChannel(transaction, input);
      const externalIdentity = await findExternalIdentityForThread(transaction, input);
      if (!externalIdentity || externalIdentity.channelConnectionId !== thread.channelConnectionId) {
        throw new Error("Messaging external identity is not owned by the thread");
      }

      const timestamp = new Date(input.now);
      const [row] = await transaction
        .insert(messagingMessages)
        .values({
          id: input.messageId,
          threadId: input.threadId,
          channelConnectionId: input.channelConnectionId,
          externalIdentityId: input.externalIdentityId,
          direction: "inbound",
          senderKind: "client",
          providerMessageId: input.providerMessageId,
          providerUpdateId: null,
          providerSentAt: null,
          contentType: "text",
          text: input.text,
          mediaAssetId: null,
          status: "received",
          failureCode: null,
          idempotencyKey: null,
          requestHash: null,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .returning();
      if (!row) throw new Error("Expected messaging inbound message insert to return a row");

      const [updatedThread] = await transaction
        .update(messagingThreads)
        .set({
          lastMessageId: row.id,
          lastMessageAt: timestamp,
          unreadAstrologerCount: sql`${messagingThreads.unreadAstrologerCount} + 1`,
          updatedAt: timestamp
        })
        .where(
          and(
            eq(messagingThreads.id, input.threadId),
            eq(messagingThreads.astrologerUserId, input.astrologerUserId)
          )
        )
        .returning({ id: messagingThreads.id });
      if (!updatedThread) throw new Error("Messaging thread is not owned by the astrologer");

      await appendRealtimeEvent(transaction, {
        ...input.receivedEvent,
        astrologerUserId: thread.astrologerUserId,
        threadId: thread.id,
        messageId: row.id,
        channelConnectionId: row.channelConnectionId,
        externalIdentityId: row.externalIdentityId ?? undefined
      });
      return toMessagingMessage(row);
    });
    return { kind: "created", message };
  } catch (error) {
    if (!isInboundProviderDedupeViolation(error)) throw error;
  }

  const [row] = await database
    .select()
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.channelConnectionId, input.channelConnectionId),
        eq(messagingMessages.externalIdentityId, input.externalIdentityId),
        eq(messagingMessages.providerMessageId, input.providerMessageId),
        eq(messagingMessages.direction, "inbound")
      )
    )
    .limit(1);
  if (!row) throw new Error("Expected existing messaging inbound message after duplicate conflict");
  return { kind: "duplicate", message: toMessagingMessage(row) };
}

async function recordTelegramBusinessConnection(
  database: ElevenHouseDatabase,
  input: RecordTelegramBusinessConnectionStoreInput
): Promise<RecordTelegramBusinessConnectionStoreResult> {
  const connections = await findTelegramBusinessConnections(database, {
    businessConnectionId: input.businessConnectionId,
    activeOnly: false
  });
  if (connections.length > 1) {
    throw new Error("Telegram business connection is not uniquely bound to one channel connection");
  }
  const connection = connections[0] ?? (
    input.enabled ? await findSinglePendingTelegramBusinessConnection(database) : null
  );
  if (!connection) return { kind: "unmatched" };

  const timestamp = new Date(input.now);
  const status = !input.enabled
    ? "revoked"
    : input.rights.canReply && input.rights.canReadMessages
      ? "active"
      : "reauth_required";
  const [row] = await database
    .update(messagingChannelConnections)
    .set({
      status,
      externalAccountId: input.businessConnectionId,
      externalOwnerUserId: input.userId,
      displayNameSnapshot: input.displayName,
      usernameSnapshot: input.username,
      capabilities: toTelegramBusinessCapabilities(input.rights),
      connectedAt: new Date(input.connectedAt),
      lastSyncedAt: timestamp,
      lastErrorCode: status === "reauth_required" ? "telegram_business_rights_missing" : null,
      lastErrorMessage:
        status === "reauth_required" ? "Required Telegram Business rights are missing" : null,
      updatedAt: timestamp
    })
    .where(eq(messagingChannelConnections.id, connection.id))
    .returning({ id: messagingChannelConnections.id });

  return row ? { kind: "recorded" } : { kind: "unmatched" };
}

async function startTelegramBusinessConnection(
  database: ElevenHouseDatabase,
  input: StartTelegramBusinessConnectionStoreInput
): Promise<StartTelegramBusinessConnectionStoreResult> {
  return database.transaction(async (transaction) => {
    await lockTelegramBusinessConnectionStart(transaction, input);
    const existing = await findTelegramBusinessConnectionForAstrologer(transaction, input);
    if (existing) {
      if (["revoked", "paused", "error"].includes(existing.status)) {
        const timestamp = new Date(input.now);
        await transaction
          .update(messagingChannelConnections)
          .set({
            status: "connecting",
            externalAccountId: null,
            externalOwnerUserId: null,
            displayNameSnapshot: null,
            usernameSnapshot: null,
            capabilities: telegramBusinessPendingCapabilities(),
            connectedAt: null,
            lastSyncedAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            updatedAt: timestamp
          })
          .where(eq(messagingChannelConnections.id, existing.id));
      }
      return { connectionId: existing.id };
    }

    const timestamp = new Date(input.now);
    const [row] = await transaction
      .insert(messagingChannelConnections)
      .values({
        id: input.connectionId,
        astrologerUserId: input.astrologerUserId,
        provider: "telegram",
        mode: "telegram_business_bot",
        status: "connecting",
        externalAccountId: null,
        externalOwnerUserId: null,
        displayNameSnapshot: null,
        usernameSnapshot: null,
        capabilities: telegramBusinessPendingCapabilities(),
        consentRecordId: null,
        connectedAt: null,
        lastSyncedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .returning({ id: messagingChannelConnections.id });
    if (!row) throw new Error("Expected Telegram Business channel connection insert to return a row");
    return { connectionId: row.id };
  });
}

async function lockTelegramBusinessConnectionStart(
  database: MessagingDatabase,
  input: { readonly astrologerUserId: string }
): Promise<void> {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`messaging:telegram_business_bot:${input.astrologerUserId}`}))`
  );
}

async function findTelegramBusinessConnectionForAstrologer(
  database: MessagingDatabase,
  input: { readonly astrologerUserId: string }
): Promise<{ readonly id: string; readonly status: string } | null> {
  const [row] = await database
    .select({
      id: messagingChannelConnections.id,
      status: messagingChannelConnections.status
    })
    .from(messagingChannelConnections)
    .where(
      and(
        eq(messagingChannelConnections.astrologerUserId, input.astrologerUserId),
        eq(messagingChannelConnections.provider, "telegram"),
        eq(messagingChannelConnections.mode, "telegram_business_bot")
      )
    )
    .limit(1);
  return row ?? null;
}

async function findSinglePendingTelegramBusinessConnection(
  database: MessagingDatabase
): Promise<{ readonly id: string; readonly astrologerUserId: string } | null> {
  const rows = await database
    .select({
      id: messagingChannelConnections.id,
      astrologerUserId: messagingChannelConnections.astrologerUserId
    })
    .from(messagingChannelConnections)
    .where(
      and(
        eq(messagingChannelConnections.provider, "telegram"),
        eq(messagingChannelConnections.mode, "telegram_business_bot"),
        eq(messagingChannelConnections.status, "connecting"),
        isNull(messagingChannelConnections.externalAccountId)
      )
    )
    .limit(2);

  const row = rows[0];
  return rows.length === 1 && row ? row : null;
}

async function recordTelegramBusinessMessage(
  database: ElevenHouseDatabase,
  input: RecordTelegramBusinessMessageStoreInput
): Promise<{ readonly kind: "created" | "duplicate"; readonly message: MessagingMessage } | { readonly kind: "unmatched" }> {
  try {
    return await database.transaction(async (transaction) => {
      const connections = await findTelegramBusinessConnections(transaction, {
        businessConnectionId: input.businessConnectionId,
        activeOnly: true
      });
      if (connections.length > 1) {
        throw new Error("Telegram business connection is not uniquely bound to one channel connection");
      }
      const connection = connections[0];
      if (!connection) return { kind: "unmatched" as const };

      const timestamp = new Date(input.now);
      const providerSentAt = new Date(input.providerSentAt);
      const isBusinessOwnerMessage = input.providerUserId === connection.externalOwnerUserId;
      const identity = await upsertTelegramExternalIdentity(transaction, {
        channelConnectionId: connection.id,
        providerChatId: input.providerChatId,
        providerUserId: isBusinessOwnerMessage ? null : input.providerUserId,
        username: isBusinessOwnerMessage ? input.chatUsername : input.username,
        displayName: isBusinessOwnerMessage ? input.chatDisplayName : input.displayName,
        now: timestamp
      });
      const thread = await findOrCreateTelegramThread(transaction, {
        astrologerUserId: connection.astrologerUserId,
        externalIdentityId: identity.id,
        now: timestamp
      });

      const [row] = await transaction
        .insert(messagingMessages)
        .values({
          threadId: thread.id,
          channelConnectionId: connection.id,
          externalIdentityId: identity.id,
          direction: isBusinessOwnerMessage ? "outbound" : "inbound",
          senderKind: isBusinessOwnerMessage ? "astrologer" : "client",
          providerMessageId: input.providerMessageId,
          providerUpdateId: input.updateId,
          providerSentAt,
          contentType: input.contentType,
          text: input.text,
          mediaAssetId: null,
          status: isBusinessOwnerMessage ? "sent" : "received",
          failureCode: null,
          idempotencyKey: isBusinessOwnerMessage
            ? telegramBusinessObservedOutboundIdempotencyKey(input)
            : null,
          requestHash: isBusinessOwnerMessage ? hashTelegramBusinessMessageRequest(input) : null,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .returning();
      if (!row) throw new Error("Expected Telegram business message insert to return a row");

      if (input.mediaAttachment) {
        await transaction.insert(messageMediaIngestions).values({
          messageId: row.id,
          channelConnectionId: connection.id,
          provider: "telegram",
          providerFileId: input.mediaAttachment.providerFileId,
          providerFileUniqueId: input.mediaAttachment.providerFileUniqueId,
          providerMimeType: input.mediaAttachment.providerMimeType,
          providerSizeBytes: input.mediaAttachment.providerSizeBytes,
          contentType: input.mediaAttachment.kind,
          durationSeconds: input.mediaAttachment.durationSeconds,
          width: input.mediaAttachment.width,
          height: input.mediaAttachment.height,
          downloadStatus: "pending",
          mediaAssetId: null,
          failureCode: null,
          attemptCount: 0,
          nextRetryAt: null,
          checksumSha256: null,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }

      const threadUpdate = {
        lastMessageId: row.id,
        lastMessageAt: providerSentAt,
        ...(isBusinessOwnerMessage
          ? {}
          : { unreadAstrologerCount: sql`${messagingThreads.unreadAstrologerCount} + 1` }),
        updatedAt: timestamp
      };
      const [updatedThread] = await transaction
        .update(messagingThreads)
        .set(threadUpdate)
        .where(
          and(
            eq(messagingThreads.id, thread.id),
            eq(messagingThreads.astrologerUserId, connection.astrologerUserId)
          )
        )
        .returning({ id: messagingThreads.id });
      if (!updatedThread) throw new Error("Messaging thread is not owned by the astrologer");

      await appendRealtimeEvent(transaction, {
        astrologerUserId: connection.astrologerUserId,
        type: messagingMessageReceivedEventType,
        occurredAt: input.now,
        threadId: thread.id,
        messageId: row.id,
        channelConnectionId: connection.id,
        externalIdentityId: identity.id
      });

      return { kind: "created" as const, message: toMessagingMessage(row) };
    });
  } catch (error) {
    if (!isTelegramBusinessMessageDedupeViolation(error)) throw error;
  }

  const existing = await findTelegramBusinessMessage(database, input);
  if (!existing) throw new Error("Expected existing Telegram business message after duplicate conflict");
  return { kind: "duplicate", message: existing };
}

async function recordTelegramBusinessDeletedMessages(
  database: ElevenHouseDatabase,
  input: RecordTelegramBusinessDeletedMessagesStoreInput
): Promise<RecordTelegramBusinessDeletedMessagesStoreResult> {
  return database.transaction(async (transaction) => {
    const connections = await findTelegramBusinessConnections(transaction, {
      businessConnectionId: input.businessConnectionId,
      activeOnly: true
    });
    if (connections.length > 1) {
      throw new Error("Telegram business connection is not uniquely bound to one channel connection");
    }
    const connection = connections[0];
    if (!connection) return { kind: "unmatched" as const };

    const identity = await findTelegramExternalIdentityByChat(transaction, {
      channelConnectionId: connection.id,
      providerChatId: input.providerChatId
    });
    if (!identity) return { kind: "unmatched" as const };

    const timestamp = new Date(input.now);
    const deletedRows = await transaction
      .update(messagingMessages)
      .set({ status: "deleted", updatedAt: timestamp })
      .where(
        and(
          eq(messagingMessages.channelConnectionId, connection.id),
          eq(messagingMessages.externalIdentityId, identity.id),
          inArray(messagingMessages.providerMessageId, [...input.providerMessageIds]),
          ne(messagingMessages.status, "deleted")
        )
      )
      .returning({
        id: messagingMessages.id,
        threadId: messagingMessages.threadId,
        channelConnectionId: messagingMessages.channelConnectionId,
        externalIdentityId: messagingMessages.externalIdentityId,
        direction: messagingMessages.direction
      });
    if (deletedRows.length === 0) return { kind: "recorded" as const, deletedCount: 0 };

    const threadIds = [...new Set(deletedRows.map((row) => row.threadId))];
    for (const threadId of threadIds) {
      const deletedInboundCount = deletedRows.filter(
        (row) => row.threadId === threadId && row.direction === "inbound"
      ).length;
      const latestVisibleMessage = await findLatestVisibleMessageForThread(transaction, { threadId });
      const threadUpdate = {
        lastMessageId: latestVisibleMessage?.id ?? null,
        lastMessageAt: latestVisibleMessage ? new Date(latestVisibleMessage.messageAt) : null,
        ...(deletedInboundCount > 0
          ? {
              unreadAstrologerCount: sql`greatest(${messagingThreads.unreadAstrologerCount} - ${deletedInboundCount}, 0)`
            }
          : {}),
        updatedAt: timestamp
      };
      const [updatedThread] = await transaction
        .update(messagingThreads)
        .set(threadUpdate)
        .where(
          and(
            eq(messagingThreads.id, threadId),
            eq(messagingThreads.astrologerUserId, connection.astrologerUserId)
          )
        )
        .returning({ id: messagingThreads.id });
      if (!updatedThread) throw new Error("Messaging thread is not owned by the astrologer");
    }

    for (const row of deletedRows) {
      await appendRealtimeEvent(transaction, {
        astrologerUserId: connection.astrologerUserId,
        type: messagingMessageDeletedEventType,
        occurredAt: input.now,
        threadId: row.threadId,
        messageId: row.id,
        channelConnectionId: row.channelConnectionId,
        externalIdentityId: row.externalIdentityId ?? undefined
      });
    }

    return { kind: "recorded" as const, deletedCount: deletedRows.length };
  });
}

async function recordTelegramBusinessEditedMessage(
  database: ElevenHouseDatabase,
  input: RecordTelegramBusinessEditedMessageStoreInput
): Promise<RecordTelegramBusinessEditedMessageStoreResult> {
  return database.transaction(async (transaction) => {
    const connections = await findTelegramBusinessConnections(transaction, {
      businessConnectionId: input.businessConnectionId,
      activeOnly: true
    });
    if (connections.length > 1) {
      throw new Error("Telegram business connection is not uniquely bound to one channel connection");
    }
    const connection = connections[0];
    if (!connection) return { kind: "unmatched" as const };

    const identity = await findTelegramExternalIdentityByChat(transaction, {
      channelConnectionId: connection.id,
      providerChatId: input.providerChatId
    });
    if (!identity) return { kind: "unmatched" as const };

    const timestamp = new Date(input.now);
    const [updatedRow] = await transaction
      .update(messagingMessages)
      .set({
        text: input.text,
        providerUpdateId: input.updateId,
        providerSentAt: new Date(input.providerSentAt),
        updatedAt: timestamp
      })
      .where(
        and(
          eq(messagingMessages.channelConnectionId, connection.id),
          eq(messagingMessages.externalIdentityId, identity.id),
          eq(messagingMessages.providerMessageId, input.providerMessageId),
          ne(messagingMessages.status, "deleted"),
          sql`${messagingMessages.providerUpdateId} is distinct from ${input.updateId}`
        )
      )
      .returning({
        id: messagingMessages.id,
        threadId: messagingMessages.threadId,
        channelConnectionId: messagingMessages.channelConnectionId,
        externalIdentityId: messagingMessages.externalIdentityId
      });
    if (!updatedRow) return { kind: "recorded" as const, updatedCount: 0 };

    const [updatedThread] = await transaction
      .update(messagingThreads)
      .set({ updatedAt: timestamp })
      .where(
        and(
          eq(messagingThreads.id, updatedRow.threadId),
          eq(messagingThreads.astrologerUserId, connection.astrologerUserId)
        )
      )
      .returning({ id: messagingThreads.id });
    if (!updatedThread) throw new Error("Messaging thread is not owned by the astrologer");

    await appendRealtimeEvent(transaction, {
      astrologerUserId: connection.astrologerUserId,
      type: messagingMessageUpdatedEventType,
      occurredAt: input.providerEditedAt,
      threadId: updatedRow.threadId,
      messageId: updatedRow.id,
      channelConnectionId: updatedRow.channelConnectionId,
      externalIdentityId: updatedRow.externalIdentityId ?? undefined
    });

    return { kind: "recorded" as const, updatedCount: 1 };
  });
}

async function linkThreadToClient(
  database: ElevenHouseDatabase,
  input: LinkThreadToClientStoreInput
): Promise<MessagingThread> {
  return executeIdempotentThreadClientCommand({
    database,
    input,
    scope: linkThreadClientScope,
    create: async (transaction) => {
      const thread = await requireOwnedThread(transaction, input);
      await assertActiveClientRelationship(transaction, input);
      return linkPrimaryIdentityToClient(transaction, { ...input, thread });
    }
  });
}

async function createClientFromThread(
  database: ElevenHouseDatabase,
  input: CreateClientFromThreadStoreInput
): Promise<MessagingThread> {
  return executeIdempotentThreadClientCommand({
    database,
    input,
    scope: createThreadClientScope,
    create: async (transaction) => {
      const thread = await requireOwnedThread(transaction, input);
      const timestamp = new Date(input.now);
      const [user] = await transaction
        .insert(users)
        .values({ status: "active", createdAt: timestamp, updatedAt: timestamp })
        .returning({ id: users.id });
      if (!user) throw new Error("Expected manual messaging client user insert to return a row");

      await transaction.insert(userRoleAssignments).values({
        userId: user.id,
        role: "client",
        assignedByUserId: input.astrologerUserId,
        assignedAt: timestamp
      });
      await transaction.insert(clientProfiles).values({
        userId: user.id,
        displayNameSnapshot: input.displayName,
        preferredLocale: null,
        timezone: null,
        createdAt: timestamp,
        updatedAt: timestamp
      });
      await transaction.insert(clientAstrologerRelationships).values({
        clientUserId: user.id,
        astrologerUserId: input.astrologerUserId,
        source: "manual",
        status: "active",
        firstLinkedAt: timestamp,
        lastLinkedAt: timestamp,
        archivedAt: null,
        blockedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp
      });
      return linkPrimaryIdentityToClient(transaction, { ...input, clientUserId: user.id, thread });
    }
  });
}

async function executeIdempotentThreadClientCommand(input: {
  readonly database: ElevenHouseDatabase;
  readonly input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly idempotencyKey: string;
    readonly requestHash: `sha256:${string}`;
    readonly now: string;
    readonly expiresAt: string;
  };
  readonly scope: typeof linkThreadClientScope | typeof createThreadClientScope;
  readonly create: (transaction: MessagingTransaction) => Promise<MessagingThread>;
}): Promise<MessagingThread> {
  try {
    return await input.database.transaction(async (transaction) => {
      const [command] = await transaction
        .insert(idempotencyCommands)
        .values({
          apiSurface: astrologerApiSurface,
          actorUserId: input.input.astrologerUserId,
          commandScope: input.scope,
          key: input.input.idempotencyKey,
          requestHash: input.input.requestHash,
          expiresAt: new Date(input.input.expiresAt),
          createdAt: new Date(input.input.now),
          updatedAt: new Date(input.input.now)
        })
        .returning({ id: idempotencyCommands.id });
      if (!command) throw new Error("Expected messaging idempotency command insert to return a row");

      const thread = await input.create(transaction);
      if (!thread.clientUserId) throw new Error("Expected linked messaging thread client user id");
      await transaction
        .update(idempotencyCommands)
        .set({
          state: "completed",
          result: { clientUserId: thread.clientUserId, threadId: thread.id },
          updatedAt: new Date(input.input.now)
        })
        .where(eq(idempotencyCommands.id, command.id));
      return thread;
    });
  } catch (error) {
    if (!isThreadClientIdempotencyViolation(error)) throw error;
  }

  const [command] = await input.database
    .select({
      requestHash: idempotencyCommands.requestHash,
      state: idempotencyCommands.state,
      result: idempotencyCommands.result
    })
    .from(idempotencyCommands)
    .where(
      and(
        eq(idempotencyCommands.apiSurface, astrologerApiSurface),
        eq(idempotencyCommands.actorUserId, input.input.astrologerUserId),
        eq(idempotencyCommands.commandScope, input.scope),
        eq(idempotencyCommands.key, input.input.idempotencyKey)
      )
    )
    .limit(1);
  if (!command) throw new Error("Expected messaging idempotency command after unique conflict");
  if (command.requestHash !== input.input.requestHash) throw new MessagingIdempotencyConflictError();
  const result = readThreadClientIdempotencyResult(command.state, command.result);
  const thread = await findThreadForAstrologer(input.database, {
    astrologerUserId: input.input.astrologerUserId,
    threadId: result.threadId
  });
  if (!thread || thread.clientUserId !== result.clientUserId) {
    throw new Error("Persisted messaging idempotency result is inconsistent");
  }
  return thread;
}

function readThreadClientIdempotencyResult(
  state: string,
  result: Record<string, unknown> | null
): { readonly threadId: string; readonly clientUserId: string } {
  const threadId = result?.threadId;
  const clientUserId = result?.clientUserId;
  if (
    state !== "completed" ||
    typeof threadId !== "string" ||
    threadId.length === 0 ||
    typeof clientUserId !== "string" ||
    clientUserId.length === 0
  ) {
    throw new Error("Persisted messaging idempotency result is incomplete");
  }
  return { threadId, clientUserId };
}

async function requireOwnedThread(
  database: MessagingDatabase,
  input: { readonly astrologerUserId: string; readonly threadId: string }
): Promise<MessagingThread> {
  const thread = await findThreadForAstrologer(database, input);
  if (!thread) throw new Error("Messaging thread is not owned by the astrologer");
  return thread;
}

async function assertActiveClientRelationship(
  database: MessagingDatabase,
  input: { readonly astrologerUserId: string; readonly clientUserId: string }
): Promise<void> {
  const [relationship] = await database
    .select({ id: clientAstrologerRelationships.id })
    .from(clientAstrologerRelationships)
    .where(
      and(
        eq(clientAstrologerRelationships.astrologerUserId, input.astrologerUserId),
        eq(clientAstrologerRelationships.clientUserId, input.clientUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .limit(1);
  if (!relationship) throw new MessagingClientRelationshipError();
}

async function linkPrimaryIdentityToClient(
  database: MessagingTransaction,
  input: {
    readonly thread: MessagingThread;
    readonly astrologerUserId: string;
    readonly clientUserId: string;
    readonly now: string;
  }
): Promise<MessagingThread> {
  const timestamp = new Date(input.now);
  const externalIdentityId = input.thread.externalIdentityId;
  if (!externalIdentityId) throw new Error("Messaging thread primary identity is missing");
  const [updatedThread] = await database
    .update(messagingThreads)
    .set({ clientUserId: input.clientUserId, updatedAt: timestamp })
    .where(
      and(
        eq(messagingThreads.id, input.thread.id),
        eq(messagingThreads.astrologerUserId, input.astrologerUserId)
      )
    )
    .returning({ id: messagingThreads.id });
  if (!updatedThread) throw new Error("Messaging thread is not owned by the astrologer");

  const [updatedIdentity] = await database
    .update(messagingExternalIdentities)
    .set({ linkedClientUserId: input.clientUserId, linkStatus: "linked" })
    .where(eq(messagingExternalIdentities.id, externalIdentityId))
    .returning({ id: messagingExternalIdentities.id });
  if (!updatedIdentity) throw new Error("Messaging thread primary identity is missing");

  const thread = await findThreadForAstrologer(database, {
    astrologerUserId: input.astrologerUserId,
    threadId: input.thread.id
  });
  if (!thread) throw new Error("Messaging thread primary identity is missing");
  return thread;
}

async function upsertTelegramExternalIdentity(
  database: MessagingTransaction,
  input: {
    readonly channelConnectionId: string;
    readonly providerChatId: string;
    readonly providerUserId: string | null;
    readonly username: string | null;
    readonly displayName: string | null;
    readonly now: Date;
  }
): Promise<MessagingExternalIdentityRow> {
  const [row] = await database
    .insert(messagingExternalIdentities)
    .values({
      channelConnectionId: input.channelConnectionId,
      provider: "telegram",
      providerUserId: input.providerUserId,
      providerChatId: input.providerChatId,
      usernameSnapshot: input.username,
      displayNameSnapshot: input.displayName,
      avatarMediaId: null,
      linkedClientUserId: null,
      linkStatus: "unlinked",
      firstSeenAt: input.now,
      lastSeenAt: input.now
    })
    .onConflictDoUpdate({
      target: [
        messagingExternalIdentities.channelConnectionId,
        messagingExternalIdentities.providerChatId
      ],
      set: {
        providerUserId: input.providerUserId,
        usernameSnapshot: input.username,
        displayNameSnapshot: input.displayName,
        lastSeenAt: input.now
      }
    })
    .returning();
  if (!row) throw new Error("Expected Telegram external identity upsert to return a row");
  return row;
}

async function findTelegramExternalIdentityByChat(
  database: MessagingDatabase,
  input: { readonly channelConnectionId: string; readonly providerChatId: string }
): Promise<MessagingExternalIdentityRow | null> {
  const [row] = await database
    .select()
    .from(messagingExternalIdentities)
    .where(
      and(
        eq(messagingExternalIdentities.channelConnectionId, input.channelConnectionId),
        eq(messagingExternalIdentities.provider, "telegram"),
        eq(messagingExternalIdentities.providerChatId, input.providerChatId)
      )
    )
    .limit(1);
  return row ?? null;
}

async function findTelegramBusinessConnections(
  database: MessagingDatabase,
  input: { readonly businessConnectionId: string; readonly activeOnly: boolean }
): Promise<Array<{
  readonly id: string;
  readonly astrologerUserId: string;
  readonly externalOwnerUserId: string | null;
}>> {
  const filters = [
    eq(messagingChannelConnections.provider, "telegram"),
    eq(messagingChannelConnections.mode, "telegram_business_bot"),
    eq(messagingChannelConnections.externalAccountId, input.businessConnectionId)
  ];
  if (input.activeOnly) {
    filters.push(eq(messagingChannelConnections.status, "active"));
  }

  return database
    .select({
      id: messagingChannelConnections.id,
      astrologerUserId: messagingChannelConnections.astrologerUserId,
      externalOwnerUserId: messagingChannelConnections.externalOwnerUserId
    })
    .from(messagingChannelConnections)
    .where(and(...filters))
    .limit(2);
}

async function findOrCreateTelegramThread(
  database: MessagingTransaction,
  input: {
    readonly astrologerUserId: string;
    readonly externalIdentityId: string;
    readonly now: Date;
  }
): Promise<MessagingThread> {
  const existing = await findThreadByExternalIdentity(database, input);
  if (existing) return existing;

  try {
    const [thread] = await database
      .insert(messagingThreads)
      .values({
        astrologerUserId: input.astrologerUserId,
        clientUserId: null,
        status: "open",
        lastMessageId: null,
        lastMessageAt: null,
        unreadAstrologerCount: 0,
        createdAt: input.now,
        updatedAt: input.now
      })
      .returning({ id: messagingThreads.id });
    if (!thread) throw new Error("Expected Telegram messaging thread insert to return a row");

    await database.insert(messagingThreadIdentities).values({
      threadId: thread.id,
      externalIdentityId: input.externalIdentityId,
      provider: "telegram",
      isPrimary: true,
      createdAt: input.now
    });
  } catch (error) {
    if (!isThreadIdentityExternalIdentityViolation(error)) throw error;
  }

  const created = await findThreadByExternalIdentity(database, input);
  if (!created) throw new Error("Expected Telegram messaging thread identity link");
  return created;
}

async function findThreadByExternalIdentity(
  database: MessagingDatabase,
  input: { readonly astrologerUserId: string; readonly externalIdentityId: string }
): Promise<MessagingThread | null> {
  const [row] = await database
    .select({
      thread: messagingThreads,
      externalIdentity: messagingExternalIdentities,
      channelConnection: messagingChannelConnections
    })
    .from(messagingThreadIdentities)
    .innerJoin(messagingThreads, eq(messagingThreads.id, messagingThreadIdentities.threadId))
    .innerJoin(
      messagingExternalIdentities,
      eq(messagingExternalIdentities.id, messagingThreadIdentities.externalIdentityId)
    )
    .innerJoin(
      messagingChannelConnections,
      eq(messagingChannelConnections.id, messagingExternalIdentities.channelConnectionId)
    )
    .where(
      and(
        eq(messagingThreadIdentities.externalIdentityId, input.externalIdentityId),
        eq(messagingThreadIdentities.isPrimary, true),
        eq(messagingThreads.astrologerUserId, input.astrologerUserId)
      )
    )
    .limit(1);

  return row ? toMessagingThread(row) : null;
}

async function findTelegramBusinessMessage(
  database: MessagingDatabase,
  input: {
    readonly businessConnectionId: string;
    readonly providerChatId: string;
    readonly providerMessageId: string;
  }
): Promise<MessagingMessage | null> {
  const [row] = await database
    .select({ message: messagingMessages })
    .from(messagingMessages)
    .innerJoin(
      messagingChannelConnections,
      eq(messagingChannelConnections.id, messagingMessages.channelConnectionId)
    )
    .innerJoin(
      messagingExternalIdentities,
      eq(messagingExternalIdentities.id, messagingMessages.externalIdentityId)
    )
    .where(
      and(
        eq(messagingChannelConnections.provider, "telegram"),
        eq(messagingChannelConnections.mode, "telegram_business_bot"),
        eq(messagingChannelConnections.externalAccountId, input.businessConnectionId),
        eq(messagingExternalIdentities.providerChatId, input.providerChatId),
        eq(messagingMessages.providerMessageId, input.providerMessageId)
      )
    )
    .limit(1);

  return row ? toMessagingMessage(row.message) : null;
}

async function findLatestVisibleMessageForThread(
  database: MessagingDatabase,
  input: { readonly threadId: string }
): Promise<{ readonly id: string; readonly messageAt: Date | string } | null> {
  const messageAt = sql<Date>`coalesce(${messagingMessages.providerSentAt}, ${messagingMessages.createdAt})`;
  const [row] = await database
    .select({
      id: messagingMessages.id,
      messageAt
    })
    .from(messagingMessages)
    .where(and(eq(messagingMessages.threadId, input.threadId), ne(messagingMessages.status, "deleted")))
    .orderBy(desc(messageAt), desc(messagingMessages.createdAt), desc(messagingMessages.id))
    .limit(1);
  return row ?? null;
}

function telegramBusinessObservedOutboundIdempotencyKey(
  input: RecordTelegramBusinessMessageStoreInput
): string {
  return [
    "telegram-business",
    input.businessConnectionId,
    input.providerChatId,
    input.providerMessageId
  ].join(":");
}

function hashTelegramBusinessMessageRequest(
  input: RecordTelegramBusinessMessageStoreInput
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        businessConnectionId: input.businessConnectionId,
        providerChatId: input.providerChatId,
        providerMessageId: input.providerMessageId,
        contentType: input.contentType,
        text: input.text,
        providerSentAt: input.providerSentAt
      })
    )
    .digest("hex")}`;
}

function toTelegramBusinessCapabilities(
  rights: RecordTelegramBusinessConnectionStoreInput["rights"]
): Record<string, boolean> {
  return {
    canSend: rights.canReply,
    canReceive: rights.canReadMessages,
    canRead: rights.canReadMessages,
    supportsHistoryImport: false,
    supportsMessageEdits: false,
    supportsMessageDeletes: rights.canDeleteSentMessages || rights.canDeleteAllMessages,
    supportsAttachments: false
  };
}

function telegramBusinessPendingCapabilities(): Record<string, boolean> {
  return {
    canSend: false,
    canReceive: false,
    canRead: false,
    supportsHistoryImport: false,
    supportsMessageEdits: false,
    supportsMessageDeletes: false,
    supportsAttachments: false
  };
}

async function markThreadRead(
  database: ElevenHouseDatabase,
  input: MarkThreadReadStoreInput
): Promise<MarkThreadReadStoreResult> {
  return database.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(messagingThreads)
      .set({ unreadAstrologerCount: 0, updatedAt: new Date(input.now) })
      .where(
        and(
          eq(messagingThreads.id, input.threadId),
          eq(messagingThreads.astrologerUserId, input.astrologerUserId)
        )
      )
      .returning({ id: messagingThreads.id });
    if (!updated) throw new Error("Messaging thread is not owned by the astrologer");

    const thread = await findThreadForAstrologer(transaction, input);
    if (!thread) throw new Error("Messaging thread primary identity is missing");
    const realtimeEvent = await appendRealtimeEvent(transaction, {
      ...input.realtimeEvent,
      astrologerUserId: thread.astrologerUserId,
      threadId: thread.id,
      messageId: undefined,
      channelConnectionId: thread.channelConnectionId,
      externalIdentityId: thread.externalIdentityId ?? undefined
    });
    return { thread, realtimeEvent };
  });
}

async function appendRealtimeEvent(
  database: MessagingDatabase,
  input: AppendMessagingRealtimeEventInput
): Promise<MessagingRealtimeEvent> {
  await assertRealtimeReferencesOwned(database, input);
  const [row] = await database
    .insert(messagingRealtimeEvents)
    .values({
      astrologerUserId: input.astrologerUserId,
      type: input.type,
      threadId: input.threadId ?? null,
      messageId: input.messageId ?? null,
      channelConnectionId: input.channelConnectionId ?? null,
      externalIdentityId: input.externalIdentityId ?? null,
      createdAt: new Date(input.occurredAt)
    })
    .returning();
  if (!row) throw new Error("Expected messaging realtime event insert to return a row");
  return toMessagingRealtimeEvent(row);
}

async function requireOwnedThreadChannel(
  database: MessagingDatabase,
  input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly channelConnectionId: string;
  }
): Promise<MessagingThread> {
  const thread = await findThreadForAstrologer(database, input);
  if (!thread || thread.channelConnectionId !== input.channelConnectionId) {
    throw new Error("Messaging thread channel is not owned by the astrologer");
  }
  return thread;
}

async function assertRealtimeReferencesOwned(
  database: MessagingDatabase,
  input: AppendMessagingRealtimeEventInput
): Promise<void> {
  const checks = [
    input.threadId
      ? await database
          .select({ id: messagingThreads.id })
          .from(messagingThreads)
          .where(
            and(
              eq(messagingThreads.id, input.threadId),
              eq(messagingThreads.astrologerUserId, input.astrologerUserId)
            )
          )
          .limit(1)
      : [{}],
    input.messageId
      ? await database
          .select({ id: messagingMessages.id })
          .from(messagingMessages)
          .innerJoin(messagingThreads, eq(messagingThreads.id, messagingMessages.threadId))
          .where(
            and(
              eq(messagingMessages.id, input.messageId),
              eq(messagingThreads.astrologerUserId, input.astrologerUserId)
            )
          )
          .limit(1)
      : [{}],
    input.channelConnectionId
      ? await database
          .select({ id: messagingChannelConnections.id })
          .from(messagingChannelConnections)
          .where(
            and(
              eq(messagingChannelConnections.id, input.channelConnectionId),
              eq(messagingChannelConnections.astrologerUserId, input.astrologerUserId)
            )
          )
          .limit(1)
      : [{}],
    input.externalIdentityId
      ? await database
          .select({ id: messagingExternalIdentities.id })
          .from(messagingExternalIdentities)
          .innerJoin(
            messagingChannelConnections,
            eq(messagingChannelConnections.id, messagingExternalIdentities.channelConnectionId)
          )
          .where(
            and(
              eq(messagingExternalIdentities.id, input.externalIdentityId),
              eq(messagingChannelConnections.astrologerUserId, input.astrologerUserId)
            )
          )
          .limit(1)
      : [{}]
  ];
  if (checks.some(([row]) => !row)) {
    throw new Error("Messaging realtime event reference is not owned by the astrologer");
  }
}

function toMessagingChannelConnection(row: MessagingChannelConnectionRow) {
  return { id: row.id, astrologerUserId: row.astrologerUserId };
}

function toMessagingExternalIdentity(
  row: MessagingExternalIdentityRow
): MessagingThreadExternalIdentity {
  return { id: row.id, channelConnectionId: row.channelConnectionId };
}

function toMessagingThread(row: ThreadProjection): MessagingThread {
  const channelConnection = toMessagingChannelConnection(row.channelConnection);
  return {
    id: row.thread.id,
    astrologerUserId: row.thread.astrologerUserId,
    clientUserId: row.thread.clientUserId,
    channelConnectionId: channelConnection.id,
    externalIdentityId: row.externalIdentity.id,
    status: row.thread.status as MessagingThread["status"],
    lastMessageAt: toOptionalIsoString(row.thread.lastMessageAt),
    unreadAstrologerCount: row.thread.unreadAstrologerCount,
    createdAt: row.thread.createdAt.toISOString(),
    updatedAt: row.thread.updatedAt.toISOString()
  };
}

function toMessagingMessage(row: MessagingMessageRow): MessagingMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    channelConnectionId: row.channelConnectionId,
    externalIdentityId: row.externalIdentityId,
    direction: row.direction as MessagingMessage["direction"],
    text: row.text,
    status: row.status as MessagingMessage["status"],
    providerMessageId: row.providerMessageId,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toMessagingMessageWithRequestHash(row: MessagingMessageRow): MessagingMessageWithRequestHash {
  if (!row.requestHash) throw new Error("Outbound messaging message request hash is missing");
  return { ...toMessagingMessage(row), requestHash: row.requestHash as `sha256:${string}` };
}

function toMessagingRealtimeEvent(row: MessagingRealtimeEventRow): MessagingRealtimeEvent {
  return {
    eventId: row.eventId.toString(),
    astrologerUserId: row.astrologerUserId,
    type: row.type as MessagingRealtimeEvent["type"],
    occurredAt: row.createdAt.toISOString(),
    threadId: row.threadId ?? undefined,
    messageId: row.messageId ?? undefined,
    channelConnectionId: row.channelConnectionId ?? undefined,
    externalIdentityId: row.externalIdentityId ?? undefined
  };
}

function toOptionalIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isInboundProviderDedupeViolation(error: unknown): boolean {
  return hasPostgresConstraintViolation(error, "23505", inboundProviderDedupeConstraint);
}

function isOutboundIdempotencyViolation(error: unknown): boolean {
  return hasPostgresConstraintViolation(error, "23505", outboundIdempotencyConstraint);
}

function isTelegramBusinessMessageDedupeViolation(error: unknown): boolean {
  return isInboundProviderDedupeViolation(error) || isOutboundIdempotencyViolation(error);
}

function isThreadIdentityExternalIdentityViolation(error: unknown): boolean {
  return hasPostgresConstraintViolation(error, "23505", threadIdentityExternalIdentityConstraint);
}

function isThreadClientIdempotencyViolation(error: unknown): boolean {
  return hasPostgresConstraintViolation(error, "23505", threadClientIdempotencyConstraint);
}
