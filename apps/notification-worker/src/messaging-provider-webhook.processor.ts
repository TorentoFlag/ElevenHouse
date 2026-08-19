import type { Job } from "bullmq";
import type { MessagingProviderWebhookProcessingStore } from "@elevenhouse/db/messaging";
import type { Logger } from "@elevenhouse/observability";
import type { MessagingProviderWebhookJobData } from "./messaging-provider-webhook.queue";

const processorErrorCode = "MESSAGING_PROVIDER_WEBHOOK_PROCESSING_FAILED";

export async function processMessagingProviderWebhookJob(input: {
  readonly job: Job<MessagingProviderWebhookJobData>;
  readonly store: Pick<
    MessagingProviderWebhookProcessingStore,
    "claimDueById" | "markProcessed" | "markRetryableFailed" | "markFinalFailed"
  >;
  readonly now: Date;
  readonly logger?: Logger;
  readonly leaseOwner?: string;
}): Promise<void> {
  const now = input.now.toISOString();
  const eventKey = input.job.data.eventKey;
  const workItem = await input.store.claimDueById({
    eventKey,
    leaseOwner: input.leaseOwner ?? "notification-worker",
    now
  });

  if (!workItem) {
    input.logger?.info("messaging provider webhook job skipped", { eventKey });
    return;
  }

  try {
    assertValidWhatsAppSyncWorkItem(workItem.normalizedSummary);
    await input.store.markProcessed({ eventKey, now });
    input.logger?.info("messaging provider webhook job processed", {
      eventKey,
      field: workItem.field,
      provider: workItem.provider
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown webhook processing error";
    if (isFinalAttempt(input.job)) {
      await input.store.markFinalFailed({
        eventKey,
        errorCode: processorErrorCode,
        errorMessage,
        now
      });
      input.logger?.error("messaging provider webhook job failed final attempt", {
        eventKey,
        errorCode: processorErrorCode
      });
      return;
    }

    await input.store.markRetryableFailed({
      eventKey,
      errorCode: processorErrorCode,
      errorMessage,
      now
    });
    input.logger?.warn("messaging provider webhook job failed, retry scheduled", {
      eventKey,
      errorCode: processorErrorCode
    });
    throw new MessagingProviderWebhookRetryableError();
  }
}

function assertValidWhatsAppSyncWorkItem(summary: Readonly<Record<string, unknown>>): void {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new Error("WhatsApp sync webhook summary is invalid");
  }
}

function isFinalAttempt(job: Job): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

class MessagingProviderWebhookRetryableError extends Error {
  constructor() {
    super("Messaging provider webhook processing failed");
    this.name = "MessagingProviderWebhookRetryableError";
  }
}
