import type { Job } from "bullmq";
import type { MessagingDeliveryProcessingStore } from "@elevenhouse/db/messaging";
import type { Logger } from "@elevenhouse/observability";
import type { MessagingDeliveryJobData } from "./messaging-delivery.queue";
import type { MessagingDeliveryProvider, MessagingDeliveryProviderResult } from "./telegram-business-provider";

export async function processMessagingDeliveryJob(input: {
  readonly job: Job<MessagingDeliveryJobData>;
  readonly store: MessagingDeliveryProcessingStore;
  readonly provider: MessagingDeliveryProvider;
  readonly now: Date;
  readonly logger?: Logger;
}): Promise<void> {
  const attemptNumber = getAttemptNumber(input.job);
  input.logger?.info("messaging delivery job started", {
    outboxEventId: input.job.data.outboxEventId,
    attemptNumber
  });

  const workItem = await input.store.findByOutboxEventId(input.job.data.outboxEventId);
  if (!workItem || workItem.messageStatus !== "queued") {
    input.logger?.info("messaging delivery job skipped", {
      outboxEventId: input.job.data.outboxEventId,
      messageStatus: workItem?.messageStatus ?? "missing"
    });
    return;
  }

  const result = await input.provider.sendMessage({
    messageId: workItem.messageId,
    businessConnectionId: workItem.businessConnectionId,
    chatId: workItem.providerChatId,
    text: workItem.text
  });

  if (result.status === "sent") {
    await input.store.recordSent({
      messageId: workItem.messageId,
      attemptNumber,
      provider: result.provider,
      providerStatusCode: result.providerStatusCode,
      providerMessageId: result.providerMessageId,
      attemptedAt: input.now
    });
    input.logger?.info("messaging delivery sent", {
      outboxEventId: workItem.outboxEventId,
      messageId: workItem.messageId,
      provider: result.provider,
      attemptNumber,
      providerStatusCode: result.providerStatusCode,
      providerMessageId: result.providerMessageId
    });
    return;
  }

  if (isFinalAttempt(input.job) || !result.retryable) {
    await recordFinal(input, workItem.messageId, attemptNumber, result);
    return;
  }

  const retryableAttempt = {
    messageId: workItem.messageId,
    attemptNumber,
    provider: result.provider,
    providerStatusCode: result.providerStatusCode,
    errorCode: result.errorCode ?? "TELEGRAM_BUSINESS_DELIVERY_FAILED",
    errorMessage: result.errorMessage ?? "Telegram Business delivery failed",
    attemptedAt: input.now
  };
  if (result.status === "unknown") {
    await input.store.recordRetryableUnknown(retryableAttempt);
  } else {
    await input.store.recordRetryableFailure(retryableAttempt);
  }
  input.logger?.warn("messaging delivery attempt failed, retry scheduled", {
    outboxEventId: workItem.outboxEventId,
    messageId: workItem.messageId,
    provider: result.provider,
    attemptNumber,
    providerStatusCode: result.providerStatusCode,
    errorCode: result.errorCode ?? "TELEGRAM_BUSINESS_DELIVERY_FAILED"
  });
  throw new MessagingDeliveryRetryableError(result);
}

async function recordFinal(
  input: {
    readonly store: MessagingDeliveryProcessingStore;
    readonly now: Date;
    readonly logger?: Logger;
  },
  messageId: string,
  attemptNumber: number,
  result: MessagingDeliveryProviderResult
): Promise<void> {
  const failure = {
    messageId,
    attemptNumber,
    provider: result.provider,
    providerStatusCode: result.providerStatusCode,
    errorCode: result.errorCode ?? "TELEGRAM_BUSINESS_DELIVERY_FAILED",
    errorMessage: result.errorMessage ?? "Telegram Business delivery failed",
    attemptedAt: input.now,
    ...(result.connectionStatus
      ? {
          connectionFailure: {
            status: result.connectionStatus,
            errorCode: result.errorCode ?? "TELEGRAM_BUSINESS_DELIVERY_FAILED",
            errorMessage: result.errorMessage ?? "Telegram Business delivery failed"
          }
        }
      : {})
  };

  if (result.status === "unknown") {
    await input.store.recordFinalUnknown(failure);
    input.logger?.error("messaging delivery unknown after final attempt", {
      messageId,
      provider: result.provider,
      attemptNumber,
      providerStatusCode: result.providerStatusCode,
      errorCode: failure.errorCode
    });
    return;
  }

  await input.store.recordFinalFailure(failure);
  input.logger?.error("messaging delivery failed final attempt", {
    messageId,
    provider: result.provider,
    attemptNumber,
    providerStatusCode: result.providerStatusCode,
    errorCode: failure.errorCode
  });
}

class MessagingDeliveryRetryableError extends Error {
  constructor(result: MessagingDeliveryProviderResult) {
    super(result.errorMessage ?? "Messaging delivery failed");
    this.name = "MessagingDeliveryRetryableError";
  }
}

function getAttemptNumber(job: Job<MessagingDeliveryJobData>): number {
  return job.attemptsMade + 1;
}

function isFinalAttempt(job: Job<MessagingDeliveryJobData>): boolean {
  const attempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;

  return job.attemptsMade + 1 >= attempts;
}
