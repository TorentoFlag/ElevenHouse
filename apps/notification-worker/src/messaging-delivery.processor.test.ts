import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { MessagingDeliveryProcessingStore } from "@elevenhouse/db/messaging";
import { createLogger, type LogRecord } from "@elevenhouse/observability";
import { processMessagingDeliveryJob } from "./messaging-delivery.processor";
import type { MessagingDeliveryJobData } from "./messaging-delivery.queue";
import type { TelegramBusinessMessagingDeliveryProvider } from "./telegram-business-provider";
import type { TelegramMtprotoMessagingProvider } from "./telegram-mtproto-provider";

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
    const provider = createBusinessProvider({ status: "sent" });

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
    const provider = createBusinessProvider({
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

  it("routes Telegram Account delivery through the MTProto provider", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store = createStore({
      workItem: {
        ...createWorkItem(),
        mode: "telegram_mtproto_account",
        peerId: "777000"
      }
    });
    const businessProvider = createBusinessProvider({
      status: "sent",
      providerStatusCode: 200,
      providerMessageId: "telegram-business-100"
    });
    const mtprotoProvider = createMtprotoProvider({
      status: "sent",
      providerMessageId: "telegram-mtproto-100"
    });
    const logRecords: LogRecord[] = [];

    await processMessagingDeliveryJob({
      job: createJob(),
      store,
      provider: {
        telegramBusiness: businessProvider,
        telegramMtproto: mtprotoProvider
      },
      now,
      logger: createLogger("messaging-delivery-test", (record) => logRecords.push(record))
    });

    expect(businessProvider.sendMessage).not.toHaveBeenCalled();
    expect(mtprotoProvider.sendMessage).toHaveBeenCalledWith({
      messageId: "message_1",
      channelConnectionId: "connection_1",
      peerId: "777000",
      text: "Message text from DB"
    });
    expect(store.recordSent).toHaveBeenCalledWith({
      messageId: "message_1",
      attemptNumber: 1,
      provider: "telegram",
      providerMessageId: "telegram-mtproto-100",
      attemptedAt: now
    });
    expect(JSON.stringify(logRecords)).not.toContain("Message text from DB");
  });

  it("retries only an unknown Telegram Account delivery through its reconciliation work item", async () => {
    const store = createStore({
      workItem: {
        ...createWorkItem(),
        mode: "telegram_mtproto_account",
        peerId: "777000",
        messageStatus: "unknown",
        reconciliation: true
      }
    });
    const mtprotoProvider = createMtprotoProvider({
      status: "sent",
      providerMessageId: "telegram-mtproto-reconciled"
    });

    await processMessagingDeliveryJob({
      job: createJob(),
      store,
      provider: { telegramBusiness: createBusinessProvider({ status: "sent" }), telegramMtproto: mtprotoProvider },
      now: new Date("2026-07-22T10:00:00.000Z")
    });

    expect(mtprotoProvider.sendMessage).toHaveBeenCalledOnce();
    expect(store.recordSent).toHaveBeenCalledOnce();
  });

  it("records a retryable failure when Telegram Account delivery is not configured in this worker", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store = createStore({
      workItem: {
        ...createWorkItem(),
        mode: "telegram_mtproto_account",
        peerId: "777000"
      }
    });
    const provider = createBusinessProvider({ status: "sent" });

    await expect(
      processMessagingDeliveryJob({
        job: createJob({ attemptsMade: 0, opts: { attempts: 3 } }),
        store,
        provider,
        now
      })
    ).rejects.toThrow("Telegram MTProto delivery is not configured in this worker");

    expect(provider.sendMessage).not.toHaveBeenCalled();
    expect(store.recordRetryableFailure).toHaveBeenCalledWith({
      messageId: "message_1",
      attemptNumber: 1,
      provider: "telegram",
      errorCode: "TELEGRAM_MTPROTO_PROVIDER_NOT_CONFIGURED",
      errorMessage: "Telegram MTProto delivery is not configured in this worker",
      attemptedAt: now
    });
  });

  it("records retryable failures and throws for BullMQ retry", async () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    const store = createStore();
    const provider = createBusinessProvider({
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
    const provider = createBusinessProvider({
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
    const provider = createBusinessProvider({
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
    const provider = createBusinessProvider({
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
    const provider = createBusinessProvider({
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

function createBusinessProvider(
  result: Partial<Awaited<ReturnType<TelegramBusinessMessagingDeliveryProvider["sendMessage"]>>>
): Pick<TelegramBusinessMessagingDeliveryProvider, "sendMessage"> {
  return {
    sendMessage: vi.fn(async () => ({
      provider: "telegram",
      retryable: false,
      ...result
    } as Awaited<ReturnType<TelegramBusinessMessagingDeliveryProvider["sendMessage"]>>))
  };
}

function createMtprotoProvider(
  result: Partial<Awaited<ReturnType<TelegramMtprotoMessagingProvider["sendMessage"]>>>
): Pick<TelegramMtprotoMessagingProvider, "sendMessage"> {
  return {
    sendMessage: vi.fn(async () => ({
      provider: "telegram",
      retryable: false,
      ...result
    } as Awaited<ReturnType<TelegramMtprotoMessagingProvider["sendMessage"]>>))
  };
}

function createWorkItem() {
  return {
    outboxEventId: "outbox_1",
    messageId: "message_1",
    messageStatus: "queued" as const,
    provider: "telegram" as const,
    mode: "telegram_business_bot" as const,
    channelConnectionId: "connection_1",
    businessConnectionId: "business-1",
    providerChatId: "chat-1",
    text: "Message text from DB"
  };
}
