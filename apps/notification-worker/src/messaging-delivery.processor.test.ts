import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { MessagingDeliveryProcessingStore } from "@elevenhouse/db/messaging";
import { createLogger, type LogRecord } from "@elevenhouse/observability";
import { processMessagingDeliveryJob } from "./messaging-delivery.processor";
import type { MessagingDeliveryJobData } from "./messaging-delivery.queue";
import type { MessagingDeliveryProvider } from "./telegram-business-provider";

function createJob(overrides: Partial<Job<MessagingDeliveryJobData>> = {}): Job<MessagingDeliveryJobData> {
  return {
    data: { outboxEventId: "outbox_1" },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides
  } as Job<MessagingDeliveryJobData>;
}

describe("processMessagingDeliveryJob", () => {
  it("skips missing and non-queued messages", async () => {
    const store = createStore({ workItem: null });
    const provider = createProvider({ status: "sent" });

    await processMessagingDeliveryJob({
      job: createJob(),
      store,
      provider,
      now: new Date("2026-07-22T10:00:00.000Z")
    });

    expect(provider.sendMessage).not.toHaveBeenCalled();
    expect(store.recordSent).not.toHaveBeenCalled();
  });

  it("calls provider with reloaded DB state and marks sent", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store = createStore();
    const provider = createProvider({
      status: "sent",
      providerStatusCode: 200,
      providerMessageId: "telegram-100"
    });
    const logRecords: LogRecord[] = [];

    await processMessagingDeliveryJob({
      job: createJob(),
      store,
      provider,
      now,
      logger: createLogger("messaging-delivery-test", (record) => logRecords.push(record))
    });

    expect(provider.sendMessage).toHaveBeenCalledWith({
      messageId: "message_1",
      businessConnectionId: "business-1",
      chatId: "chat-1",
      text: "Message text from DB"
    });
    expect(store.recordSent).toHaveBeenCalledWith({
      messageId: "message_1",
      attemptNumber: 1,
      provider: "telegram",
      providerStatusCode: 200,
      providerMessageId: "telegram-100",
      attemptedAt: now
    });
    expect(JSON.stringify(logRecords)).not.toContain("Message text from DB");
  });

  it("records retryable failures and throws for BullMQ retry", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store = createStore();
    const provider = createProvider({
      status: "failed",
      retryable: true,
      providerStatusCode: 503,
      errorCode: "TELEGRAM_BUSINESS_HTTP_503",
      errorMessage: "provider unavailable"
    });

    await expect(
      processMessagingDeliveryJob({
        job: createJob({ attemptsMade: 0, opts: { attempts: 3 } }),
        store,
        provider,
        now
      })
    ).rejects.toThrow("provider unavailable");

    expect(store.recordRetryableFailure).toHaveBeenCalledWith({
      messageId: "message_1",
      attemptNumber: 1,
      provider: "telegram",
      providerStatusCode: 503,
      errorCode: "TELEGRAM_BUSINESS_HTTP_503",
      errorMessage: "provider unavailable",
      attemptedAt: now
    });
    expect(store.recordFinalFailure).not.toHaveBeenCalled();
  });

  it("marks final provider failures failed", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store = createStore();
    const provider = createProvider({
      status: "failed",
      retryable: true,
      providerStatusCode: 503,
      errorCode: "TELEGRAM_BUSINESS_HTTP_503",
      errorMessage: "provider unavailable"
    });

    await processMessagingDeliveryJob({
      job: createJob({ attemptsMade: 2, opts: { attempts: 3 } }),
      store,
      provider,
      now
    });

    expect(store.recordFinalFailure).toHaveBeenCalledWith({
      messageId: "message_1",
      attemptNumber: 3,
      provider: "telegram",
      providerStatusCode: 503,
      errorCode: "TELEGRAM_BUSINESS_HTTP_503",
      errorMessage: "provider unavailable",
      attemptedAt: now
    });
  });

  it("passes provider connection failure classification to the final delivery record", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store = createStore();
    const provider = createProvider({
      status: "failed",
      retryable: false,
      providerStatusCode: 400,
      errorCode: "TELEGRAM_BUSINESS_CONNECTION_REAUTH_REQUIRED",
      errorMessage: "Bad Request: business connection not found",
      connectionStatus: "reauth_required"
    });

    await processMessagingDeliveryJob({
      job: createJob({ attemptsMade: 0, opts: { attempts: 3 } }),
      store,
      provider,
      now
    });

    expect(store.recordFinalFailure).toHaveBeenCalledWith({
      messageId: "message_1",
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
  });


  it("marks ambiguous final timeout unknown", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store = createStore();
    const provider = createProvider({
      status: "unknown",
      retryable: true,
      errorCode: "TELEGRAM_BUSINESS_EXCEPTION",
      errorMessage: "network timeout"
    });

    await processMessagingDeliveryJob({
      job: createJob({ attemptsMade: 2, opts: { attempts: 3 } }),
      store,
      provider,
      now
    });

    expect(store.recordFinalUnknown).toHaveBeenCalledWith({
      messageId: "message_1",
      attemptNumber: 3,
      provider: "telegram",
      errorCode: "TELEGRAM_BUSINESS_EXCEPTION",
      errorMessage: "network timeout",
      attemptedAt: now
    });
  });

  it("records retryable ambiguous timeouts as unknown attempts before the final attempt", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store = createStore();
    const provider = createProvider({
      status: "unknown",
      retryable: true,
      errorCode: "TELEGRAM_BUSINESS_EXCEPTION",
      errorMessage: "network timeout"
    });

    await expect(
      processMessagingDeliveryJob({
        job: createJob({ attemptsMade: 0, opts: { attempts: 3 } }),
        store,
        provider,
        now
      })
    ).rejects.toThrow("network timeout");

    expect(store.recordRetryableUnknown).toHaveBeenCalledWith({
      messageId: "message_1",
      attemptNumber: 1,
      provider: "telegram",
      errorCode: "TELEGRAM_BUSINESS_EXCEPTION",
      errorMessage: "network timeout",
      attemptedAt: now
    });
    expect(store.recordRetryableFailure).not.toHaveBeenCalled();
  });
});

function createStore(input: {
  readonly workItem?: Awaited<ReturnType<MessagingDeliveryProcessingStore["findByOutboxEventId"]>>;
} = {}): MessagingDeliveryProcessingStore {
  return {
    findByOutboxEventId: vi.fn(async () => input.workItem === undefined ? createWorkItem() : input.workItem),
    recordSent: vi.fn(async () => undefined),
    recordRetryableFailure: vi.fn(async () => undefined),
    recordRetryableUnknown: vi.fn(async () => undefined),
    recordFinalFailure: vi.fn(async () => undefined),
    recordFinalUnknown: vi.fn(async () => undefined)
  };
}

function createProvider(result: Partial<Awaited<ReturnType<MessagingDeliveryProvider["sendMessage"]>>>): MessagingDeliveryProvider {
  return {
    sendMessage: vi.fn(async () => ({
      provider: "telegram",
      retryable: false,
      ...result
    } as Awaited<ReturnType<MessagingDeliveryProvider["sendMessage"]>>))
  };
}

function createWorkItem() {
  return {
    outboxEventId: "outbox_1",
    messageId: "message_1",
    messageStatus: "queued" as const,
    provider: "telegram" as const,
    mode: "telegram_business_bot" as const,
    businessConnectionId: "business-1",
    providerChatId: "chat-1",
    text: "Message text from DB"
  };
}
