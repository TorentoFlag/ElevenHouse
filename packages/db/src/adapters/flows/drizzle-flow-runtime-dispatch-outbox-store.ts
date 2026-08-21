import { and, eq, sql } from "drizzle-orm";

import {
  BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED,
  CHART_CALCULATION_TERMINAL_EVENT,
  CLIENT_BIRTH_PROFILE_UPDATED_EVENT,
  FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT,
  FLOW_CLIENT_LIFECYCLE_CHANGED_ENROLLMENT_REQUESTED_EVENT,
  FLOW_FIRST_INBOUND_MESSAGE_ENROLLMENT_REQUESTED_EVENT,
  FLOW_PRODUCT_PURCHASED_ENROLLMENT_REQUESTED_EVENT,
  FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT,
  messagingMessageDeliveryTerminalEventType,
  type ClaimedFlowRuntimeDispatchOutboxEvent,
  type FlowRuntimeDispatchOutboxDispositionResult,
  type FlowRuntimeDispatchOutboxQuarantineNotice,
  type FlowRuntimeDispatchOutboxReason,
  type FlowRuntimeDispatchOutboxStore
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";

type ClaimRow = {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly claimFence: string | bigint;
};

type QuarantineNoticeRow = {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly attempts: number;
  readonly reasonCode: FlowRuntimeDispatchOutboxReason;
};

const retryExhaustedReason = "FLOW_RUNTIME_DISPATCH_RETRY_EXHAUSTED" as const;

export function createDrizzleFlowRuntimeDispatchOutboxStore(
  database: ElevenHouseDatabase
): FlowRuntimeDispatchOutboxStore {
  return {
    claimBatch: async (input) => {
      assertPositiveInteger(input.limit, "limit", 500);
      assertPositiveInteger(input.publishingLockTimeoutMs, "publishingLockTimeoutMs");
      assertPositiveInteger(input.maxAttempts, "maxAttempts", 100);

      return database.transaction(async (transaction) => {
        const exhaustedResult = await transaction.execute(sql<QuarantineNoticeRow>`
          with exhausted as (
            select ${outboxEvents.id}
              from ${outboxEvents}
             where ${outboxEvents.eventType} in (
                     ${FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT},
                     ${FLOW_PRODUCT_PURCHASED_ENROLLMENT_REQUESTED_EVENT},
                     ${FLOW_FIRST_INBOUND_MESSAGE_ENROLLMENT_REQUESTED_EVENT},
                     ${FLOW_CLIENT_LIFECYCLE_CHANGED_ENROLLMENT_REQUESTED_EVENT},
                     ${FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT},
                     ${BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED},
                     ${CHART_CALCULATION_TERMINAL_EVENT},
                     ${messagingMessageDeliveryTerminalEventType},
                     ${CLIENT_BIRTH_PROFILE_UPDATED_EVENT}
                   )
               and ${outboxEvents.attempts} >= ${input.maxAttempts}
               and (
                 (
                   ${outboxEvents.status} = 'pending'
                   and ${outboxEvents.availableAt} <= transaction_timestamp()
                 )
                 or (
                   ${outboxEvents.status} = 'publishing'
                   and ${outboxEvents.lockedAt} <= transaction_timestamp()
                     - (${input.publishingLockTimeoutMs} * interval '1 millisecond')
                 )
               )
             order by ${outboxEvents.createdAt}, ${outboxEvents.id}
             limit ${input.limit}
             for update skip locked
          )
          update ${outboxEvents}
             set status = 'quarantined',
                 locked_at = null,
                 published_at = null,
                 quarantined_at = transaction_timestamp(),
                 quarantine_reason_code = ${retryExhaustedReason},
                 last_error = ${retryExhaustedReason},
                 updated_at = transaction_timestamp()
            from exhausted
           where ${outboxEvents.id} = exhausted.id
          returning ${outboxEvents.id} as "id",
                    ${outboxEvents.eventType} as "eventType",
                    ${outboxEvents.aggregateId} as "aggregateId",
                    ${outboxEvents.attempts} as "attempts",
                    ${outboxEvents.quarantineReasonCode} as "reasonCode"
        `);
        const quarantined = (exhaustedResult.rows as unknown as readonly QuarantineNoticeRow[]).map(
          toQuarantineNotice
        );
        const remaining = input.limit - quarantined.length;
        if (remaining === 0) return { claimed: [], quarantined };

        const claimResult = await transaction.execute(sql<ClaimRow>`
          with claimable as (
            select ${outboxEvents.id}
              from ${outboxEvents}
             where ${outboxEvents.eventType} in (
                     ${FLOW_BOOKING_CONFIRMED_ENROLLMENT_REQUESTED_EVENT},
                     ${FLOW_PRODUCT_PURCHASED_ENROLLMENT_REQUESTED_EVENT},
                     ${FLOW_FIRST_INBOUND_MESSAGE_ENROLLMENT_REQUESTED_EVENT},
                     ${FLOW_CLIENT_LIFECYCLE_CHANGED_ENROLLMENT_REQUESTED_EVENT},
                     ${FLOW_REVIEW_FIRST_PUBLISHED_ENROLLMENT_REQUESTED_EVENT},
                     ${BOOKING_LIFECYCLE_EVENT_DISPATCH_REQUESTED},
                     ${CHART_CALCULATION_TERMINAL_EVENT},
                     ${messagingMessageDeliveryTerminalEventType},
                     ${CLIENT_BIRTH_PROFILE_UPDATED_EVENT}
                   )
               and ${outboxEvents.attempts} < ${input.maxAttempts}
               and (
                 (
                   ${outboxEvents.status} = 'pending'
                   and ${outboxEvents.availableAt} <= transaction_timestamp()
                 )
                 or (
                   ${outboxEvents.status} = 'publishing'
                   and ${outboxEvents.lockedAt} <= transaction_timestamp()
                     - (${input.publishingLockTimeoutMs} * interval '1 millisecond')
                 )
               )
             order by ${outboxEvents.createdAt}, ${outboxEvents.id}
             limit ${remaining}
             for update skip locked
          )
          update ${outboxEvents}
             set status = 'publishing',
                 attempts = ${outboxEvents.attempts} + 1,
                 claim_fence = ${outboxEvents.claimFence} + 1,
                 locked_at = transaction_timestamp(),
                 published_at = null,
                 quarantined_at = null,
                 quarantine_reason_code = null,
                 last_error = null,
                 updated_at = transaction_timestamp()
            from claimable
           where ${outboxEvents.id} = claimable.id
          returning ${outboxEvents.id} as "id",
                    ${outboxEvents.eventType} as "eventType",
                    ${outboxEvents.aggregateId} as "aggregateId",
                    ${outboxEvents.payload} as "payload",
                    ${outboxEvents.attempts} as "attempts",
                    ${outboxEvents.claimFence} as "claimFence"
        `);

        return {
          claimed: (claimResult.rows as unknown as readonly ClaimRow[]).map(toClaimedEvent),
          quarantined
        };
      });
    },
    markPublished: async (input) =>
      dispositionFromRows(
        await database
          .update(outboxEvents)
          .set({
            status: "published",
            lockedAt: null,
            publishedAt: sql`transaction_timestamp()`,
            quarantinedAt: null,
            quarantineReasonCode: null,
            lastError: null,
            updatedAt: sql`transaction_timestamp()`
          })
          .where(dispositionFence(input))
          .returning({ id: outboxEvents.id })
      ),
    markRetry: async (input) => {
      assertPositiveInteger(input.retryDelayMs, "retryDelayMs", 86_400_000);
      return dispositionFromRows(
        await database
          .update(outboxEvents)
          .set({
            status: "pending",
            availableAt: sql`transaction_timestamp() + (${input.retryDelayMs} * interval '1 millisecond')`,
            lockedAt: null,
            publishedAt: null,
            quarantinedAt: null,
            quarantineReasonCode: null,
            lastError: input.reasonCode,
            updatedAt: sql`transaction_timestamp()`
          })
          .where(dispositionFence(input))
          .returning({ id: outboxEvents.id })
      );
    },
    markDeferred: async (input) => {
      assertPositiveInteger(input.retryDelayMs, "retryDelayMs", 86_400_000);
      return dispositionFromRows(
        await database
          .update(outboxEvents)
          .set({
            status: "pending",
            attempts: sql`${outboxEvents.attempts} - 1`,
            availableAt: sql`transaction_timestamp() + (${input.retryDelayMs} * interval '1 millisecond')`,
            lockedAt: null,
            publishedAt: null,
            quarantinedAt: null,
            quarantineReasonCode: null,
            lastError: input.reasonCode,
            updatedAt: sql`transaction_timestamp()`
          })
          .where(
            and(
              dispositionFence(input),
              sql`${outboxEvents.attempts} > 0`
            )
          )
          .returning({ id: outboxEvents.id })
      );
    },
    markQuarantined: async (input) =>
      dispositionFromRows(
        await database
          .update(outboxEvents)
          .set({
            status: "quarantined",
            lockedAt: null,
            publishedAt: null,
            quarantinedAt: sql`transaction_timestamp()`,
            quarantineReasonCode: input.reasonCode,
            lastError: input.reasonCode,
            updatedAt: sql`transaction_timestamp()`
          })
          .where(dispositionFence(input))
          .returning({ id: outboxEvents.id })
      )
  };
}

function dispositionFence(input: { readonly eventId: string; readonly claimFence: bigint }) {
  return and(
    eq(outboxEvents.id, input.eventId),
    eq(outboxEvents.status, "publishing"),
    eq(outboxEvents.claimFence, input.claimFence)
  );
}

function dispositionFromRows(
  rows: readonly { readonly id: string }[]
): FlowRuntimeDispatchOutboxDispositionResult {
  return rows.length === 1 ? { status: "applied" } : { status: "stale" };
}

function toClaimedEvent(row: ClaimRow): ClaimedFlowRuntimeDispatchOutboxEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    aggregateId: row.aggregateId,
    payload: row.payload,
    attempts: row.attempts,
    claimFence: BigInt(row.claimFence)
  };
}

function toQuarantineNotice(row: QuarantineNoticeRow): FlowRuntimeDispatchOutboxQuarantineNotice {
  return {
    id: row.id,
    eventType: row.eventType,
    aggregateId: row.aggregateId,
    attempts: row.attempts,
    reasonCode: row.reasonCode
  };
}

function assertPositiveInteger(value: number, name: string, maximum?: number): void {
  if (!Number.isInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    throw new Error(
      `${name} must be a positive integer${maximum ? ` no greater than ${maximum}` : ""}`
    );
  }
}
