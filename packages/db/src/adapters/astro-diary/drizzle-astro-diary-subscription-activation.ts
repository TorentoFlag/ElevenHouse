import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import {
  applyClientSubscriptionCaptureDispatch,
  planAstroDiarySubscriptionActivation,
  sha256CanonicalJson,
  type AstroDiarySubscriptionActivationPlan
} from "@elevenhouse/domain";
import type {
  ClientSubscriptionCaptureAppliedEvent,
  FinanceClientOrderCaptureDispatchReceipt
} from "@elevenhouse/domain/finance-core";

import { clientAstrologerRelationships } from "../../schema/clients/client-astrologer-relationships.schema";
import {
  astroDiaryEventDeliveries,
  astroDiaryEvents,
  astroDiaryJournals,
  astroDiarySubscriptionActivationReceipts
} from "../../schema/astro-diary";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";
import type { ClientSubscriptionTransaction } from "../client-subscriptions/drizzle-client-subscription-transition-persistence";
import { applyDrizzleClientSubscriptionSourceEventInTransaction } from "../client-subscriptions/drizzle-client-subscription-uow";

export type DrizzleAstroDiarySubscriptionCaptureInput = Readonly<{
  sourceEvent: ClientSubscriptionCaptureAppliedEvent;
  dispatchReceipt: FinanceClientOrderCaptureDispatchReceipt;
}>;

export async function applyDrizzleAstroDiarySubscriptionCaptureInTransaction(
  transaction: ClientSubscriptionTransaction,
  input: DrizzleAstroDiarySubscriptionCaptureInput
) {
  return applyClientSubscriptionCaptureDispatch(
    {
      apply: (sourceInput) =>
        applyDrizzleClientSubscriptionSourceEventInTransaction(
          transaction,
          sourceInput,
          async ({ decision, applicationReceipt }) => {
            await persistDrizzleAstroDiarySubscriptionActivation(transaction, {
              appliedCapture: input,
              lockedSubscription: decision.subscription,
              immutableContract: decision.subscription.contract,
              transitionReceipt: decision.receipt,
              appliedSourceEventReceipt: applicationReceipt
            });
          }
        )
    },
    input
  );
}

type ActivationPersistenceInput = Readonly<{
  appliedCapture: DrizzleAstroDiarySubscriptionCaptureInput;
  lockedSubscription: Parameters<
    typeof planAstroDiarySubscriptionActivation
  >[0]["lockedSubscription"];
  immutableContract: Parameters<
    typeof planAstroDiarySubscriptionActivation
  >[0]["immutableContract"];
  transitionReceipt: Parameters<
    typeof planAstroDiarySubscriptionActivation
  >[0]["transitionReceipt"];
  appliedSourceEventReceipt: Parameters<
    typeof planAstroDiarySubscriptionActivation
  >[0]["appliedSourceEventReceipt"];
}>;

export async function persistDrizzleAstroDiarySubscriptionActivation(
  transaction: ClientSubscriptionTransaction,
  input: ActivationPersistenceInput
): Promise<AstroDiarySubscriptionActivationPlan> {
  const [relationship] = await transaction
    .select()
    .from(clientAstrologerRelationships)
    .where(eq(clientAstrologerRelationships.id, input.lockedSubscription.contract.relationshipId))
    .for("share")
    .limit(1);
  if (!relationship) {
    throw new AstroDiarySubscriptionActivationPersistenceError("relationship_authority_missing");
  }

  const clockResult = await transaction.execute<{ now: Date | string }>(
    sql`select clock_timestamp() as now`
  );
  const clockValue = clockResult.rows[0]?.now;
  const clock = clockValue instanceof Date ? clockValue : new Date(clockValue ?? "");
  if (!Number.isFinite(clock.getTime())) {
    throw new Error("AstroDiary activation transaction clock is missing");
  }
  const plan = planAstroDiarySubscriptionActivation({
    ...input,
    transactionClock: { now: clock.toISOString() },
    identities: {
      journalId: randomUUID(),
      journalEpochId: input.lockedSubscription.journalEpochId,
      activationReceiptId: randomUUID(),
      eventId: randomUUID()
    }
  });
  if (plan.outcome === "rejected") {
    throw new AstroDiarySubscriptionActivationPersistenceError(plan.code);
  }
  if (plan.outcome !== "activate") {
    await assertExistingJournal(transaction, input, relationship);
    return plan;
  }
  if (
    plan.journal.relationshipId !== relationship.id ||
    plan.journal.clientUserId !== relationship.clientUserId ||
    plan.journal.astrologerUserId !== relationship.astrologerUserId
  ) {
    throw new AstroDiarySubscriptionActivationPersistenceError("relationship_authority_mismatch");
  }

  await transaction.insert(astroDiaryJournals).values({
    ...plan.journal,
    clientUserId: relationship.clientUserId,
    astrologerUserId: relationship.astrologerUserId,
    createdAt: new Date(plan.journal.createdAt)
  });
  await transaction.insert(astroDiaryEvents).values({
    eventId: plan.event.eventId,
    eventType: plan.event.eventType,
    schemaVersion: plan.event.schemaVersion,
    eventDigest: sha256CanonicalJson(plan.event),
    journalId: plan.journal.id,
    journalEpochId: plan.journal.journalEpochId,
    cycleId: null,
    itemId: null,
    contextId: null,
    obligationId: null,
    responseItemId: null,
    commandId: null,
    periodId: null,
    occurredAt: new Date(plan.event.occurredAt)
  });
  await transaction.insert(astroDiarySubscriptionActivationReceipts).values({
    ...plan.activationReceipt,
    relationshipId: plan.journal.relationshipId,
    subscriptionVersion: input.lockedSubscription.version,
    activationEventId: plan.event.eventId,
    activatedAt: new Date(plan.activationReceipt.activatedAt)
  });

  const deliveryId = randomUUID();
  const availableAt = new Date(plan.event.occurredAt);
  await transaction.insert(astroDiaryEventDeliveries).values({
    id: deliveryId,
    eventId: plan.event.eventId,
    consumer: "realtime_projection",
    state: "pending",
    availableAt,
    createdAt: availableAt,
    updatedAt: availableAt
  });
  await transaction.insert(outboxEvents).values({
    eventType: "astro_diary.event_delivery.dispatch_requested.v1",
    aggregateId: deliveryId,
    payload: {
      schemaVersion: "astro-diary-event-delivery-dispatch-request.v1",
      deliveryId
    },
    availableAt,
    createdAt: availableAt,
    updatedAt: availableAt
  });
  return plan;
}

async function assertExistingJournal(
  transaction: ClientSubscriptionTransaction,
  input: ActivationPersistenceInput,
  relationship: typeof clientAstrologerRelationships.$inferSelect
): Promise<void> {
  const [journal] = await transaction
    .select({ id: astroDiaryJournals.id })
    .from(astroDiaryJournals)
    .innerJoin(
      astroDiarySubscriptionActivationReceipts,
      and(
        eq(astroDiarySubscriptionActivationReceipts.journalId, astroDiaryJournals.id),
        eq(
          astroDiarySubscriptionActivationReceipts.relationshipId,
          astroDiaryJournals.relationshipId
        ),
        eq(
          astroDiarySubscriptionActivationReceipts.journalEpochId,
          astroDiaryJournals.journalEpochId
        ),
        eq(astroDiarySubscriptionActivationReceipts.subscriptionId, input.lockedSubscription.id)
      )
    )
    .where(
      and(
        eq(astroDiaryJournals.relationshipId, relationship.id),
        eq(astroDiaryJournals.journalEpochId, input.lockedSubscription.journalEpochId),
        eq(astroDiaryJournals.clientUserId, relationship.clientUserId),
        eq(astroDiaryJournals.astrologerUserId, relationship.astrologerUserId)
      )
    )
    .limit(1);
  if (!journal) {
    throw new AstroDiarySubscriptionActivationPersistenceError("existing_journal_missing");
  }
}

export class AstroDiarySubscriptionActivationPersistenceError extends Error {
  readonly code = "astro_diary_subscription_activation_persistence_error";

  constructor(readonly reason: string) {
    super(`AstroDiary subscription activation failed: ${reason}`);
  }
}
