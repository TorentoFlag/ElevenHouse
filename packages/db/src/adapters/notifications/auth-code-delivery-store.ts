import { and, eq, sql } from "drizzle-orm";
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
  readonly code: string;
  readonly expiresAt: string;
  readonly deliveryStatus: "queued" | "sent" | "failed";
};

export type AuthCodeDeliveryProcessingStore = {
  readonly findByOutboxEventId: (outboxEventId: string) => Promise<AuthCodeDeliveryWorkItem | null>;
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
          payload: sql`(${outboxEvents.payload} - 'code') || jsonb_build_object('codeRedactedAt', ${input.redactedAt.toISOString()}::text)`,
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

  if (payload.challengeId !== input.challengeId || payload.deliveryId !== input.deliveryId) {
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

  if (!("code" in payload) || typeof payload.code !== "string") {
    throw new Error(`Outbox event ${input.outboxEventId} auth code payload is redacted`);
  }

  return {
    outboxEventId: input.outboxEventId,
    challengeId: input.challengeId,
    deliveryId: input.deliveryId,
    channel: input.channel,
    identifier: input.identifierNormalized,
    code: payload.code,
    expiresAt: input.expiresAt.toISOString(),
    deliveryStatus: input.deliveryStatus
  };
}
