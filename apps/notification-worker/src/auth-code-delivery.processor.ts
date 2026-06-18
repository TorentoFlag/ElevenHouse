import type { Job } from "bullmq";
import type { Aes256GcmSecretCipher } from "@elevenhouse/auth";
import type { AuthCodeDeliveryProcessingStore } from "@elevenhouse/db/notifications";
import { createAuthCodeDeliveryEncryptionAad } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";
import type { AuthCodeDeliveryJobData } from "./auth-code-delivery.queue";
import type { AuthCodeDeliveryProvider, AuthCodeDeliveryResult } from "./auth-code-delivery.provider";

export async function processAuthCodeDeliveryJob(input: {
  readonly job: Job<AuthCodeDeliveryJobData>;
  readonly store: AuthCodeDeliveryProcessingStore;
  readonly authCodeCipher: Aes256GcmSecretCipher;
  readonly delivery: AuthCodeDeliveryProvider;
  readonly now: Date;
  readonly logger?: Logger;
}): Promise<void> {
  const attemptNumber = getAttemptNumber(input.job);
  input.logger?.info("auth code delivery job started", {
    outboxEventId: input.job.data.outboxEventId,
    attemptNumber
  });

  const workItem = await input.store.findByOutboxEventId(input.job.data.outboxEventId);

  if (!workItem || workItem.deliveryStatus !== "queued") {
    input.logger?.info("auth code delivery job skipped", {
      outboxEventId: input.job.data.outboxEventId,
      deliveryStatus: workItem?.deliveryStatus ?? "missing"
    });
    return;
  }

  if (new Date(workItem.expiresAt).getTime() <= input.now.getTime()) {
    input.logger?.warn("auth code delivery expired before provider call", {
      outboxEventId: workItem.outboxEventId,
      challengeId: workItem.challengeId,
      deliveryId: workItem.deliveryId,
      attemptNumber
    });
    await input.store.recordAttempt({
      deliveryId: workItem.deliveryId,
      attemptNumber,
      provider: "system",
      status: "failed",
      errorCode: "AUTH_CODE_EXPIRED",
      errorMessage: "Auth code expired before delivery",
      attemptedAt: input.now
    });
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
    input.logger?.info("auth code delivery payload redacted", {
      outboxEventId: workItem.outboxEventId,
      challengeId: workItem.challengeId,
      deliveryId: workItem.deliveryId,
      reason: "expired"
    });
    return;
  }

  const code = input.authCodeCipher.decrypt({
    encrypted: workItem.encryptedCode,
    aad: createAuthCodeDeliveryEncryptionAad({
      challengeId: workItem.challengeId,
      deliveryId: workItem.deliveryId,
      channel: workItem.channel,
      identifier: workItem.identifier,
      expiresAt: workItem.expiresAt
    })
  });

  const result = await input.delivery.deliverAuthCode({
    challengeId: workItem.challengeId,
    deliveryId: workItem.deliveryId,
    outboxEventId: workItem.outboxEventId,
    channel: workItem.channel,
    identifier: workItem.identifier,
    code,
    expiresAt: workItem.expiresAt
  });

  if (result.status === "sent") {
    await input.store.recordAttempt({
      deliveryId: workItem.deliveryId,
      attemptNumber,
      provider: result.provider,
      status: "sent",
      providerStatusCode: result.providerStatusCode,
      providerMessageId: result.providerMessageId,
      attemptedAt: input.now
    });
    input.logger?.info("auth code delivery sent", {
      outboxEventId: workItem.outboxEventId,
      challengeId: workItem.challengeId,
      deliveryId: workItem.deliveryId,
      provider: result.provider,
      attemptNumber,
      providerStatusCode: result.providerStatusCode,
      providerMessageId: result.providerMessageId
    });
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
    input.logger?.info("auth code delivery payload redacted", {
      outboxEventId: workItem.outboxEventId,
      challengeId: workItem.challengeId,
      deliveryId: workItem.deliveryId,
      reason: "sent"
    });
    return;
  }

  await input.store.recordAttempt({
    deliveryId: workItem.deliveryId,
    attemptNumber,
    provider: result.provider,
    status: "failed",
    providerStatusCode: result.providerStatusCode,
    errorCode: result.errorCode ?? "AUTH_CODE_DELIVERY_FAILED",
    errorMessage: result.errorMessage ?? "Auth code delivery failed",
    attemptedAt: input.now
  });

  if (isFinalAttempt(input.job)) {
    input.logger?.error("auth code delivery failed final attempt", {
      outboxEventId: workItem.outboxEventId,
      challengeId: workItem.challengeId,
      deliveryId: workItem.deliveryId,
      provider: result.provider,
      attemptNumber,
      providerStatusCode: result.providerStatusCode,
      errorCode: result.errorCode ?? "AUTH_CODE_DELIVERY_FAILED"
    });
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
    input.logger?.info("auth code delivery payload redacted", {
      outboxEventId: workItem.outboxEventId,
      challengeId: workItem.challengeId,
      deliveryId: workItem.deliveryId,
      reason: "failed"
    });
    return;
  }

  input.logger?.warn("auth code delivery attempt failed, retry scheduled", {
    outboxEventId: workItem.outboxEventId,
    challengeId: workItem.challengeId,
    deliveryId: workItem.deliveryId,
    provider: result.provider,
    attemptNumber,
    providerStatusCode: result.providerStatusCode,
    errorCode: result.errorCode ?? "AUTH_CODE_DELIVERY_FAILED"
  });
  throw new AuthCodeDeliveryRetryableError(result);
}

class AuthCodeDeliveryRetryableError extends Error {
  constructor(result: AuthCodeDeliveryResult) {
    super(result.errorMessage ?? "Auth code delivery failed");
    this.name = "AuthCodeDeliveryRetryableError";
  }
}

function getAttemptNumber(job: Job<AuthCodeDeliveryJobData>): number {
  return job.attemptsMade + 1;
}

function isFinalAttempt(job: Job<AuthCodeDeliveryJobData>): boolean {
  const attempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;

  return job.attemptsMade + 1 >= attempts;
}
