import type { Job } from "bullmq";
import type { AuthCodeDeliveryProcessingStore } from "@elevenhouse/db/notifications";
import type { AuthCodeDeliveryJobData } from "./auth-code-delivery.queue";
import type { AuthCodeDeliveryProvider, AuthCodeDeliveryResult } from "./auth-code-delivery.provider";

export async function processAuthCodeDeliveryJob(input: {
  readonly job: Job<AuthCodeDeliveryJobData>;
  readonly store: AuthCodeDeliveryProcessingStore;
  readonly delivery: AuthCodeDeliveryProvider;
  readonly now: Date;
}): Promise<void> {
  const workItem = await input.store.findByOutboxEventId(input.job.data.outboxEventId);

  if (!workItem || workItem.deliveryStatus !== "queued") {
    return;
  }

  if (new Date(workItem.expiresAt).getTime() <= input.now.getTime()) {
    await input.store.markFailed({
      deliveryId: workItem.deliveryId,
      provider: "system",
      errorCode: "AUTH_CODE_EXPIRED",
      errorMessage: "Auth code expired before delivery"
    });
    await input.store.redactAuthCodePayload({
      outboxEventId: workItem.outboxEventId,
      redactedAt: input.now
    });
    return;
  }

  const result = await input.delivery.deliverAuthCode({
    challengeId: workItem.challengeId,
    deliveryId: workItem.deliveryId,
    outboxEventId: workItem.outboxEventId,
    channel: workItem.channel,
    identifier: workItem.identifier,
    code: workItem.code,
    expiresAt: workItem.expiresAt
  });

  if (result.status === "sent") {
    await input.store.markSent({
      deliveryId: workItem.deliveryId,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      sentAt: input.now
    });
    await input.store.redactAuthCodePayload({
      outboxEventId: workItem.outboxEventId,
      redactedAt: input.now
    });
    return;
  }

  if (isFinalAttempt(input.job)) {
    await input.store.markFailed({
      deliveryId: workItem.deliveryId,
      provider: result.provider,
      errorCode: result.errorCode ?? "AUTH_CODE_DELIVERY_FAILED",
      errorMessage: result.errorMessage ?? "Auth code delivery failed"
    });
    await input.store.redactAuthCodePayload({
      outboxEventId: workItem.outboxEventId,
      redactedAt: input.now
    });
    return;
  }

  throw new AuthCodeDeliveryRetryableError(result);
}

class AuthCodeDeliveryRetryableError extends Error {
  constructor(result: AuthCodeDeliveryResult) {
    super(result.errorMessage ?? "Auth code delivery failed");
    this.name = "AuthCodeDeliveryRetryableError";
  }
}

function isFinalAttempt(job: Job<AuthCodeDeliveryJobData>): boolean {
  const attempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;

  return job.attemptsMade + 1 >= attempts;
}
