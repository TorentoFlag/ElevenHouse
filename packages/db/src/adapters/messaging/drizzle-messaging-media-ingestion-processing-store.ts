import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  mediaAssets,
  messageMediaIngestions,
  messagingMessages,
  messagingRealtimeEvents,
  messagingThreads
} from "../../schema";

export type MessagingMediaIngestionWorkItem = {
  readonly ingestionId: string;
  readonly messageId: string;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly provider: "telegram";
  readonly kind: "voice" | "image" | "video_note" | "video";
  readonly providerFileId: string;
  readonly providerMimeType: string | null;
  readonly providerSizeBytes: number | null;
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
};

export type MessagingMediaIngestionProcessingStore = {
  readonly listDueIds: (input: {
    readonly now: Date;
    readonly limit: number;
  }) => Promise<readonly string[]>;
  readonly claimDueById: (input: {
    readonly ingestionId: string;
    readonly now: Date;
  }) => Promise<MessagingMediaIngestionWorkItem | null>;
  readonly markReady: (input: {
    readonly ingestionId: string;
    readonly messageId: string;
    readonly mediaAssetId: string;
    readonly ownerUserId: string;
    readonly storageBucket: string;
    readonly storageKey: string;
    readonly originalFileName: string;
    readonly mimeType: "audio/ogg" | "audio/mpeg" | "audio/mp4" | "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "video/mp4";
    readonly sizeBytes: number;
    readonly checksumSha256: string;
    readonly width: number | null;
    readonly height: number | null;
    readonly now: Date;
  }) => Promise<void>;
  readonly markRetryableFailed: (input: {
    readonly ingestionId: string;
    readonly failureCode: string;
    readonly nextRetryAt: Date;
    readonly now: Date;
  }) => Promise<void>;
  readonly markPermanentFailed: (input: {
    readonly ingestionId: string;
    readonly failureCode: string;
    readonly now: Date;
  }) => Promise<void>;
};

export function createDrizzleMessagingMediaIngestionProcessingStore(
  database: ElevenHouseDatabase
): MessagingMediaIngestionProcessingStore {
  return {
    listDueIds: (input) => listDueIds(database, input),
    claimDueById: (input) => claimDueById(database, input),
    markReady: (input) => markReady(database, input),
    markRetryableFailed: (input) =>
      markFailed(database, {
        ingestionId: input.ingestionId,
        status: "failed",
        failureCode: input.failureCode,
        nextRetryAt: input.nextRetryAt,
        now: input.now
      }),
    markPermanentFailed: (input) =>
      markFailed(database, {
        ingestionId: input.ingestionId,
        status: "permanent_failed",
        failureCode: input.failureCode,
        nextRetryAt: null,
        now: input.now
      })
  };
}

async function listDueIds(
  database: ElevenHouseDatabase,
  input: { readonly now: Date; readonly limit: number }
): Promise<readonly string[]> {
  const rows = await database
    .select({ id: messageMediaIngestions.id })
    .from(messageMediaIngestions)
    .where(
      and(
        inArray(messageMediaIngestions.downloadStatus, ["pending", "failed"]),
        or(isNull(messageMediaIngestions.nextRetryAt), lte(messageMediaIngestions.nextRetryAt, input.now))
      )
    )
    .orderBy(messageMediaIngestions.createdAt, messageMediaIngestions.id)
    .limit(input.limit);

  return rows.map((row) => row.id);
}

async function claimDueById(
  database: ElevenHouseDatabase,
  input: { readonly ingestionId: string; readonly now: Date }
): Promise<MessagingMediaIngestionWorkItem | null> {
  const [claimed] = await database
    .update(messageMediaIngestions)
    .set({
      downloadStatus: "downloading",
      failureCode: null,
      attemptCount: sql`${messageMediaIngestions.attemptCount} + 1`,
      updatedAt: input.now
    })
    .where(
      and(
        eq(messageMediaIngestions.id, input.ingestionId),
        inArray(messageMediaIngestions.downloadStatus, ["pending", "failed"]),
        or(isNull(messageMediaIngestions.nextRetryAt), lte(messageMediaIngestions.nextRetryAt, input.now))
      )
    )
    .returning({ id: messageMediaIngestions.id });
  if (!claimed) return null;

  const [row] = await database
    .select({
      ingestionId: messageMediaIngestions.id,
      messageId: messageMediaIngestions.messageId,
      channelConnectionId: messageMediaIngestions.channelConnectionId,
      astrologerUserId: messagingThreads.astrologerUserId,
      provider: messageMediaIngestions.provider,
      providerFileId: messageMediaIngestions.providerFileId,
      providerMimeType: messageMediaIngestions.providerMimeType,
      providerSizeBytes: messageMediaIngestions.providerSizeBytes,
      durationSeconds: messageMediaIngestions.durationSeconds,
      width: messageMediaIngestions.width,
      height: messageMediaIngestions.height,
      contentType: messageMediaIngestions.contentType
    })
    .from(messageMediaIngestions)
    .innerJoin(messagingMessages, eq(messagingMessages.id, messageMediaIngestions.messageId))
    .innerJoin(messagingThreads, eq(messagingThreads.id, messagingMessages.threadId))
    .where(eq(messageMediaIngestions.id, input.ingestionId))
    .limit(1);
  if (!row) throw new Error("Claimed message media ingestion row was not found");
  if (
    row.provider !== "telegram" ||
    row.contentType !== "voice" &&
    row.contentType !== "image" &&
    row.contentType !== "video_note" &&
    row.contentType !== "video"
  ) {
    throw new Error(`Unsupported message media ingestion ${row.ingestionId}`);
  }

  return {
    ingestionId: row.ingestionId,
    messageId: row.messageId,
    channelConnectionId: row.channelConnectionId,
    astrologerUserId: row.astrologerUserId,
    provider: "telegram",
    kind: row.contentType,
    providerFileId: row.providerFileId,
    providerMimeType: row.providerMimeType,
    providerSizeBytes: row.providerSizeBytes,
    durationSeconds: row.durationSeconds,
    width: row.width,
    height: row.height
  };
}

async function markReady(
  database: ElevenHouseDatabase,
  input: Parameters<MessagingMediaIngestionProcessingStore["markReady"]>[0]
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.insert(mediaAssets).values({
      id: input.mediaAssetId,
      ownerUserId: input.ownerUserId,
      purpose: "messaging_attachment",
      status: "ready",
      visibility: "private",
      storageBucket: input.storageBucket,
      storageKey: input.storageKey,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      width: input.width,
      height: input.height,
      altText: null,
      failureReason: null,
      createdAt: input.now,
      updatedAt: input.now
    });

    const [message] = await transaction
      .update(messagingMessages)
      .set({
        mediaAssetId: input.mediaAssetId,
        updatedAt: input.now
      })
      .where(eq(messagingMessages.id, input.messageId))
      .returning({
        id: messagingMessages.id,
        threadId: messagingMessages.threadId,
        channelConnectionId: messagingMessages.channelConnectionId,
        externalIdentityId: messagingMessages.externalIdentityId
      });
    if (!message) throw new Error("Expected message to exist for media ingestion completion");

    await transaction
      .update(messageMediaIngestions)
      .set({
        downloadStatus: "ready",
        mediaAssetId: input.mediaAssetId,
        failureCode: null,
        nextRetryAt: null,
        checksumSha256: input.checksumSha256,
        updatedAt: input.now
      })
      .where(eq(messageMediaIngestions.id, input.ingestionId));

    await transaction.insert(messagingRealtimeEvents).values({
      astrologerUserId: input.ownerUserId,
      type: "message.updated",
      threadId: message.threadId,
      messageId: message.id,
      channelConnectionId: message.channelConnectionId,
      externalIdentityId: message.externalIdentityId,
      createdAt: input.now
    });
  });
}

async function markFailed(
  database: ElevenHouseDatabase,
  input: {
    readonly ingestionId: string;
    readonly status: "failed" | "permanent_failed";
    readonly failureCode: string;
    readonly nextRetryAt: Date | null;
    readonly now: Date;
  }
): Promise<void> {
  await database
    .update(messageMediaIngestions)
    .set({
      downloadStatus: input.status,
      failureCode: input.failureCode,
      nextRetryAt: input.nextRetryAt,
      updatedAt: input.now
    })
    .where(eq(messageMediaIngestions.id, input.ingestionId));
}
