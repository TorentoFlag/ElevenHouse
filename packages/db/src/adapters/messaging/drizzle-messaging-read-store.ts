import { and, asc, desc, eq, gt } from "drizzle-orm";
import type {
  MessagingReadChannelConnection,
  MessagingReadExternalIdentity,
  MessagingReadMessage,
  MessagingRealtimeEvent,
  MessagingReadStore,
  MessagingReadThread
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  messagingChannelConnections,
  messagingExternalIdentities,
  messagingMessages,
  messagingRealtimeEvents,
  messagingThreadIdentities,
  messagingThreads
} from "../../schema";

type MessagingChannelConnectionRow = typeof messagingChannelConnections.$inferSelect;
type MessagingExternalIdentityRow = typeof messagingExternalIdentities.$inferSelect;
type MessagingMessageRow = typeof messagingMessages.$inferSelect;
type MessagingRealtimeEventRow = typeof messagingRealtimeEvents.$inferSelect;
type MessagingThreadRow = typeof messagingThreads.$inferSelect;

export function createDrizzleMessagingReadStore(database: ElevenHouseDatabase): MessagingReadStore {
  return {
    listChannelConnections: async ({ astrologerUserId }) => {
      const rows = await database
        .select()
        .from(messagingChannelConnections)
        .where(eq(messagingChannelConnections.astrologerUserId, astrologerUserId))
        .orderBy(desc(messagingChannelConnections.updatedAt), desc(messagingChannelConnections.id))
        .limit(100);
      return { channelConnections: rows.map(toChannelConnection) };
    },
    listThreads: async (input) => {
      const rows = await database
        .select()
        .from(messagingThreads)
        .where(eq(messagingThreads.astrologerUserId, input.astrologerUserId))
        .orderBy(desc(messagingThreads.lastMessageAt), desc(messagingThreads.id))
        .limit(input.limit + 1)
        .offset(input.offset);
      const hasMore = rows.length > input.limit;
      const visible = rows.slice(0, input.limit);
      return {
        threads: await Promise.all(visible.map((row) => toReadThread(database, row))),
        nextCursor: hasMore ? String(input.offset + visible.length) : null
      };
    },
    getThread: async (input) => {
      const [threadRow] = await database
        .select()
        .from(messagingThreads)
        .where(
          and(
            eq(messagingThreads.id, input.threadId),
            eq(messagingThreads.astrologerUserId, input.astrologerUserId)
          )
        )
        .limit(1);
      if (!threadRow) return null;

      const rows = await database
        .select()
        .from(messagingMessages)
        .where(eq(messagingMessages.threadId, threadRow.id))
        .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id))
        .limit(input.limit + 1)
        .offset(input.offset);
      const hasMore = rows.length > input.limit;
      const visible = rows.slice(0, input.limit);
      return {
        thread: await toReadThread(database, threadRow),
        messages: visible.map(toMessage),
        nextCursor: hasMore ? String(input.offset + visible.length) : null
      };
    },
    listRealtimeEvents: async (input) => {
      const rows = await database
        .select()
        .from(messagingRealtimeEvents)
        .where(
          and(
            eq(messagingRealtimeEvents.astrologerUserId, input.astrologerUserId),
            ...(input.afterEventId === undefined
              ? []
              : [gt(messagingRealtimeEvents.eventId, BigInt(input.afterEventId))])
          )
        )
        .orderBy(asc(messagingRealtimeEvents.eventId))
        .limit(input.limit);
      return { events: rows.map(toRealtimeEvent) };
    }
  };
}

async function toReadThread(
  database: ElevenHouseDatabase,
  thread: MessagingThreadRow
): Promise<MessagingReadThread> {
  const [identityRow] = await database
    .select({ identity: messagingExternalIdentities })
    .from(messagingThreadIdentities)
    .innerJoin(
      messagingExternalIdentities,
      eq(messagingExternalIdentities.id, messagingThreadIdentities.externalIdentityId)
    )
    .where(
      and(
        eq(messagingThreadIdentities.threadId, thread.id),
        eq(messagingThreadIdentities.isPrimary, true)
      )
    )
    .limit(1);
  const [lastMessageRow] = thread.lastMessageId
    ? await database
        .select()
        .from(messagingMessages)
        .where(eq(messagingMessages.id, thread.lastMessageId))
        .limit(1)
    : [];
  return {
    id: thread.id,
    clientUserId: thread.clientUserId,
    status: thread.status as MessagingReadThread["status"],
    primaryIdentity: identityRow ? toExternalIdentity(identityRow.identity) : null,
    lastMessage: lastMessageRow ? toMessage(lastMessageRow) : null,
    lastMessageAt: toNullableIsoString(thread.lastMessageAt),
    unreadCount: thread.unreadAstrologerCount,
    createdAt: toIsoString(thread.createdAt),
    updatedAt: toIsoString(thread.updatedAt)
  };
}

function toChannelConnection(row: MessagingChannelConnectionRow): MessagingReadChannelConnection {
  return {
    id: row.id,
    provider: row.provider as MessagingReadChannelConnection["provider"],
    mode: row.mode as MessagingReadChannelConnection["mode"],
    status: row.status as MessagingReadChannelConnection["status"],
    displayName: row.displayNameSnapshot,
    username: row.usernameSnapshot,
    capabilities: row.capabilities,
    connectedAt: toNullableIsoString(row.connectedAt),
    lastSyncedAt: toNullableIsoString(row.lastSyncedAt),
    lastErrorCode: row.lastErrorCode
  };
}

function toExternalIdentity(row: MessagingExternalIdentityRow): MessagingReadExternalIdentity {
  return {
    id: row.id,
    channelConnectionId: row.channelConnectionId,
    provider: row.provider as MessagingReadExternalIdentity["provider"],
    providerUserId: row.providerUserId,
    providerChatId: row.providerChatId,
    username: row.usernameSnapshot,
    displayName: row.displayNameSnapshot,
    avatarMediaId: row.avatarMediaId,
    linkedClientUserId: row.linkedClientUserId,
    linkStatus: row.linkStatus as MessagingReadExternalIdentity["linkStatus"],
    firstSeenAt: toIsoString(row.firstSeenAt),
    lastSeenAt: toIsoString(row.lastSeenAt)
  };
}

function toMessage(row: MessagingMessageRow): MessagingReadMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    channelConnectionId: row.channelConnectionId,
    externalIdentityId: row.externalIdentityId,
    direction: row.direction as MessagingReadMessage["direction"],
    senderKind: row.senderKind as MessagingReadMessage["senderKind"],
    contentType: row.contentType as MessagingReadMessage["contentType"],
    text: row.text,
    mediaAssetId: row.mediaAssetId,
    status: row.status as MessagingReadMessage["status"],
    failureCode: row.failureCode,
    providerSentAt: toNullableIsoString(row.providerSentAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toRealtimeEvent(
  row: MessagingRealtimeEventRow
): MessagingRealtimeEvent & { readonly astrologerUserId: string } {
  return {
    eventId: row.eventId.toString(),
    astrologerUserId: row.astrologerUserId,
    type: row.type as MessagingRealtimeEvent["type"],
    occurredAt: toIsoString(row.createdAt),
    threadId: row.threadId ?? undefined,
    messageId: row.messageId ?? undefined,
    channelConnectionId: row.channelConnectionId ?? undefined,
    externalIdentityId: row.externalIdentityId ?? undefined
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIsoString(value: Date | string | null): string | null {
  return value ? toIsoString(value) : null;
}
