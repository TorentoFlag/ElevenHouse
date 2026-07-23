import { describe, expect, it } from "vitest";
import {
  messageDeliveryAttempts,
  messagingChannelConnections,
  messagingMessages,
  messagingRealtimeEvents
} from "../../schema";
import { createDrizzleMessagingDeliveryProcessingStore } from "./drizzle-messaging-delivery-processing-store";

const outboxEventId = "00000000-0000-4000-8000-000000000001";
const messageId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";
const channelConnectionId = "00000000-0000-4000-8000-000000000004";
const astrologerUserId = "00000000-0000-4000-8000-000000000005";
const now = new Date("2026-07-22T10:00:00.000Z");

describe("createDrizzleMessagingDeliveryProcessingStore", () => {
  it("reloads the messaging delivery work item from outbox and DB state", async () => {
    const database = createFindDatabase({
      outboxEventId,
      payload: {
        messageId,
        threadId,
        channelConnectionId,
        astrologerUserId
      },
      messageId,
      messageStatus: "queued",
      text: "Message text from DB",
      threadId,
      channelConnectionId,
      provider: "telegram",
      mode: "telegram_business_bot",
      businessConnectionId: "business-1",
      providerChatId: "chat-1"
    });

    await expect(
      createDrizzleMessagingDeliveryProcessingStore(database as never).findByOutboxEventId(outboxEventId)
    ).resolves.toEqual({
      outboxEventId,
      messageId,
      messageStatus: "queued",
      provider: "telegram",
      mode: "telegram_business_bot",
      businessConnectionId: "business-1",
      providerChatId: "chat-1",
      text: "Message text from DB"
    });
  });

  it("rejects outbox payloads that do not match the aggregate row", async () => {
    const database = createFindDatabase({
      outboxEventId,
      payload: {
        messageId: "00000000-0000-4000-8000-000000000099",
        threadId,
        channelConnectionId,
        astrologerUserId
      },
      messageId,
      messageStatus: "queued",
      text: "Message text from DB",
      threadId,
      channelConnectionId,
      provider: "telegram",
      mode: "telegram_business_bot",
      businessConnectionId: "business-1",
      providerChatId: "chat-1"
    });

    await expect(
      createDrizzleMessagingDeliveryProcessingStore(database as never).findByOutboxEventId(outboxEventId)
    ).rejects.toThrow(`Outbox event ${outboxEventId} does not match messaging aggregate`);
  });

  it("records a sent attempt, marks the message sent, and appends a realtime event in one transaction", async () => {
    const fake = createRecordingDatabase();

    await createDrizzleMessagingDeliveryProcessingStore(fake.database as never).recordSent({
      messageId,
      attemptNumber: 2,
      provider: "telegram",
      providerStatusCode: 200,
      providerMessageId: "telegram-100",
      attemptedAt: now
    });

    expect(fake.transactionCount).toBe(1);
    expect(fake.inserts).toContainEqual({
      table: messageDeliveryAttempts,
      value: expect.objectContaining({
        messageId,
        attemptNumber: 2,
        provider: "telegram",
        providerResponseMessageId: "telegram-100",
        providerStatusCode: 200,
        status: "sent",
        retryable: false,
        errorCode: null,
        errorMessage: null,
        attemptedAt: now
      })
    });
    expect(fake.updates).toEqual([
      {
        table: messagingMessages,
        value: expect.objectContaining({
          status: "sent",
          providerMessageId: "telegram-100",
          failureCode: null,
          updatedAt: now
        })
      }
    ]);
    expect(fake.inserts).toContainEqual({
      table: messagingRealtimeEvents,
      value: expect.objectContaining({
        astrologerUserId,
        type: "message.updated",
        threadId,
        messageId,
        channelConnectionId,
        createdAt: now
      })
    });
  });

  it("does not overwrite a message that left queued state during provider delivery", async () => {
    const fake = createRecordingDatabase({ updatedMessage: null });

    await createDrizzleMessagingDeliveryProcessingStore(fake.database as never).recordFinalFailure({
      messageId,
      attemptNumber: 3,
      provider: "telegram",
      providerStatusCode: 503,
      errorCode: "TELEGRAM_BUSINESS_HTTP_503",
      errorMessage: "provider unavailable",
      attemptedAt: now
    });

    expect(fake.inserts).toContainEqual({
      table: messageDeliveryAttempts,
      value: expect.objectContaining({
        messageId,
        attemptNumber: 3,
        status: "failed",
        retryable: false
      })
    });
    expect(fake.updates).toEqual([
      {
        table: messagingMessages,
        value: expect.objectContaining({
          status: "failed",
          failureCode: "TELEGRAM_BUSINESS_HTTP_503"
        })
      }
    ]);
    expect(fake.inserts).not.toContainEqual(
      expect.objectContaining({ table: messagingRealtimeEvents })
    );
  });

  it("marks final unknown attempts as non-retryable", async () => {
    const fake = createRecordingDatabase();

    await createDrizzleMessagingDeliveryProcessingStore(fake.database as never).recordFinalUnknown({
      messageId,
      attemptNumber: 3,
      provider: "telegram",
      errorCode: "TELEGRAM_BUSINESS_EXCEPTION",
      errorMessage: "network timeout",
      attemptedAt: now
    });

    expect(fake.inserts).toContainEqual({
      table: messageDeliveryAttempts,
      value: expect.objectContaining({
        messageId,
        attemptNumber: 3,
        status: "unknown",
        retryable: false
      })
    });
  });

  it("marks the channel connection reauthorization-required on final provider connection rejection", async () => {
    const fake = createRecordingDatabase({
      updatedMessage: {
        id: messageId,
        threadId,
        channelConnectionId,
        externalIdentityId: null
      }
    });

    await createDrizzleMessagingDeliveryProcessingStore(fake.database as never).recordFinalFailure({
      messageId,
      attemptNumber: 1,
      provider: "telegram",
      providerStatusCode: 400,
      errorCode: "TELEGRAM_BUSINESS_CONNECTION_REAUTH_REQUIRED",
      errorMessage: "Bad Request: business connection not found",
      attemptedAt: now,
      connectionFailure: {
        status: "reauth_required",
        errorCode: "TELEGRAM_BUSINESS_CONNECTION_REAUTH_REQUIRED",
        errorMessage: "Bad Request: business connection not found"
      }
    });

    expect(fake.updates).toContainEqual({
      table: messagingChannelConnections,
      value: {
        status: "reauth_required",
        lastErrorCode: "TELEGRAM_BUSINESS_CONNECTION_REAUTH_REQUIRED",
        lastErrorMessage: "Bad Request: business connection not found",
        updatedAt: now
      }
    });
  });
});

function createFindDatabase(row: Record<string, unknown>) {
  return {
    select: () => selectChain([row])
  };
}

function createRecordingDatabase(input: { readonly updatedMessage?: Record<string, unknown> | null } = {}) {
  const inserts: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  const updates: Array<{ readonly table: unknown; readonly value: Record<string, unknown> }> = [];
  let transactionCount = 0;
  const database = {
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => {
        inserts.push({ table, value });
        return { then: (resolve: (value: undefined) => unknown) => resolve(undefined) };
      }
    }),
    update: (table: unknown) => ({
      set: (value: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            updates.push({ table, value });
            const updatedMessage = input.updatedMessage === undefined
              ? {
                  id: messageId,
                  threadId,
                  channelConnectionId,
                  externalIdentityId: null
                }
              : input.updatedMessage;
            return updatedMessage ? [updatedMessage] : [];
          }
        })
      })
    }),
    select: () => selectChain([{ astrologerUserId }]),
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => {
      transactionCount += 1;
      return callback(database);
    }
  };

  return {
    database,
    inserts,
    updates,
    get transactionCount() {
      return transactionCount;
    }
  };
}

function selectChain(rows: readonly Record<string, unknown>[]) {
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    limit: async () => rows
  };
  return query;
}
