import type { Job } from "bullmq";
import type { MessagingDeliveryProcessingStore } from "@elevenhouse/db/messaging";
import type { Logger } from "@elevenhouse/observability";
import type { MessagingDeliveryJobData } from "./messaging-delivery.queue";
import type {
  InstagramGraphDeliveryProvider,
  InstagramGraphDeliveryProviderResult
} from "./instagram-graph-delivery-provider";
import type {
  MessagingDeliveryProvider,
  MessagingDeliveryProviderResult
} from "./telegram-business-provider";
import type { TelegramMtprotoMessagingProviderResult } from "./telegram-mtproto-provider";
import type { TelegramMtprotoDeliveryProvider } from "./telegram-mtproto-session-delivery-provider";
import type {
  WhatsAppCloudDeliveryProvider,
  WhatsAppCloudDeliveryProviderResult
} from "./whatsapp-cloud-delivery-provider";

export type MessagingDeliveryProviders =
  | MessagingDeliveryProvider
  | {
      readonly telegramBusiness: MessagingDeliveryProvider;
      readonly telegramMtproto?: TelegramMtprotoDeliveryProvider;
      readonly instagramGraph?: InstagramGraphDeliveryProvider;
      readonly whatsappCloud?: WhatsAppCloudDeliveryProvider;
    };

type MessagingDeliveryResult =
  | MessagingDeliveryProviderResult
  | TelegramMtprotoMessagingProviderResult
  | InstagramGraphDeliveryProviderResult
  | WhatsAppCloudDeliveryProviderResult;

export async function processMessagingDeliveryJob(input: {
  readonly job: Job<MessagingDeliveryJobData>;
  readonly store: MessagingDeliveryProcessingStore;
  readonly provider: MessagingDeliveryProviders;
  readonly now: Date;
  readonly logger?: Logger;
}): Promise<void> {
  const attemptNumber = getAttemptNumber(input.job);
  input.logger?.info("messaging delivery job started", {
    outboxEventId: input.job.data.outboxEventId,
    attemptNumber
  });

  const workItem = await input.store.findByOutboxEventId(input.job.data.outboxEventId);
  const reconciliationEligible =
    workItem?.reconciliation === true &&
    workItem.mode === "telegram_mtproto_account" &&
    workItem.messageStatus === "unknown";
  if (!workItem || (workItem.messageStatus !== "queued" && !reconciliationEligible)) {
    input.logger?.info("messaging delivery job skipped", {
      outboxEventId: input.job.data.outboxEventId,
      messageStatus: workItem?.messageStatus ?? "missing"
    });
    return;
  }

  const result = await sendWithProvider(input.provider, workItem);

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
    errorCode: result.errorCode ?? defaultDeliveryErrorCode(result.provider),
    errorMessage: result.errorMessage ?? defaultDeliveryErrorMessage(result.provider),
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
  result: MessagingDeliveryResult
): Promise<void> {
  const failure = {
    messageId,
    attemptNumber,
    provider: result.provider,
    providerStatusCode: result.providerStatusCode,
    errorCode: result.errorCode ?? defaultDeliveryErrorCode(result.provider),
    errorMessage: result.errorMessage ?? defaultDeliveryErrorMessage(result.provider),
    attemptedAt: input.now,
    ...(result.connectionStatus
      ? {
          connectionFailure: {
            status: result.connectionStatus,
            errorCode: result.errorCode ?? defaultDeliveryErrorCode(result.provider),
            errorMessage: result.errorMessage ?? defaultDeliveryErrorMessage(result.provider)
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
  constructor(result: MessagingDeliveryResult) {
    super(result.errorMessage ?? "Messaging delivery failed");
    this.name = "MessagingDeliveryRetryableError";
  }
}

function sendWithProvider(
  providers: MessagingDeliveryProviders,
  workItem: Awaited<ReturnType<MessagingDeliveryProcessingStore["findByOutboxEventId"]>>
): Promise<MessagingDeliveryResult> {
  if (!workItem) {
    throw new Error("Messaging delivery work item is required");
  }

  if ("sendMessage" in providers) {
    if (workItem.mode !== "telegram_business_bot") {
      return Promise.resolve({
        provider: "telegram",
        status: "failed",
        retryable: true,
        errorCode: "TELEGRAM_MTPROTO_PROVIDER_NOT_CONFIGURED",
        errorMessage: "Telegram MTProto delivery is not configured in this worker"
      });
    }
    return providers.sendMessage({
      messageId: workItem.messageId,
      businessConnectionId: workItem.businessConnectionId,
      chatId: workItem.providerChatId,
      text: workItem.text
    });
  }

  if (workItem.mode === "telegram_business_bot") {
    return providers.telegramBusiness.sendMessage({
      messageId: workItem.messageId,
      businessConnectionId: workItem.businessConnectionId,
      chatId: workItem.providerChatId,
      text: workItem.text
    });
  }

  if (workItem.mode === "instagram_graph") {
    if (!providers.instagramGraph) {
      return Promise.resolve({
        provider: "instagram",
        status: "failed",
        retryable: true,
        errorCode: "INSTAGRAM_GRAPH_PROVIDER_NOT_CONFIGURED",
        errorMessage: "Instagram Graph delivery is not configured in this worker"
      });
    }
    return providers.instagramGraph.sendMessage({
      messageId: workItem.messageId,
      channelConnectionId: workItem.channelConnectionId,
      astrologerUserId: workItem.astrologerUserId,
      instagramAccountId: workItem.instagramAccountId,
      recipientId: workItem.providerChatId,
      text: workItem.text,
      encryptedAccessToken: workItem.encryptedAccessToken
    });
  }

  if (workItem.mode === "whatsapp_cloud") {
    if (!providers.whatsappCloud) {
      return Promise.resolve({
        provider: "whatsapp",
        status: "failed",
        retryable: true,
        errorCode: "WHATSAPP_CLOUD_PROVIDER_NOT_CONFIGURED",
        errorMessage: "WhatsApp Cloud delivery is not configured in this worker"
      });
    }
    return providers.whatsappCloud.sendMessage({
      messageId: workItem.messageId,
      channelConnectionId: workItem.channelConnectionId,
      astrologerUserId: workItem.astrologerUserId,
      phoneNumberId: workItem.phoneNumberId,
      recipientWaId: workItem.providerChatId,
      text: workItem.text,
      encryptedAccessToken: workItem.encryptedAccessToken
    });
  }

  if (!providers.telegramMtproto) {
    return Promise.resolve({
      provider: "telegram",
      status: "failed",
      retryable: true,
      errorCode: "TELEGRAM_MTPROTO_PROVIDER_NOT_CONFIGURED",
      errorMessage: "Telegram MTProto delivery is not configured in this worker"
    });
  }

  return providers.telegramMtproto.sendMessage({
    messageId: workItem.messageId,
    channelConnectionId: workItem.channelConnectionId,
    peerId: workItem.peerId,
    text: workItem.text
  });
}

function getAttemptNumber(job: Job<MessagingDeliveryJobData>): number {
  return job.attemptsMade + 1;
}

function isFinalAttempt(job: Job<MessagingDeliveryJobData>): boolean {
  const attempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;

  return job.attemptsMade + 1 >= attempts;
}

function defaultDeliveryErrorCode(provider: "telegram" | "instagram" | "whatsapp"): string {
  if (provider === "instagram") return "INSTAGRAM_GRAPH_DELIVERY_FAILED";
  if (provider === "whatsapp") return "WHATSAPP_CLOUD_DELIVERY_FAILED";
  return "TELEGRAM_BUSINESS_DELIVERY_FAILED";
}

function defaultDeliveryErrorMessage(provider: "telegram" | "instagram" | "whatsapp"): string {
  if (provider === "instagram") return "Instagram Graph delivery failed";
  if (provider === "whatsapp") return "WhatsApp Cloud delivery failed";
  return "Telegram Business delivery failed";
}
