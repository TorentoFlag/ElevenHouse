import { and, eq, sql } from "drizzle-orm";
import type { Aes256GcmEncryptedSecret } from "@elevenhouse/auth";
import { authChallengeDeliveryAttempts } from "../../schema/identity/auth-challenge-delivery-attempts.schema";
import { authChallengeDeliveries } from "../../schema/identity/auth-challenge-deliveries.schema";
import { authChallenges } from "../../schema/identity/auth-challenges.schema";
import { outboxEvents, type OutboxEventPayload } from "../../schema/outbox/outbox-events.schema";
import type { ElevenHouseDatabase } from "../../runtime";

export type AuthCodeDeliveryWorkItem = {
  readonly outboxEventId: string;
  readonly challengeId: string;
  readonly deliveryId: string;
  readonly channel: "email" | "phone";
  readonly identifier: string;
  readonly encryptedCode: Aes256GcmEncryptedSecret;
  readonly expiresAt: string;
  readonly deliveryStatus: "queued" | "sent" | "failed";
};

export type AuthCodeDeliveryProcessingStore = {
  readonly findByOutboxEventId: (outboxEventId: string) => Promise<AuthCodeDeliveryWorkItem | null>;
  readonly recordAttempt: (input: {
    readonly deliveryId: string;
    readonly attemptNumber: number;
    readonly provider: string;
    readonly status: "sent" | "failed";
    readonly attemptedAt: Date;
    readonly providerStatusCode?: number;
    readonly providerMessageId?: string;
    readonly errorCode?: string;
    readonly errorMessage?: string;
  }) => Promise<void>;
  readonly markSent: (input: {
    readonly deliveryId: string;
    readonly provider: string;
    readonly providerMessageId?: string;
    readonly sentAt: Date;
  }) => Promise<void>;
  readonly markFailed: (input: {
    readonly deliveryId: string;
    readonly provider: string;
    readonly errorCode: string;
    readonly errorMessage: string;
  }) => Promise<void>;
  readonly redactAuthCodePayload: (input: {
    readonly outboxEventId: string;
    readonly redactedAt: Date;
  }) => Promise<void>;
};

export function createDrizzleAuthCodeDeliveryProcessingStore(
  database: ElevenHouseDatabase
): AuthCodeDeliveryProcessingStore {
  return {
    findByOutboxEventId: async (outboxEventId) => {
      const row = await database
        .select({
          outboxEventId: outboxEvents.id,
          payload: outboxEvents.payload,
          challengeId: authChallenges.id,
          deliveryId: authChallengeDeliveries.id,
          channel: authChallenges.channel,
          identifierNormalized: authChallenges.identifierNormalized,
          expiresAt: authChallenges.expiresAt,
          deliveryStatus: authChallengeDeliveries.status
        })
        .from(outboxEvents)
        .innerJoin(
          authChallengeDeliveries,
          eq(authChallengeDeliveries.id, outboxEvents.aggregateId)
        )
        .innerJoin(authChallenges, eq(authChallenges.id, authChallengeDeliveries.challengeId))
        .where(eq(outboxEvents.id, outboxEventId))
        .limit(1);

      const result = row[0];
      if (!result) {
        return null;
      }

      return toAuthCodeDeliveryWorkItem({
        outboxEventId: result.outboxEventId,
        payload: result.payload,
        challengeId: result.challengeId,
        deliveryId: result.deliveryId,
        channel: result.channel,
        identifierNormalized: result.identifierNormalized,
        expiresAt: result.expiresAt,
        deliveryStatus: result.deliveryStatus
      });
    },
    recordAttempt: async (input) => {
      await database.insert(authChallengeDeliveryAttempts).values({
        deliveryId: input.deliveryId,
        attemptNumber: input.attemptNumber,
        provider: input.provider,
        status: input.status,
        attemptedAt: input.attemptedAt,
        ...(input.providerStatusCode === undefined
          ? {}
          : { providerStatusCode: input.providerStatusCode }),
        ...(input.providerMessageId === undefined
          ? {}
          : { providerMessageId: input.providerMessageId }),
        ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
        ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage })
      });
    },
    markSent: async (input) => {
      await database
        .update(authChallengeDeliveries)
        .set({
          provider: input.provider,
          status: "sent",
          ...(input.providerMessageId === undefined
            ? {}
            : { providerMessageId: input.providerMessageId }),
          sentAt: input.sentAt
        })
        .where(
          and(
            eq(authChallengeDeliveries.id, input.deliveryId),
            eq(authChallengeDeliveries.status, "queued")
          )
        );
    },
    markFailed: async (input) => {
      await database
        .update(authChallengeDeliveries)
        .set({
          provider: input.provider,
          status: "failed",
          errorCode: input.errorCode,
          errorMessage: input.errorMessage
        })
        .where(
          and(
            eq(authChallengeDeliveries.id, input.deliveryId),
            eq(authChallengeDeliveries.status, "queued")
          )
        );
    },
    redactAuthCodePayload: async (input) => {
      await database
        .update(outboxEvents)
        .set({
          payload: sql`(${outboxEvents.payload} - 'encryptedCode') || jsonb_build_object('codeRedactedAt', ${input.redactedAt.toISOString()}::text)`,
          updatedAt: input.redactedAt
        })
        .where(eq(outboxEvents.id, input.outboxEventId));
    }
  };
}

function toAuthCodeDeliveryWorkItem(input: {
  readonly outboxEventId: string;
  readonly payload: OutboxEventPayload;
  readonly challengeId: string;
  readonly deliveryId: string;
  readonly channel: string;
  readonly identifierNormalized: string;
  readonly expiresAt: Date;
  readonly deliveryStatus: string;
}): AuthCodeDeliveryWorkItem {
  const payload = input.payload;

  if (
    !("challengeId" in payload) ||
    !("deliveryId" in payload) ||
    payload.challengeId !== input.challengeId ||
    payload.deliveryId !== input.deliveryId
  ) {
    throw new Error(`Outbox event ${input.outboxEventId} does not match delivery aggregate`);
  }

  if (input.channel !== "email" && input.channel !== "phone") {
    throw new Error(`Unexpected auth code delivery channel: ${input.channel}`);
  }

  if (
    input.deliveryStatus !== "queued" &&
    input.deliveryStatus !== "sent" &&
    input.deliveryStatus !== "failed"
  ) {
    throw new Error(`Unexpected auth code delivery status: ${input.deliveryStatus}`);
  }

  if (!("encryptedCode" in payload) || !isAes256GcmEncryptedSecret(payload.encryptedCode)) {
    throw new Error(`Outbox event ${input.outboxEventId} auth code payload is redacted`);
  }

  return {
    outboxEventId: input.outboxEventId,
    challengeId: input.challengeId,
    deliveryId: input.deliveryId,
    channel: input.channel,
    identifier: input.identifierNormalized,
    encryptedCode: payload.encryptedCode,
    expiresAt: input.expiresAt.toISOString(),
    deliveryStatus: input.deliveryStatus
  };
}

function isAes256GcmEncryptedSecret(value: unknown): value is Aes256GcmEncryptedSecret {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const secret = value as Record<string, unknown>;
  return (
    secret.algorithm === "aes-256-gcm" &&
    typeof secret.iv === "string" &&
    typeof secret.ciphertext === "string" &&
    typeof secret.authTag === "string"
  );
}
