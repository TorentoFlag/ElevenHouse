import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { clientSubscriptionEventSchema } from "@elevenhouse/contracts";
import {
  projectClientEntitlementBatch,
  type ClientEntitlement,
  type ProjectClientEntitlementBatchOutcome,
  type ClientSubscription,
  type ClientSubscriptionTransitionReceipt
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  clientEntitlementGrants,
  clientEntitlementTransitionApplications,
  clientEntitlementTransitionEffects,
  clientSubscriptionLifecycleEvents,
  clientSubscriptionPeriodAllowances,
  clientSubscriptionPeriods,
  clientSubscriptionSlots,
  clientSubscriptions,
  clientSubscriptionTransitionReceipts
} from "../../schema/client-subscriptions";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";

export type ClientSubscriptionTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];

export async function persistClientSubscriptionTransition(
  transaction: ClientSubscriptionTransaction,
  input: {
    readonly current: ClientSubscription;
    readonly next: ClientSubscription;
    readonly receipt: ClientSubscriptionTransitionReceipt;
    readonly events: readonly unknown[];
    readonly captureEvidenceId: string | null;
  }
): Promise<void> {
  assertAppliedTransition(input);
  const events = input.events.map((event) => clientSubscriptionEventSchema.parse(event));
  const primaryEvents = events.filter(
    (event) => event.eventType !== "client_subscription.entitlement_changed.v1"
  );
  if (primaryEvents.length !== 1) {
    throw new Error("Client subscription transition must emit exactly one primary event");
  }
  const primaryEvent = primaryEvents[0];
  if (!primaryEvent) throw new Error("Client subscription transition primary event is missing");
  if (
    events.some(
      (event) =>
        event.data.subscriptionId !== input.next.id ||
        event.data.contractId !== input.next.contract.id ||
        event.occurredAt !== input.receipt.occurredAt
    )
  ) {
    throw new Error("Client subscription lifecycle event does not match transition receipt");
  }

  const currentPeriodIds = new Set(input.current.paidPeriods.map((period) => period.id));
  const newPeriods = input.next.paidPeriods.filter((period) => !currentPeriodIds.has(period.id));
  if (newPeriods.length > 1 || (newPeriods.length === 1 && input.captureEvidenceId === null)) {
    throw new Error("A subscription transition may add one period only from capture evidence");
  }
  for (const period of newPeriods) {
    await transaction.insert(clientSubscriptionPeriods).values({
      id: period.id,
      subscriptionId: input.next.id,
      contractId: input.next.contract.id,
      sequence: period.sequence,
      startsAt: new Date(period.startsAt),
      endsAt: new Date(period.endsAt),
      anchorCapturedAt: new Date(period.anchor.capturedAt),
      anchorServiceTimezone: period.anchor.serviceTimezone,
      anchorOriginSequence: period.anchor.originSequence,
      anchorLocalDateTime: period.anchor.localDateTime,
      resolvedStartLocal: period.resolvedStartLocal,
      resolvedStartOffset: period.resolvedStartOffset,
      resolvedEndLocal: period.resolvedEndLocal,
      resolvedEndOffset: period.resolvedEndOffset,
      captureEvidenceId: requireCaptureEvidence(input.captureEvidenceId),
      createdAt: new Date(input.receipt.occurredAt)
    });
    const total = input.next.contract.astroDiaryConfig.reflectionCyclesPerPeriod;
    await transaction.insert(clientSubscriptionPeriodAllowances).values({
      periodId: period.id,
      subscriptionId: input.next.id,
      endsAt: new Date(period.endsAt),
      total,
      available: total,
      reserved: 0,
      consumed: 0,
      released: 0,
      version: 1,
      createdAt: new Date(input.receipt.occurredAt),
      updatedAt: new Date(input.receipt.occurredAt)
    });
  }

  await transaction.insert(clientSubscriptionTransitionReceipts).values({
    transitionId: input.receipt.transitionId,
    subscriptionId: input.receipt.subscriptionId,
    contractId: input.receipt.contractId,
    relationshipId: input.receipt.relationshipId,
    journalEpochId: input.receipt.journalEpochId,
    subscriptionVersion: input.receipt.subscriptionVersion,
    state: input.receipt.state,
    entitlementState: input.receipt.entitlementState,
    entitlementScope: input.receipt.entitlementScope,
    primaryEventType: primaryEvent.eventType,
    slotEffect: input.receipt.slotEffect,
    periodId: input.receipt.period?.id ?? null,
    occurredAt: new Date(input.receipt.occurredAt)
  });

  const openPeriods = input.next.paidPeriods.filter(
    (period) => !input.next.endedPeriodIds.includes(period.id)
  );
  if (openPeriods.length > 2) {
    throw new Error("Client subscription transition produced more than one future period");
  }
  const terminalWithoutPeriodPointers =
    input.next.state === "ended" || input.next.state === "revoked";
  const currentPeriod = terminalWithoutPeriodPointers ? null : (openPeriods[0] ?? null);
  const futurePeriod = terminalWithoutPeriodPointers ? null : (openPeriods[1] ?? null);
  const [updated] = await transaction
    .update(clientSubscriptions)
    .set({
      state: input.next.state,
      version: input.next.version,
      cancellationEffectiveAt: input.next.cancellationEffectiveAt
        ? new Date(input.next.cancellationEffectiveAt)
        : null,
      currentPeriodId: currentPeriod?.id ?? null,
      futurePeriodId: futurePeriod?.id ?? null,
      updatedAt: new Date(input.receipt.occurredAt)
    })
    .where(
      and(
        eq(clientSubscriptions.id, input.current.id),
        eq(clientSubscriptions.version, input.current.version)
      )
    )
    .returning({ id: clientSubscriptions.id });
  if (!updated) throw new Error("Client subscription CAS changed inside locked transaction");

  await persistEntitlementProjection(transaction, input.receipt, randomUUID());

  for (const event of events) {
    await transaction.insert(clientSubscriptionLifecycleEvents).values({
      id: event.eventId,
      transitionId: input.receipt.transitionId,
      subscriptionId: input.next.id,
      contractId: input.next.contract.id,
      subscriptionVersion: input.next.version,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      occurredAt: new Date(event.occurredAt),
      data: event.data
    });
    await transaction.insert(outboxEvents).values({
      eventType: "client_subscription.lifecycle_event.dispatch_requested.v1",
      aggregateId: event.eventId,
      payload: {
        schemaVersion: "client-subscription-lifecycle-event-dispatch-request.v1",
        lifecycleEventId: event.eventId
      },
      availableAt: new Date(event.occurredAt),
      createdAt: new Date(event.occurredAt),
      updatedAt: new Date(event.occurredAt)
    });
  }

  if (input.receipt.slotEffect === "release") {
    const [released] = await transaction
      .update(clientSubscriptionSlots)
      .set({
        version: sql`${clientSubscriptionSlots.version} + 1`,
        currentSubscriptionId: null,
        updatedAt: sql`clock_timestamp()`
      })
      .where(
        and(
          eq(clientSubscriptionSlots.relationshipId, input.receipt.relationshipId),
          eq(clientSubscriptionSlots.productId, input.next.contract.productId),
          eq(clientSubscriptionSlots.currentSubscriptionId, input.next.id)
        )
      )
      .returning({ version: clientSubscriptionSlots.version });
    if (!released) throw new Error("Terminal subscription transition did not own its slot");
  }
}

export async function persistEntitlementProjection(
  transaction: ClientSubscriptionTransaction,
  receipt: ClientSubscriptionTransitionReceipt,
  entitlementId: string,
  expectedGrantVersions?: Readonly<Record<string, number>>
): Promise<ProjectClientEntitlementBatchOutcome> {
  const [existingApplication] = await transaction
    .select({ id: clientEntitlementTransitionApplications.id })
    .from(clientEntitlementTransitionApplications)
    .where(eq(clientEntitlementTransitionApplications.transitionId, receipt.transitionId))
    .limit(1);
  const currentRows = await transaction
    .select()
    .from(clientEntitlementGrants)
    .where(eq(clientEntitlementGrants.subscriptionId, receipt.subscriptionId))
    .orderBy(asc(clientEntitlementGrants.startsAt), asc(clientEntitlementGrants.id))
    .for("update");
  const current = currentRows.map(mapEntitlementGrant);
  const decision = projectClientEntitlementBatch(current, receipt, { entitlementId });
  if (existingApplication) return decision;
  if (decision.outcome !== "applied" && decision.outcome !== "idempotent") return decision;

  if (expectedGrantVersions) {
    for (const entitlement of current) {
      const expected = expectedGrantVersions[entitlement.periodId];
      if (expected !== undefined && expected !== entitlement.version) {
        return {
          outcome: "stale_transition",
          currentSubscriptionVersion: entitlement.sourceSubscriptionVersion
        };
      }
    }
  }

  const changed = decision.entitlements.filter((next) => {
    const before = current.find((candidate) => candidate.id === next.id);
    return !before || before.version !== next.version;
  });
  if (receipt.entitlementScope !== "none") {
    const applicationId = randomUUID();
    await transaction.insert(clientEntitlementTransitionApplications).values({
      id: applicationId,
      transitionId: receipt.transitionId,
      subscriptionId: receipt.subscriptionId,
      subscriptionVersion: receipt.subscriptionVersion,
      scope: receipt.entitlementScope,
      appliedAt: new Date(receipt.occurredAt)
    });
    for (const next of changed) {
      const before = current.find((candidate) => candidate.id === next.id) ?? null;
      if (before) {
        await transaction
          .update(clientEntitlementGrants)
          .set({
            state: next.state,
            version: next.version,
            sourceTransitionId: next.sourceTransitionId,
            sourceSubscriptionVersion: next.sourceSubscriptionVersion,
            updatedAt: new Date(receipt.occurredAt)
          })
          .where(
            and(
              eq(clientEntitlementGrants.id, next.id),
              eq(clientEntitlementGrants.version, before.version)
            )
          );
      } else {
        await transaction.insert(clientEntitlementGrants).values({
          id: next.id,
          subscriptionId: next.subscriptionId,
          contractId: next.contractId,
          relationshipId: next.relationshipId,
          journalEpochId: next.journalEpochId,
          periodId: next.periodId,
          capability: next.capability,
          startsAt: new Date(next.startsAt),
          endsAt: new Date(next.endsAt),
          state: next.state,
          version: next.version,
          sourceTransitionId: next.sourceTransitionId,
          sourceSubscriptionVersion: next.sourceSubscriptionVersion,
          createdAt: new Date(receipt.occurredAt),
          updatedAt: new Date(receipt.occurredAt)
        });
      }
      await transaction.insert(clientEntitlementTransitionEffects).values({
        applicationId,
        subscriptionId: receipt.subscriptionId,
        grantId: next.id,
        beforeVersion: before?.version ?? null,
        beforeState: before?.state ?? null,
        afterVersion: next.version,
        afterState: next.state
      });
    }
  }
  return decision;
}

export function mapEntitlementGrant(
  row: typeof clientEntitlementGrants.$inferSelect
): ClientEntitlement {
  if (row.capability !== "astro_diary") throw new Error("Unknown client entitlement capability");
  if (row.state !== "active" && row.state !== "ended" && row.state !== "revoked") {
    throw new Error("Unknown client entitlement state");
  }
  return {
    id: row.id,
    capability: row.capability,
    subscriptionId: row.subscriptionId,
    contractId: row.contractId,
    relationshipId: row.relationshipId,
    journalEpochId: row.journalEpochId,
    periodId: row.periodId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    state: row.state,
    sourceTransitionId: row.sourceTransitionId,
    sourceSubscriptionVersion: row.sourceSubscriptionVersion,
    version: row.version
  };
}

function assertAppliedTransition(input: {
  readonly current: ClientSubscription;
  readonly next: ClientSubscription;
  readonly receipt: ClientSubscriptionTransitionReceipt;
}): void {
  if (
    input.next.id !== input.current.id ||
    input.next.contract.id !== input.current.contract.id ||
    input.next.journalEpochId !== input.current.journalEpochId ||
    input.next.version !== input.current.version + 1 ||
    input.receipt.subscriptionId !== input.next.id ||
    input.receipt.contractId !== input.next.contract.id ||
    input.receipt.relationshipId !== input.next.contract.relationshipId ||
    input.receipt.journalEpochId !== input.next.journalEpochId ||
    input.receipt.subscriptionVersion !== input.next.version ||
    input.receipt.state !== input.next.state
  ) {
    throw new Error("Client subscription transition does not match locked head");
  }
}

function requireCaptureEvidence(value: string | null): string {
  if (value === null) throw new Error("Paid subscription period requires capture evidence");
  return value;
}
