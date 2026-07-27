import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import type {
  MessagingReadChannelConnection,
  MessagingReadExternalIdentity,
  MessagingReadMessage,
  MessagingReadMessageMediaSource,
  MessagingRealtimeEvent,
  MessagingReadStore,
  MessagingReadThread
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  messageMediaIngestions,
  mediaAssets,
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
type MessageMediaIngestionRow = typeof messageMediaIngestions.$inferSelect;
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

      const messageQuery = database
        .select()
        .from(messagingMessages)
        .where(and(eq(messagingMessages.threadId, threadRow.id), ne(messagingMessages.status, "deleted")))
        .orderBy(desc(messagingMessages.createdAt), desc(messagingMessages.id));
      const rows =
        input.limit === undefined
          ? await messageQuery.offset(input.offset)
          : await messageQuery.limit(input.limit + 1).offset(input.offset);
      const hasMore = input.limit === undefined ? false : rows.length > input.limit;
      const visible = input.limit === undefined ? rows : rows.slice(0, input.limit);
      const mediaByMessageId = await listMediaByMessageId(
        database,
        visible.map((row) => row.id)
      );
      return {
        thread: await toReadThread(database, threadRow),
        messages: visible.map((row) => toMessage(row, mediaByMessageId.get(row.id) ?? null)),
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
    },
    findMessageMediaSource: async (input) => {
      const [row] = await database
        .select({
          ingestion: messageMediaIngestions,
          media: mediaAssets
        })
        .from(messagingMessages)
        .innerJoin(messagingThreads, eq(messagingThreads.id, messagingMessages.threadId))
        .leftJoin(messageMediaIngestions, eq(messageMediaIngestions.messageId, messagingMessages.id))
        .leftJoin(mediaAssets, eq(mediaAssets.id, messagingMessages.mediaAssetId))
        .where(
          and(
            eq(messagingMessages.id, input.messageId),
            eq(messagingThreads.astrologerUserId, input.astrologerUserId),
            ne(messagingMessages.status, "deleted")
          )
        )
        .limit(1);
      if (!row) return null;
      return toMessageMediaSource(row.ingestion, row.media);
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
        .where(and(eq(messagingMessages.id, thread.lastMessageId), ne(messagingMessages.status, "deleted")))
        .limit(1)
    : [];
  return {
    id: thread.id,
    clientUserId: thread.clientUserId,
    status: thread.status as MessagingReadThread["status"],
    primaryIdentity: identityRow ? toExternalIdentity(identityRow.identity) : null,
    lastMessage: lastMessageRow
      ? toMessage(lastMessageRow, await findMediaForMessage(database, lastMessageRow.id))
      : null,
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

async function listMediaByMessageId(
  database: ElevenHouseDatabase,
  messageIds: readonly string[]
): Promise<Map<string, MessageMediaIngestionRow>> {
  if (messageIds.length === 0) return new Map();
  const rows = await database
    .select()
    .from(messageMediaIngestions)
    .where(inArray(messageMediaIngestions.messageId, [...messageIds]));
  return new Map(rows.map((row) => [row.messageId, row]));
}

async function findMediaForMessage(
  database: ElevenHouseDatabase,
  messageId: string
): Promise<MessageMediaIngestionRow | null> {
  const [row] = await database
    .select()
    .from(messageMediaIngestions)
    .where(eq(messageMediaIngestions.messageId, messageId))
    .limit(1);
  return row ?? null;
}

function toMessage(row: MessagingMessageRow, media: MessageMediaIngestionRow | null = null): MessagingReadMessage {
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
    media: media ? toMessageMedia(media) : null,
    status: row.status as MessagingReadMessage["status"],
    failureCode: row.failureCode,
    providerSentAt: toNullableIsoString(row.providerSentAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toMessageMedia(row: MessageMediaIngestionRow): MessagingReadMessage["media"] {
  const status =
    row.downloadStatus === "ready" ? "ready" : row.downloadStatus === "permanent_failed" || row.downloadStatus === "failed" ? "failed" : "pending";
  return {
    mediaAssetId: row.mediaAssetId,
    kind: row.contentType as "voice" | "image" | "video_note" | "video",
    status,
    durationSeconds: row.durationSeconds,
    width: row.width,
    height: row.height,
    mimeType: row.providerMimeType,
    sizeBytes: row.providerSizeBytes
  };
}

function toMessageMediaSource(
  ingestion: MessageMediaIngestionRow | null,
  media: typeof mediaAssets.$inferSelect | null
): MessagingReadMessageMediaSource {
  const status =
    ingestion?.downloadStatus === "ready" && media
      ? "ready"
      : ingestion?.downloadStatus === "failed" || ingestion?.downloadStatus === "permanent_failed"
        ? "failed"
        : "pending";
  return {
    status,
    mediaAssetId: media?.id ?? null,
    storageBucket: media?.storageBucket ?? null,
    storageKey: media?.storageKey ?? null,
    originalFileName: media?.originalFileName ?? null,
    mimeType: media?.mimeType ?? null
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
