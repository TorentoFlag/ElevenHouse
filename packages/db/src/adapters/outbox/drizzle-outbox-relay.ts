import { and, eq, inArray, sql } from "drizzle-orm";
import {
  outboxEvents,
  outboxEventStatusValues,
  type OutboxEventPayload
} from "../../schema/outbox/outbox-events.schema";
import type { ElevenHouseDatabase } from "../../runtime";

export type OutboxEventStatus = (typeof outboxEventStatusValues)[number];

export type ClaimedOutboxEvent = {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly payload: OutboxEventPayload;
  readonly attempts: number;
};

export type OutboxRelayStore = {
  readonly claimPending: (input: {
    readonly eventTypes: readonly string[];
    readonly limit: number;
    readonly now: Date;
    readonly stalePublishingBefore: Date;
  }) => Promise<readonly ClaimedOutboxEvent[]>;
  readonly markPublished: (input: {
    readonly eventId: string;
    readonly publishedAt: Date;
  }) => Promise<void>;
  readonly markPublishFailed: (input: {
    readonly eventId: string;
    readonly failedAt: Date;
    readonly nextAvailableAt: Date;
    readonly errorMessage: string;
  }) => Promise<void>;
};

export function createDrizzleOutboxRelayStore(database: ElevenHouseDatabase): OutboxRelayStore {
  return {
    claimPending: async (input) => {
      if (input.eventTypes.length === 0) {
        throw new Error("At least one outbox event type is required");
      }

      const rows = await database.transaction(async (transaction) => {
        const result = await transaction.execute(sql<ClaimedOutboxEvent>`
          with claimed as (
            select id
            from ${outboxEvents}
            where ${inArray(outboxEvents.eventType, input.eventTypes)}
              and (
                (
                  ${outboxEvents.status} = 'pending'
                  and ${outboxEvents.availableAt} <= ${input.now}
                )
                or (
                  ${outboxEvents.status} = 'publishing'
                  and ${outboxEvents.lockedAt} <= ${input.stalePublishingBefore}
                )
              )
            order by ${outboxEvents.createdAt}
            limit ${input.limit}
            for update skip locked
          )
          update ${outboxEvents}
          set
            status = 'publishing',
            locked_at = ${input.now},
            updated_at = ${input.now}
          from claimed
          where ${outboxEvents.id} = claimed.id
          returning
            ${outboxEvents.id} as "id",
            ${outboxEvents.eventType} as "eventType",
            ${outboxEvents.aggregateId} as "aggregateId",
            ${outboxEvents.payload} as "payload",
            ${outboxEvents.attempts} as "attempts"
        `);

        return result.rows as unknown as ClaimedOutboxEvent[];
      });

      return rows.map(toClaimedOutboxEvent);
    },
    markPublished: async (input) => {
      await database
        .update(outboxEvents)
        .set({
          status: "published",
          lockedAt: null,
          publishedAt: input.publishedAt,
          updatedAt: input.publishedAt
        })
        .where(and(eq(outboxEvents.id, input.eventId), eq(outboxEvents.status, "publishing")));
    },
    markPublishFailed: async (input) => {
      await database
        .update(outboxEvents)
        .set({
          status: "pending",
          attempts: sql`${outboxEvents.attempts} + 1`,
          availableAt: input.nextAvailableAt,
          lockedAt: null,
          lastError: input.errorMessage,
          updatedAt: input.failedAt
        })
        .where(and(eq(outboxEvents.id, input.eventId), eq(outboxEvents.status, "publishing")));
    }
  };
}

function toClaimedOutboxEvent(row: ClaimedOutboxEvent): ClaimedOutboxEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    aggregateId: row.aggregateId,
    payload: row.payload,
    attempts: row.attempts
  };
}
