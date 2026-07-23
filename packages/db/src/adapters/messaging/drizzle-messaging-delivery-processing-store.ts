import { and, eq } from "drizzle-orm";
import {
  messagingMessageDeliveryRequestedEventType,
  type MessagingChannelMode,
  type MessagingChannelStatus,
  type MessagingMessageStatus,
  type MessagingProvider
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  messageDeliveryAttempts,
  messagingChannelConnections,
  messagingExternalIdentities,
  messagingMessages,
  messagingRealtimeEvents,
  messagingThreadIdentities,
  messagingThreads,
  outboxEvents,
  type OutboxEventPayload
} from "../../schema";

type MessagingDeliveryStatus = "sent" | "failed" | "unknown";

export type MessagingDeliveryWorkItem = {
  readonly outboxEventId: string;
  readonly messageId: string;
  readonly messageStatus: MessagingMessageStatus;
  readonly provider: Extract<MessagingProvider, "telegram">;
  readonly mode: Extract<MessagingChannelMode, "telegram_business_bot">;
  readonly businessConnectionId: string;
  readonly providerChatId: string;
  readonly text: string;
};

export type MessagingDeliveryAttemptInput = {
  readonly messageId: string;
  readonly attemptNumber: number;
  readonly provider: Extract<MessagingProvider, "telegram">;
  readonly attemptedAt: Date;
  readonly providerStatusCode?: number;
  readonly providerMessageId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly connectionFailure?: {
    readonly status: Extract<MessagingChannelStatus, "reauth_required" | "revoked" | "error">;
    readonly errorCode: string;
    readonly errorMessage: string;
  };
};

export type MessagingDeliveryProcessingStore = {
  readonly findByOutboxEventId: (outboxEventId: string) => Promise<MessagingDeliveryWorkItem | null>;
  readonly recordSent: (input: MessagingDeliveryAttemptInput) => Promise<void>;
  readonly recordRetryableFailure: (input: MessagingDeliveryAttemptInput) => Promise<void>;
  readonly recordRetryableUnknown: (input: MessagingDeliveryAttemptInput) => Promise<void>;
  readonly recordFinalFailure: (input: MessagingDeliveryAttemptInput) => Promise<void>;
  readonly recordFinalUnknown: (input: MessagingDeliveryAttemptInput) => Promise<void>;
};

export function createDrizzleMessagingDeliveryProcessingStore(
  database: ElevenHouseDatabase
): MessagingDeliveryProcessingStore {
  return {
    findByOutboxEventId: (outboxEventId) => findByOutboxEventId(database, outboxEventId),
    recordSent: (input) => recordDeliveryAttempt(database, input, {
      attemptStatus: "sent",
      retryable: false,
      messageStatus: "sent",
      realtimeType: "message.updated"
    }),
    recordRetryableFailure: (input) => recordDeliveryAttempt(database, input, {
      attemptStatus: "failed",
      retryable: true
    }),
    recordRetryableUnknown: (input) => recordDeliveryAttempt(database, input, {
      attemptStatus: "unknown",
      retryable: true
    }),
    recordFinalFailure: (input) => recordDeliveryAttempt(database, input, {
      attemptStatus: "failed",
      retryable: false,
      messageStatus: "failed",
      realtimeType: "delivery.failed"
    }),
    recordFinalUnknown: (input) => recordDeliveryAttempt(database, input, {
      attemptStatus: "unknown",
      retryable: false,
      messageStatus: "unknown",
      realtimeType: "delivery.failed"
    })
  };
}

async function findByOutboxEventId(
  database: ElevenHouseDatabase,
  outboxEventId: string
): Promise<MessagingDeliveryWorkItem | null> {
  const [row] = await database
    .select({
      outboxEventId: outboxEvents.id,
      payload: outboxEvents.payload,
      messageId: messagingMessages.id,
      messageStatus: messagingMessages.status,
      text: messagingMessages.text,
      threadId: messagingThreads.id,
      channelConnectionId: messagingChannelConnections.id,
      provider: messagingChannelConnections.provider,
      mode: messagingChannelConnections.mode,
      businessConnectionId: messagingChannelConnections.externalAccountId,
      providerChatId: messagingExternalIdentities.providerChatId
    })
    .from(outboxEvents)
    .innerJoin(messagingMessages, eq(messagingMessages.id, outboxEvents.aggregateId))
    .innerJoin(messagingThreads, eq(messagingThreads.id, messagingMessages.threadId))
    .innerJoin(
      messagingChannelConnections,
      eq(messagingChannelConnections.id, messagingMessages.channelConnectionId)
    )
    .innerJoin(
      messagingThreadIdentities,
      and(
        eq(messagingThreadIdentities.threadId, messagingThreads.id),
        eq(messagingThreadIdentities.isPrimary, true)
      )
    )
    .innerJoin(
      messagingExternalIdentities,
      and(
        eq(messagingExternalIdentities.id, messagingThreadIdentities.externalIdentityId),
        eq(messagingExternalIdentities.channelConnectionId, messagingChannelConnections.id)
      )
    )
    .where(
      and(
        eq(outboxEvents.id, outboxEventId),
        eq(outboxEvents.eventType, messagingMessageDeliveryRequestedEventType)
      )
    )
    .limit(1);

  if (!row) return null;
  return toMessagingDeliveryWorkItem(row);
}

async function recordDeliveryAttempt(
  database: ElevenHouseDatabase,
  input: MessagingDeliveryAttemptInput,
  options: {
    readonly attemptStatus: MessagingDeliveryStatus;
    readonly retryable: boolean;
    readonly messageStatus?: MessagingMessageStatus;
    readonly realtimeType?: "message.updated" | "delivery.failed";
  }
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.insert(messageDeliveryAttempts).values({
      messageId: input.messageId,
      attemptNumber: input.attemptNumber,
      provider: input.provider,
      providerRequestId: null,
      providerResponseMessageId: input.providerMessageId ?? null,
      providerStatusCode: input.providerStatusCode ?? null,
      status: options.attemptStatus,
      retryable: options.retryable,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      attemptedAt: input.attemptedAt
    });

    if (!options.messageStatus) return;

    const [message] = await transaction
      .update(messagingMessages)
      .set({
        status: options.messageStatus,
        providerMessageId: input.providerMessageId ?? null,
        failureCode: input.errorCode ?? null,
        updatedAt: input.attemptedAt
      })
      .where(
        and(
          eq(messagingMessages.id, input.messageId),
          eq(messagingMessages.direction, "outbound"),
          eq(messagingMessages.status, "queued")
        )
      )
      .returning();
    if (!message) return;

    if (input.connectionFailure) {
      await transaction
        .update(messagingChannelConnections)
        .set({
          status: input.connectionFailure.status,
          lastErrorCode: input.connectionFailure.errorCode,
          lastErrorMessage: input.connectionFailure.errorMessage.slice(0, 500),
          updatedAt: input.attemptedAt
        })
        .where(eq(messagingChannelConnections.id, message.channelConnectionId))
        .returning({ id: messagingChannelConnections.id });
    }

    await transaction.insert(messagingRealtimeEvents).values({
      astrologerUserId: await findMessageAstrologerUserId(transaction, message.threadId),
      type: options.realtimeType ?? "message.updated",
      threadId: message.threadId,
      messageId: message.id,
      channelConnectionId: message.channelConnectionId,
      externalIdentityId: message.externalIdentityId,
      createdAt: input.attemptedAt
    });
  });
}

async function findMessageAstrologerUserId(
  database: Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0],
  threadId: string
): Promise<string> {
  const [thread] = await database
    .select({ astrologerUserId: messagingThreads.astrologerUserId })
    .from(messagingThreads)
    .where(eq(messagingThreads.id, threadId))
    .limit(1);
  if (!thread) throw new Error("Expected messaging thread to exist for delivery update");
  return thread.astrologerUserId;
}

function toMessagingDeliveryWorkItem(input: {
  readonly outboxEventId: string;
  readonly payload: OutboxEventPayload;
  readonly messageId: string;
  readonly messageStatus: string;
  readonly text: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly provider: string;
  readonly mode: string;
  readonly businessConnectionId: string | null;
  readonly providerChatId: string;
}): MessagingDeliveryWorkItem {
  if (
    !("messageId" in input.payload) ||
    !("threadId" in input.payload) ||
    !("channelConnectionId" in input.payload) ||
    input.payload.messageId !== input.messageId ||
    input.payload.threadId !== input.threadId ||
    input.payload.channelConnectionId !== input.channelConnectionId
  ) {
    throw new Error(`Outbox event ${input.outboxEventId} does not match messaging aggregate`);
  }

  if (input.provider !== "telegram" || input.mode !== "telegram_business_bot") {
    throw new Error(`Unsupported messaging delivery channel for outbox event ${input.outboxEventId}`);
  }
  if (!input.businessConnectionId) {
    throw new Error(`Telegram Business connection is missing for outbox event ${input.outboxEventId}`);
  }

  return {
    outboxEventId: input.outboxEventId,
    messageId: input.messageId,
    messageStatus: input.messageStatus as MessagingMessageStatus,
    provider: "telegram",
    mode: "telegram_business_bot",
    businessConnectionId: input.businessConnectionId,
    providerChatId: input.providerChatId,
    text: input.text
  };
}
