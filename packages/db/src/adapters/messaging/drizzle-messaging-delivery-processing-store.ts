import { and, eq, inArray } from "drizzle-orm";
import {
  type EncryptedMessagingSecret,
  messagingMessageDeliveryReconciliationRequestedEventType,
  messagingMessageDeliveryTerminalEventType,
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
  messagingInstagramGraphAccounts,
  messagingMessages,
  messagingRealtimeEvents,
  messagingThreadIdentities,
  messagingThreads,
  outboxEvents,
  type OutboxEventPayload
} from "../../schema";

type MessagingDeliveryStatus = "sent" | "failed" | "unknown";

export type TelegramBusinessDeliveryWorkItem = {
  readonly outboxEventId: string;
  readonly messageId: string;
  readonly messageStatus: MessagingMessageStatus;
  readonly provider: Extract<MessagingProvider, "telegram">;
  readonly mode: Extract<MessagingChannelMode, "telegram_business_bot">;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly businessConnectionId: string;
  readonly providerChatId: string;
  readonly text: string;
  readonly reconciliation?: boolean;
};

export type TelegramMtprotoDeliveryWorkItem = {
  readonly outboxEventId: string;
  readonly messageId: string;
  readonly messageStatus: MessagingMessageStatus;
  readonly provider: Extract<MessagingProvider, "telegram">;
  readonly mode: Extract<MessagingChannelMode, "telegram_mtproto_account">;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly peerId: string;
  readonly text: string;
  readonly reconciliation?: boolean;
};

export type MessagingDeliveryWorkItem =
  | TelegramBusinessDeliveryWorkItem
  | TelegramMtprotoDeliveryWorkItem
  | InstagramGraphDeliveryWorkItem;

export type InstagramGraphDeliveryWorkItem = {
  readonly outboxEventId: string;
  readonly messageId: string;
  readonly messageStatus: MessagingMessageStatus;
  readonly provider: Extract<MessagingProvider, "instagram">;
  readonly mode: Extract<MessagingChannelMode, "instagram_graph">;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly instagramAccountId: string;
  readonly providerChatId: string;
  readonly encryptedAccessToken: EncryptedMessagingSecret;
  readonly text: string;
  readonly reconciliation?: boolean;
};

export type MessagingDeliveryAttemptInput = {
  readonly messageId: string;
  readonly attemptNumber: number;
  readonly provider: MessagingProvider;
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
  readonly findByOutboxEventId: (
    outboxEventId: string
  ) => Promise<MessagingDeliveryWorkItem | null>;
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
    recordSent: (input) =>
      recordDeliveryAttempt(database, input, {
        attemptStatus: "sent",
        retryable: false,
        messageStatus: "sent",
        realtimeType: "message.updated"
      }),
    recordRetryableFailure: (input) =>
      recordDeliveryAttempt(database, input, {
        attemptStatus: "failed",
        retryable: true
      }),
    recordRetryableUnknown: (input) =>
      recordDeliveryAttempt(database, input, {
        attemptStatus: "unknown",
        retryable: true
      }),
    recordFinalFailure: (input) =>
      recordDeliveryAttempt(database, input, {
        attemptStatus: "failed",
        retryable: false,
        messageStatus: "failed",
        realtimeType: "delivery.failed"
      }),
    recordFinalUnknown: (input) =>
      recordDeliveryAttempt(database, input, {
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
      eventType: outboxEvents.eventType,
      payload: outboxEvents.payload,
      messageId: messagingMessages.id,
      messageStatus: messagingMessages.status,
      text: messagingMessages.text,
      threadId: messagingThreads.id,
      channelConnectionId: messagingChannelConnections.id,
      astrologerUserId: messagingChannelConnections.astrologerUserId,
      provider: messagingChannelConnections.provider,
      mode: messagingChannelConnections.mode,
      businessConnectionId: messagingChannelConnections.externalAccountId,
      instagramAccessTokenEncrypted: messagingInstagramGraphAccounts.accessTokenEncrypted,
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
    .leftJoin(
      messagingInstagramGraphAccounts,
      eq(messagingInstagramGraphAccounts.channelConnectionId, messagingChannelConnections.id)
    )
    .where(
      and(
        eq(outboxEvents.id, outboxEventId),
        inArray(outboxEvents.eventType, [
          messagingMessageDeliveryRequestedEventType,
          messagingMessageDeliveryReconciliationRequestedEventType
        ])
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
          inArray(messagingMessages.status, ["queued", "unknown"])
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

    if (options.messageStatus === "sent" || options.messageStatus === "failed") {
      const [deliveryRequest] = await transaction
        .select({ payload: outboxEvents.payload })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.eventType, messagingMessageDeliveryRequestedEventType),
            eq(outboxEvents.aggregateId, message.id)
          )
        )
        .limit(1);
      if (
        deliveryRequest?.payload &&
        "flowTerminalSignal" in deliveryRequest.payload &&
        deliveryRequest.payload.flowTerminalSignal === "flow_delivery_terminal.v1"
      ) {
        const ownerUserId = await findMessageAstrologerUserId(transaction, message.threadId);
        await transaction
          .insert(outboxEvents)
          .values({
            eventType: messagingMessageDeliveryTerminalEventType,
            aggregateId: message.id,
            payload: {
              schemaVersion: "messaging-message-delivery-terminal.v1",
              messageId: message.id,
              ownerUserId,
              outcome: options.messageStatus === "sent" ? "succeeded" : "failed",
              occurredAt: input.attemptedAt.toISOString()
            },
            status: "pending",
            attempts: 0,
            availableAt: input.attemptedAt,
            lockedAt: null,
            publishedAt: null,
            lastError: null,
            createdAt: input.attemptedAt,
            updatedAt: input.attemptedAt
          })
          .onConflictDoNothing();
      }
    }

    if (options.messageStatus === "unknown") {
      const [deliveryRequest] = await transaction
        .select({ payload: outboxEvents.payload })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.eventType, messagingMessageDeliveryRequestedEventType),
            eq(outboxEvents.aggregateId, message.id)
          )
        )
        .limit(1);
      if (
        deliveryRequest?.payload &&
        "flowTerminalSignal" in deliveryRequest.payload &&
        deliveryRequest.payload.flowTerminalSignal === "flow_delivery_terminal.v1"
      ) {
        await transaction
          .insert(outboxEvents)
          .values({
            eventType: messagingMessageDeliveryReconciliationRequestedEventType,
            aggregateId: message.id,
            payload: {
              schemaVersion: "messaging-message-delivery-reconciliation-request.v1",
              messageId: message.id
            },
            status: "pending",
            attempts: 0,
            availableAt: input.attemptedAt,
            lockedAt: null,
            publishedAt: null,
            lastError: null,
            createdAt: input.attemptedAt,
            updatedAt: input.attemptedAt
          })
          .onConflictDoNothing();
      }
    }
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
  readonly eventType: string;
  readonly payload: OutboxEventPayload;
  readonly messageId: string;
  readonly messageStatus: string;
  readonly text: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly provider: string;
  readonly mode: string;
  readonly businessConnectionId: string | null;
  readonly instagramAccessTokenEncrypted: EncryptedMessagingSecret | null;
  readonly providerChatId: string;
}): MessagingDeliveryWorkItem {
  if (!("messageId" in input.payload) || input.payload.messageId !== input.messageId) {
    throw new Error(`Outbox event ${input.outboxEventId} does not match messaging aggregate`);
  }
  const reconciliation =
    input.eventType === messagingMessageDeliveryReconciliationRequestedEventType;
  if (
    !reconciliation &&
    (!("threadId" in input.payload) ||
      !("channelConnectionId" in input.payload) ||
      input.payload.threadId !== input.threadId ||
      input.payload.channelConnectionId !== input.channelConnectionId)
  ) {
    throw new Error(`Outbox event ${input.outboxEventId} does not match messaging aggregate`);
  }

  if (input.provider === "telegram" && input.mode === "telegram_business_bot") {
    if (!input.businessConnectionId) {
      throw new Error(
        `Telegram Business connection is missing for outbox event ${input.outboxEventId}`
      );
    }

    return {
      outboxEventId: input.outboxEventId,
      messageId: input.messageId,
      messageStatus: input.messageStatus as MessagingMessageStatus,
      provider: "telegram",
      mode: "telegram_business_bot",
      channelConnectionId: input.channelConnectionId,
      astrologerUserId: input.astrologerUserId,
      businessConnectionId: input.businessConnectionId,
      providerChatId: input.providerChatId,
      text: input.text,
      reconciliation
    };
  }

  if (input.provider === "telegram" && input.mode === "telegram_mtproto_account") {
    return {
      outboxEventId: input.outboxEventId,
      messageId: input.messageId,
      messageStatus: input.messageStatus as MessagingMessageStatus,
      provider: "telegram",
      mode: "telegram_mtproto_account",
      channelConnectionId: input.channelConnectionId,
      astrologerUserId: input.astrologerUserId,
      peerId: input.providerChatId,
      text: input.text,
      reconciliation
    };
  }

  if (input.provider === "instagram" && input.mode === "instagram_graph") {
    if (!input.businessConnectionId || !input.instagramAccessTokenEncrypted) {
      throw new Error(
        `Instagram Graph account token is missing for outbox event ${input.outboxEventId}`
      );
    }

    return {
      outboxEventId: input.outboxEventId,
      messageId: input.messageId,
      messageStatus: input.messageStatus as MessagingMessageStatus,
      provider: "instagram",
      mode: "instagram_graph",
      channelConnectionId: input.channelConnectionId,
      astrologerUserId: input.astrologerUserId,
      instagramAccountId: input.businessConnectionId,
      providerChatId: input.providerChatId,
      encryptedAccessToken: input.instagramAccessTokenEncrypted,
      text: input.text,
      reconciliation
    };
  }

  throw new Error(`Unsupported messaging delivery channel for outbox event ${input.outboxEventId}`);
}
