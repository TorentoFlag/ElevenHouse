import {
  createBookingLifecycleEvent,
  FlowBookingLifecycleDeferredError,
  FlowBookingLifecycleIntegrityError,
  FlowBookingLifecycleRuntimeDeferredError,
  normalizeBookingConfirmedFlowLifecycleEvent,
  parseFlowRuntimeTraceSummary,
  planFlowBookingRescheduledWorkItem,
  planFlowBookingLifecycleTransition,
  resolveFlowWorkItemNodePolicy,
  resolvePinnedFlowExecutionNode,
  type BookingLifecycleEvent,
  type FlowBookingLifecycleHead,
  type FlowBookingLifecycleProcessingResult,
  type FlowBookingLifecycleReceiptIdentity,
  type FlowBookingLifecycleReceiptOutcome,
  type FlowBookingLifecycleStore
} from "@elevenhouse/domain";
import { and, asc, eq, gt, inArray, lte, notInArray, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowBookingLifecycleHeads,
  flowBookingLifecycleReceipts,
  flowExecutionAttempts,
  flowExecutionSignalWaits,
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowRuntimeEvents,
  flowVersions,
  flowWorkItems
} from "../../schema/flows";
import { bookingLifecycleEvents, bookings } from "../../schema/scheduling";
import {
  enrollNormalizedBookingConfirmedInTransaction,
  toFlowBookingEnrollmentSubject,
  type FlowBookingEnrollmentWorkerIdentity
} from "./drizzle-flow-booking-enrollment-store";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

type FlowBookingLifecycleTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];
type BookingLifecycleEventRow = typeof bookingLifecycleEvents.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;
type ReceiptRow = typeof flowBookingLifecycleReceipts.$inferSelect;
type TokenRow = typeof flowExecutionTokens.$inferSelect;

type AppliedEventSummary = {
  readonly appliedAt: Date;
  readonly outcome: FlowBookingLifecycleReceiptOutcome;
  readonly flowRuntimeEventId: string | null;
  readonly affectedRunCount: number;
  readonly affectedWorkItemCount: number;
  readonly preservedCompletedWorkItemCount: number;
};
type AppliedRuntimeMutationSummary = Omit<AppliedEventSummary, "appliedAt">;

const terminalRunStatuses = [
  "completed",
  "skipped",
  "failed_terminal",
  "suppressed",
  "expired",
  "canceled"
] as const;
const cancelableRunStatuses = [
  "pending",
  "running",
  "waiting",
  "approval_required",
  "failed_retryable"
] as const;
const cancelableTokenStates = [
  "runnable",
  "claimed",
  "waiting_timer",
  "waiting_signal",
  "waiting_work_item",
  "waiting_approval",
  "retry_scheduled"
] as const;
const receiptOutcomeValues = [
  "enrolled",
  "no_match",
  "late_unmatched",
  "subject_ineligible",
  "suppressed",
  "canceled",
  "rescheduled"
] as const;

export function createDrizzleFlowBookingLifecycleStore(
  database: ElevenHouseDatabase,
  workerIdentity: FlowBookingEnrollmentWorkerIdentity
): FlowBookingLifecycleStore {
  return {
    processBookingLifecycleEvent: (input) =>
      database.transaction((transaction) =>
        processBookingLifecycleEventInTransaction(transaction, workerIdentity, input)
      )
  };
}

async function processBookingLifecycleEventInTransaction(
  transaction: FlowBookingLifecycleTransaction,
  workerIdentity: FlowBookingEnrollmentWorkerIdentity,
  input: Parameters<FlowBookingLifecycleStore["processBookingLifecycleEvent"]>[0]
): Promise<FlowBookingLifecycleProcessingResult> {
  const [targetRow] = await transaction
    .select()
    .from(bookingLifecycleEvents)
    .where(eq(bookingLifecycleEvents.id, input.lifecycleEventId))
    .limit(1);
  if (!targetRow) {
    throw lifecycleIntegrity(
      "FLOW_BOOKING_LIFECYCLE_EVENT_UNAVAILABLE",
      "the referenced canonical Booking lifecycle event does not exist"
    );
  }
  const targetEvent = toBookingLifecycleEvent(targetRow);

  const [booking] = await transaction
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.id, targetEvent.bookingId),
        eq(bookings.ownerUserId, targetEvent.ownerUserId)
      )
    )
    .limit(1)
    .for("share", { of: bookings });
  if (!booking) {
    throw lifecycleIntegrity(
      "FLOW_BOOKING_LIFECYCLE_EVENT_UNAVAILABLE",
      "the lifecycle event Booking aggregate is unavailable"
    );
  }

  await transaction.execute(sql`
    select pg_advisory_xact_lock(
      hashtextextended('flow-booking-lifecycle:' || ${booking.id}::text, 0)
    )
  `);
  const [targetReceipt] = await transaction
    .select()
    .from(flowBookingLifecycleReceipts)
    .where(eq(flowBookingLifecycleReceipts.lifecycleEventId, targetEvent.id))
    .limit(1)
    .for("share", { of: flowBookingLifecycleReceipts });
  let head = await readLockedHead(transaction, booking.id);

  if (targetReceipt) {
    planFlowBookingLifecycleTransition({
      head,
      receipt: toReceiptIdentity(targetReceipt),
      event: targetEvent
    });
    if (!head || head.appliedRevision < targetReceipt.revision) {
      throw lifecycleIntegrity(
        "FLOW_BOOKING_LIFECYCLE_RECEIPT_CONFLICT",
        "the durable receipt is ahead of the Flow Booking lifecycle head"
      );
    }
    return toProcessingResult(targetReceipt, true);
  }
  if (head && targetEvent.revision <= head.appliedRevision) {
    planFlowBookingLifecycleTransition({ head, receipt: null, event: targetEvent });
  }
  if (targetEvent.revision > booking.lifecycleRevision) {
    throw new FlowBookingLifecycleDeferredError(
      (head?.appliedRevision ?? 0) + 1,
      targetEvent.revision
    );
  }

  const sourceRows = await transaction
    .select()
    .from(bookingLifecycleEvents)
    .where(
      and(
        eq(bookingLifecycleEvents.bookingId, booking.id),
        eq(bookingLifecycleEvents.ownerUserId, booking.ownerUserId),
        gt(bookingLifecycleEvents.revision, head?.appliedRevision ?? 0),
        lte(bookingLifecycleEvents.revision, booking.lifecycleRevision)
      )
    )
    .orderBy(asc(bookingLifecycleEvents.revision))
    .for("share", { of: bookingLifecycleEvents });
  const expectedCount = booking.lifecycleRevision - (head?.appliedRevision ?? 0);
  if (sourceRows.length !== expectedCount) {
    throw new FlowBookingLifecycleDeferredError(
      (head?.appliedRevision ?? 0) + 1,
      sourceRows[0]?.revision ?? booking.lifecycleRevision
    );
  }

  let targetResult: FlowBookingLifecycleProcessingResult | null = null;
  for (const sourceRow of sourceRows) {
    const event = toBookingLifecycleEvent(sourceRow);
    const [existingReceipt] = await transaction
      .select()
      .from(flowBookingLifecycleReceipts)
      .where(eq(flowBookingLifecycleReceipts.lifecycleEventId, event.id))
      .limit(1)
      .for("share", { of: flowBookingLifecycleReceipts });
    const plan = planFlowBookingLifecycleTransition({
      head,
      receipt: existingReceipt ? toReceiptIdentity(existingReceipt) : null,
      event
    });
    if (plan.kind === "replay") {
      throw lifecycleIntegrity(
        "FLOW_BOOKING_LIFECYCLE_RECEIPT_CONFLICT",
        "a receipt exists beyond the serialized Flow Booking lifecycle head"
      );
    }

    const requestedAppliedAt = await readDatabaseInstant(transaction);
    const summary = await applyLifecycleAction(transaction, workerIdentity, {
      booking,
      event,
      action: plan.action,
      appliedAt: requestedAppliedAt,
      latenessHorizonMs: input.latenessHorizonMs,
      futureSkewToleranceMs: input.futureSkewToleranceMs
    });
    const appliedAt = summary.appliedAt;
    const [receipt] = await transaction
      .insert(flowBookingLifecycleReceipts)
      .values({
        lifecycleEventId: event.id,
        bookingId: event.bookingId,
        ownerUserId: event.ownerUserId,
        revision: event.revision,
        eventKind: event.kind,
        canonicalDigest: event.canonicalDigest,
        outcome: summary.outcome,
        flowRuntimeEventId: summary.flowRuntimeEventId,
        affectedRunCount: summary.affectedRunCount,
        affectedWorkItemCount: summary.affectedWorkItemCount,
        preservedCompletedWorkItemCount: summary.preservedCompletedWorkItemCount,
        processedAt: appliedAt
      })
      .returning();
    if (!receipt) throw runtimeIntegrity("the Flow Booking lifecycle receipt was not persisted");

    await persistHead(transaction, head, plan.nextHead, appliedAt);
    head = plan.nextHead;
    if (event.id === targetEvent.id) targetResult = toProcessingResult(receipt, false);
  }

  if (!targetResult) {
    throw lifecycleIntegrity(
      "FLOW_BOOKING_LIFECYCLE_SOURCE_CHAIN_INVALID",
      "the requested lifecycle event was absent from the applied canonical chain"
    );
  }
  return targetResult;
}

async function applyLifecycleAction(
  transaction: FlowBookingLifecycleTransaction,
  workerIdentity: FlowBookingEnrollmentWorkerIdentity,
  input: {
    readonly booking: BookingRow;
    readonly event: BookingLifecycleEvent;
    readonly action: "enroll" | "reschedule" | "complete" | "cancel";
    readonly appliedAt: Date;
    readonly latenessHorizonMs: number;
    readonly futureSkewToleranceMs: number;
  }
): Promise<AppliedEventSummary> {
  if (input.action === "enroll") {
    const normalized = normalizeBookingConfirmedFlowLifecycleEvent({
      lifecycleEvent: input.event,
      subject: toFlowBookingEnrollmentSubject(input.booking)
    });
    const result = await enrollNormalizedBookingConfirmedInTransaction({
      transaction,
      booking: input.booking,
      normalized,
      workerIdentity,
      subjectEligible: input.booking.state === "confirmed",
      latenessHorizonMs: input.latenessHorizonMs,
      futureSkewToleranceMs: input.futureSkewToleranceMs
    });
    return {
      appliedAt: input.appliedAt,
      outcome: result.status,
      flowRuntimeEventId: result.eventId,
      affectedRunCount: result.runs.length,
      affectedWorkItemCount: 0,
      preservedCompletedWorkItemCount: 0
    };
  }
  if (input.action === "cancel") {
    return {
      appliedAt: input.appliedAt,
      ...(await cancelBookingFlowRuntime(transaction, input.event, input.appliedAt))
    };
  }
  if (input.action === "complete") {
    return {
      appliedAt: input.appliedAt,
      outcome: "completed",
      flowRuntimeEventId: null,
      affectedRunCount: 0,
      affectedWorkItemCount: 0,
      preservedCompletedWorkItemCount: 0
    };
  }
  return rescheduleBookingFlowRuntime(transaction, input.event);
}

async function rescheduleBookingFlowRuntime(
  transaction: FlowBookingLifecycleTransaction,
  event: BookingLifecycleEvent
): Promise<AppliedEventSummary> {
  if (!isRescheduledBookingLifecycleEvent(event)) {
    throw runtimeIntegrity("an accepted Booking reschedule requires exact before and after schedules");
  }

  const tokenRows = await transaction
    .select({ token: flowExecutionTokens })
    .from(flowExecutionTokens)
    .innerJoin(flowRuns, eq(flowRuns.id, flowExecutionTokens.flowRunId))
    .innerJoin(flowRuntimeEvents, eq(flowRuntimeEvents.id, flowRuns.runtimeEventId))
    .where(
      and(
        eq(flowExecutionTokens.ownerUserId, event.ownerUserId),
        eq(flowRuntimeEvents.source, "booking"),
        eq(flowRuntimeEvents.subjectType, "booking"),
        eq(flowRuntimeEvents.subjectId, event.bookingId)
      )
    )
    .orderBy(asc(flowExecutionTokens.id))
    .for("update", { of: flowExecutionTokens });
  const nonterminalRuns = await transaction
    .select({
      id: flowRuns.id,
      ownerUserId: flowRuns.ownerUserId,
      flowVersionId: flowRuns.flowVersionId,
      status: flowRuns.status,
      snapshot: flowRuns.snapshot,
      traceSequence: flowRuns.traceSequence,
      graph: flowVersions.graph,
      capabilityManifest: flowVersions.capabilityManifest
    })
    .from(flowRuns)
    .innerJoin(
      flowVersions,
      and(
        eq(flowVersions.id, flowRuns.flowVersionId),
        eq(flowVersions.ownerUserId, flowRuns.ownerUserId)
      )
    )
    .innerJoin(flowRuntimeEvents, eq(flowRuntimeEvents.id, flowRuns.runtimeEventId))
    .where(
      and(
        eq(flowRuns.ownerUserId, event.ownerUserId),
        eq(flowRuntimeEvents.source, "booking"),
        eq(flowRuntimeEvents.subjectType, "booking"),
        eq(flowRuntimeEvents.subjectId, event.bookingId),
        notInArray(flowRuns.status, [...terminalRunStatuses])
      )
    )
    .orderBy(asc(flowRuns.id))
    .for("update", { of: flowRuns });
  const tokenByRunId = new Map(tokenRows.map(({ token }) => [token.flowRunId, token] as const));
  if (nonterminalRuns.some((run) => !tokenByRunId.has(run.id))) {
    throw runtimeIntegrity("a nonterminal Booking-linked Flow run has no execution token");
  }

  const activeWorkItems =
    nonterminalRuns.length === 0
      ? []
      : await transaction
          .select()
          .from(flowWorkItems)
          .where(
            and(
              eq(flowWorkItems.ownerUserId, event.ownerUserId),
              inArray(
                flowWorkItems.flowRunId,
                nonterminalRuns.map((run) => run.id)
              ),
              inArray(flowWorkItems.status, ["pending", "in_progress", "snoozed"])
            )
          )
          .orderBy(asc(flowWorkItems.id))
          .for("update", { of: flowWorkItems });
  const activeWorkItemByRunId = new Map<string, (typeof activeWorkItems)[number]>();
  for (const workItem of activeWorkItems) {
    if (activeWorkItemByRunId.has(workItem.flowRunId)) {
      throw runtimeIntegrity("one Flow run has multiple active work items");
    }
    activeWorkItemByRunId.set(workItem.flowRunId, workItem);
  }

  for (const run of nonterminalRuns) {
    const token = tokenByRunId.get(run.id)!;
    const activeWorkItem = activeWorkItemByRunId.get(run.id) ?? null;
    if (token.state === "claimed") {
      throw new FlowBookingLifecycleRuntimeDeferredError(
        "a Booking-linked Flow token is currently claimed"
      );
    }
    if (token.state === "waiting_external" || token.state === "waiting_timer") {
      throw new FlowBookingLifecycleRuntimeDeferredError(
        "a Booking-linked Flow run has a schedule-sensitive wait that cannot yet be projected"
      );
    }
    if (
      !cancelableRunStatuses.includes(run.status as (typeof cancelableRunStatuses)[number]) ||
      ![
        "runnable",
        "waiting_signal",
        "waiting_work_item",
        "waiting_approval",
        "retry_scheduled"
      ].includes(token.state) ||
      (token.state === "waiting_work_item") !== (activeWorkItem !== null)
    ) {
      throw runtimeIntegrity("the Booking-linked Flow run has an incoherent reschedulable state");
    }
  }

  const appliedAt = await readDatabaseInstant(transaction);
  const preserved = await transaction
    .select({ count: sql<number>`count(*)::integer` })
    .from(flowWorkItems)
    .innerJoin(flowRuns, eq(flowRuns.id, flowWorkItems.flowRunId))
    .innerJoin(flowRuntimeEvents, eq(flowRuntimeEvents.id, flowRuns.runtimeEventId))
    .where(
      and(
        eq(flowRuns.ownerUserId, event.ownerUserId),
        eq(flowRuntimeEvents.source, "booking"),
        eq(flowRuntimeEvents.subjectType, "booking"),
        eq(flowRuntimeEvents.subjectId, event.bookingId),
        eq(flowWorkItems.status, "completed")
      )
    );

  let affectedWorkItemCount = 0;
  for (const run of nonterminalRuns) {
    const token = tokenByRunId.get(run.id)!;
    const activeWorkItem = activeWorkItemByRunId.get(run.id) ?? null;
    const node = resolvePinnedFlowExecutionNode({
      flowVersionId: run.flowVersionId,
      nodeId: token.nodeId,
      nodeKind: token.nodeKind as Parameters<typeof resolvePinnedFlowExecutionNode>[0]["nodeKind"],
      configSchemaVersion: token.configSchemaVersion,
      executorContractVersion: token.executorContractVersion,
      graph: run.graph,
      capabilityManifest: run.capabilityManifest
    });
    const workItemPlan = activeWorkItem
      ? planRescheduledWorkItem({
          runSnapshot: run.snapshot,
          event,
          node,
          workItem: activeWorkItem,
          appliedAt
        })
      : null;
    const summary = parseFlowRuntimeTraceSummary({
      schemaVersion: "flow-runtime-trace.v1",
      outcome: "rescheduled",
      nodeKind: node.kind,
      reasonCode: "FLOW_BOOKING_RESCHEDULED",
      resultCode: "FLOW_BOOKING_SCHEDULE_UPDATED",
      bookingId: event.bookingId,
      bookingLifecycleRevision: event.revision,
      previousStartAt: event.before.startAt,
      previousEndAt: event.before.endAt,
      previousTimeZone: event.before.timeZone,
      currentStartAt: event.after.startAt,
      currentEndAt: event.after.endAt,
      currentTimeZone: event.after.timeZone,
      workItemId: workItemPlan?.kind === "adjusted" ? activeWorkItem?.id ?? null : null,
      fromRevision:
        workItemPlan?.kind === "adjusted" ? activeWorkItem?.revision ?? null : null,
      toRevision: workItemPlan?.kind === "adjusted" ? workItemPlan.revision : null,
      previousWorkItemStatus:
        workItemPlan?.kind === "adjusted" ? activeWorkItem?.status ?? null : null,
      currentWorkItemStatus:
        workItemPlan?.kind === "adjusted" ? workItemPlan.status : null,
      previousDueAt:
        workItemPlan?.kind === "adjusted" ? activeWorkItem?.dueAt?.toISOString() ?? null : null,
      currentDueAt: workItemPlan?.kind === "adjusted" ? workItemPlan.dueAt : null,
      previousSnoozedUntil:
        workItemPlan?.kind === "adjusted"
          ? activeWorkItem?.snoozedUntil?.toISOString() ?? null
          : null,
      currentSnoozedUntil:
        workItemPlan?.kind === "adjusted" ? workItemPlan.snoozedUntil : null,
      snoozeAdjustment:
        workItemPlan?.kind === "adjusted" ? workItemPlan.snoozeAdjustment : null
    });

    const [updatedRun] = await transaction
      .update(flowRuns)
      .set({
        traceSequence: sql`${flowRuns.traceSequence} + 1`,
        updatedAt: appliedAt
      })
      .where(
        and(
          eq(flowRuns.id, run.id),
          eq(flowRuns.ownerUserId, event.ownerUserId),
          eq(flowRuns.flowVersionId, run.flowVersionId),
          eq(flowRuns.status, run.status),
          eq(flowRuns.traceSequence, run.traceSequence)
        )
      )
      .returning({ traceSequence: flowRuns.traceSequence });
    if (!updatedRun) throw runtimeIntegrity("the Booking reschedule run fence became stale");

    const [runEvent] = await transaction
      .insert(flowRunEvents)
      .values({
        ownerUserId: event.ownerUserId,
        flowRunId: run.id,
        sequence: updatedRun.traceSequence,
        eventType: "booking_rescheduled",
        nodeId: token.nodeId,
        attemptId: null,
        commandId: null,
        bookingLifecycleEventId: event.id,
        summary,
        occurredAt: appliedAt
      })
      .returning({ id: flowRunEvents.id });
    if (!runEvent) throw runtimeIntegrity("the Booking reschedule run event was not persisted");

    if (workItemPlan?.kind === "adjusted" && activeWorkItem) {
      const [updatedWorkItem] = await transaction
        .update(flowWorkItems)
        .set({
          status: workItemPlan.status,
          dueAt: new Date(workItemPlan.dueAt),
          availableAt: new Date(workItemPlan.availableAt),
          snoozedUntil:
            workItemPlan.snoozedUntil === null ? null : new Date(workItemPlan.snoozedUntil),
          dueBookingLifecycleRevision: event.revision,
          revision: workItemPlan.revision,
          lastCommandId: null,
          lastRunEventId: runEvent.id,
          updatedAt: appliedAt
        })
        .where(
          and(
            eq(flowWorkItems.id, activeWorkItem.id),
            eq(flowWorkItems.ownerUserId, event.ownerUserId),
            eq(flowWorkItems.flowRunId, run.id),
            eq(flowWorkItems.tokenId, token.id),
            eq(flowWorkItems.nodeActivationSequence, token.nodeActivationSequence),
            eq(flowWorkItems.status, activeWorkItem.status),
            eq(flowWorkItems.revision, activeWorkItem.revision),
            eq(
              flowWorkItems.dueBookingLifecycleRevision,
              activeWorkItem.dueBookingLifecycleRevision!
            )
          )
        )
        .returning({ id: flowWorkItems.id });
      if (!updatedWorkItem) {
        throw runtimeIntegrity("the Booking reschedule work-item fence became stale");
      }
      affectedWorkItemCount += 1;
    }
  }

  return {
    appliedAt,
    outcome: "rescheduled",
    flowRuntimeEventId: null,
    affectedRunCount: nonterminalRuns.length,
    affectedWorkItemCount,
    preservedCompletedWorkItemCount: preserved[0]?.count ?? 0
  };
}

function isRescheduledBookingLifecycleEvent(
  event: BookingLifecycleEvent
): event is BookingLifecycleEvent & {
  readonly kind: "rescheduled";
  readonly before: NonNullable<BookingLifecycleEvent["before"]>;
  readonly after: NonNullable<BookingLifecycleEvent["after"]>;
} {
  return event.kind === "rescheduled" && event.before !== null && event.after !== null;
}

function planRescheduledWorkItem(input: {
  readonly runSnapshot: unknown;
  readonly event: BookingLifecycleEvent & {
    readonly before: NonNullable<BookingLifecycleEvent["before"]>;
    readonly after: NonNullable<BookingLifecycleEvent["after"]>;
  };
  readonly node: ReturnType<typeof resolvePinnedFlowExecutionNode>;
  readonly workItem: typeof flowWorkItems.$inferSelect;
  readonly appliedAt: Date;
}) {
  if (input.node.kind !== "astrologer_work_item") {
    throw runtimeIntegrity("an active Flow work item is not pinned to its work-item node");
  }
  const policy = resolveFlowWorkItemNodePolicy(input.node).duePolicy;
  if (
    input.workItem.duePolicyKind !== policy.kind ||
    (policy.kind === "none"
      ? input.workItem.dueLeadTimeMinutes !== null ||
        input.workItem.dueBookingLifecycleRevision !== null
      : input.workItem.dueLeadTimeMinutes !== policy.leadTimeMinutes ||
        input.workItem.dueBookingLifecycleRevision !== input.event.revision - 1)
  ) {
    throw runtimeIntegrity("the active Flow work item deadline basis is incoherent");
  }
  return planFlowBookingRescheduledWorkItem({
    runSnapshot: input.runSnapshot,
    bookingId: input.event.bookingId,
    previousSchedule: input.event.before,
    currentSchedule: input.event.after,
    duePolicy: policy,
    workItem: {
      status: input.workItem.status as "pending" | "in_progress" | "snoozed",
      revision: input.workItem.revision,
      dueAt: input.workItem.dueAt?.toISOString() ?? null,
      availableAt: input.workItem.availableAt.toISOString(),
      snoozedUntil: input.workItem.snoozedUntil?.toISOString() ?? null
    },
    appliedAt: input.appliedAt.toISOString()
  });
}

async function cancelBookingFlowRuntime(
  transaction: FlowBookingLifecycleTransaction,
  event: BookingLifecycleEvent,
  canceledAt: Date
): Promise<AppliedRuntimeMutationSummary> {
  const tokenRows = await transaction
    .select({ token: flowExecutionTokens })
    .from(flowExecutionTokens)
    .innerJoin(flowRuns, eq(flowRuns.id, flowExecutionTokens.flowRunId))
    .innerJoin(flowRuntimeEvents, eq(flowRuntimeEvents.id, flowRuns.runtimeEventId))
    .where(
      and(
        eq(flowExecutionTokens.ownerUserId, event.ownerUserId),
        eq(flowRuntimeEvents.source, "booking"),
        eq(flowRuntimeEvents.subjectType, "booking"),
        eq(flowRuntimeEvents.subjectId, event.bookingId)
      )
    )
    .orderBy(asc(flowExecutionTokens.id))
    .for("update", { of: flowExecutionTokens });
  const nonterminalRuns = await transaction
    .select({ id: flowRuns.id })
    .from(flowRuns)
    .innerJoin(flowRuntimeEvents, eq(flowRuntimeEvents.id, flowRuns.runtimeEventId))
    .where(
      and(
        eq(flowRuns.ownerUserId, event.ownerUserId),
        eq(flowRuntimeEvents.source, "booking"),
        eq(flowRuntimeEvents.subjectType, "booking"),
        eq(flowRuntimeEvents.subjectId, event.bookingId),
        notInArray(flowRuns.status, [...terminalRunStatuses])
      )
    )
    .orderBy(asc(flowRuns.id))
    .for("update", { of: flowRuns });
  const tokenRunIds = new Set(tokenRows.map(({ token }) => token.flowRunId));
  if (nonterminalRuns.some((run) => !tokenRunIds.has(run.id))) {
    throw runtimeIntegrity("a nonterminal Booking-linked Flow run has no execution token");
  }
  const preserved = await transaction
    .select({ count: sql<number>`count(*)::integer` })
    .from(flowWorkItems)
    .innerJoin(flowRuns, eq(flowRuns.id, flowWorkItems.flowRunId))
    .innerJoin(flowRuntimeEvents, eq(flowRuntimeEvents.id, flowRuns.runtimeEventId))
    .where(
      and(
        eq(flowRuns.ownerUserId, event.ownerUserId),
        eq(flowRuntimeEvents.source, "booking"),
        eq(flowRuntimeEvents.subjectType, "booking"),
        eq(flowRuntimeEvents.subjectId, event.bookingId),
        eq(flowWorkItems.status, "completed")
      )
    );

  let affectedRunCount = 0;
  let affectedWorkItemCount = 0;
  for (const { token } of tokenRows) {
    const result = await cancelOneBookingRun(transaction, event, token, canceledAt);
    affectedRunCount += result.runCanceled ? 1 : 0;
    affectedWorkItemCount += result.workItemCanceled ? 1 : 0;
  }
  return {
    outcome: "canceled",
    flowRuntimeEventId: null,
    affectedRunCount,
    affectedWorkItemCount,
    preservedCompletedWorkItemCount: preserved[0]?.count ?? 0
  };
}

async function cancelOneBookingRun(
  transaction: FlowBookingLifecycleTransaction,
  event: BookingLifecycleEvent,
  token: TokenRow,
  canceledAt: Date
): Promise<{ readonly runCanceled: boolean; readonly workItemCanceled: boolean }> {
  const [run] = await transaction
    .select({
      id: flowRuns.id,
      ownerUserId: flowRuns.ownerUserId,
      flowVersionId: flowRuns.flowVersionId,
      status: flowRuns.status,
      traceSequence: flowRuns.traceSequence,
      graphSchemaVersion: flowVersions.graphSchemaVersion,
      graph: flowVersions.graph,
      capabilityManifest: flowVersions.capabilityManifest
    })
    .from(flowRuns)
    .innerJoin(
      flowVersions,
      and(
        eq(flowVersions.id, flowRuns.flowVersionId),
        eq(flowVersions.ownerUserId, flowRuns.ownerUserId)
      )
    )
    .where(
      and(
        eq(flowRuns.id, token.flowRunId),
        eq(flowRuns.ownerUserId, event.ownerUserId),
        eq(flowRuns.flowVersionId, token.flowVersionId)
      )
    )
    .limit(1)
    .for("update", { of: flowRuns });
  if (!run) throw runtimeIntegrity("a Booking-linked Flow run disappeared after token lock");

  const activeWorkItems = await transaction
    .select()
    .from(flowWorkItems)
    .where(
      and(
        eq(flowWorkItems.ownerUserId, event.ownerUserId),
        eq(flowWorkItems.flowRunId, run.id),
        inArray(flowWorkItems.status, ["pending", "in_progress", "snoozed"])
      )
    )
    .orderBy(asc(flowWorkItems.id))
    .limit(2)
    .for("update", { of: flowWorkItems });
  if (activeWorkItems.length > 1) {
    throw runtimeIntegrity("one Flow run has multiple active work items");
  }
  const activeWorkItem = activeWorkItems[0] ?? null;

  if (token.state === "waiting_external") {
    throw new FlowBookingLifecycleRuntimeDeferredError(
      "a Booking-linked Flow run is waiting for external-effect reconciliation"
    );
  }
  if (terminalRunStatuses.includes(run.status as (typeof terminalRunStatuses)[number])) {
    return { runCanceled: false, workItemCanceled: false };
  }
  if (
    !cancelableRunStatuses.includes(run.status as (typeof cancelableRunStatuses)[number]) ||
    !cancelableTokenStates.includes(token.state as (typeof cancelableTokenStates)[number]) ||
    (token.state === "waiting_work_item") !== (activeWorkItem !== null)
  ) {
    throw runtimeIntegrity("the Booking-linked Flow run has an incoherent cancelable state");
  }

  const nodeKind = resolvePinnedFlowExecutionNode({
    flowVersionId: run.flowVersionId,
    nodeId: token.nodeId,
    nodeKind: token.nodeKind as Parameters<typeof resolvePinnedFlowExecutionNode>[0]["nodeKind"],
    configSchemaVersion: token.configSchemaVersion,
    executorContractVersion: token.executorContractVersion,
    graph: run.graph,
    capabilityManifest: run.capabilityManifest
  }).kind;
  const summary = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "canceled",
    nodeKind,
    reasonCode: "FLOW_BOOKING_CANCELED",
    resultCode: "FLOW_RUN_CANCELED"
  });

  const [canceledToken] = await transaction
    .update(flowExecutionTokens)
    .set({
      state: "canceled",
      claimedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      fencingToken: sql`${flowExecutionTokens.fencingToken} + 1`,
      failureDisposition: null,
      failureReasonCode: null,
      terminalAt: canceledAt,
      quarantinedAt: null,
      updatedAt: canceledAt
    })
    .where(
      and(
        eq(flowExecutionTokens.id, token.id),
        eq(flowExecutionTokens.ownerUserId, event.ownerUserId),
        eq(flowExecutionTokens.flowRunId, run.id),
        eq(flowExecutionTokens.state, token.state),
        eq(flowExecutionTokens.fencingToken, token.fencingToken)
      )
    )
    .returning({ id: flowExecutionTokens.id });
  if (!canceledToken) throw runtimeIntegrity("the Booking cancellation token fence became stale");

  await transaction
    .update(flowExecutionSignalWaits)
    .set({ state: "canceled", canceledAt })
    .where(
      and(
        eq(flowExecutionSignalWaits.ownerUserId, event.ownerUserId),
        eq(flowExecutionSignalWaits.flowRunId, run.id),
        eq(flowExecutionSignalWaits.tokenId, token.id),
        eq(flowExecutionSignalWaits.nodeActivationSequence, token.nodeActivationSequence),
        eq(flowExecutionSignalWaits.state, "waiting")
      )
    );

  const attemptId =
    token.state === "claimed"
      ? await persistCanceledAttempt(transaction, token, summary, canceledAt)
      : null;
  const [canceledRun] = await transaction
    .update(flowRuns)
    .set({
      status: "canceled",
      traceSequence: sql`${flowRuns.traceSequence} + 1`,
      completedAt: canceledAt,
      updatedAt: canceledAt
    })
    .where(
      and(
        eq(flowRuns.id, run.id),
        eq(flowRuns.ownerUserId, event.ownerUserId),
        eq(flowRuns.flowVersionId, token.flowVersionId),
        inArray(flowRuns.status, [...cancelableRunStatuses])
      )
    )
    .returning({ traceSequence: flowRuns.traceSequence });
  if (!canceledRun) throw runtimeIntegrity("the Booking cancellation run fence became stale");

  const [runEvent] = await transaction
    .insert(flowRunEvents)
    .values({
      ownerUserId: event.ownerUserId,
      flowRunId: run.id,
      sequence: canceledRun.traceSequence,
      eventType: "run_canceled",
      nodeId: token.nodeId,
      attemptId,
      commandId: null,
      bookingLifecycleEventId: event.id,
      summary,
      occurredAt: canceledAt
    })
    .returning({ id: flowRunEvents.id });
  if (!runEvent) throw runtimeIntegrity("the Booking cancellation run event was not persisted");

  if (activeWorkItem) {
    const [canceledWorkItem] = await transaction
      .update(flowWorkItems)
      .set({
        status: "canceled",
        snoozedUntil: null,
        canceledAt,
        revision: activeWorkItem.revision + 1,
        lastCommandId: null,
        lastRunEventId: runEvent.id,
        updatedAt: canceledAt
      })
      .where(
        and(
          eq(flowWorkItems.id, activeWorkItem.id),
          eq(flowWorkItems.ownerUserId, event.ownerUserId),
          eq(flowWorkItems.flowRunId, run.id),
          eq(flowWorkItems.tokenId, token.id),
          eq(flowWorkItems.nodeActivationSequence, token.nodeActivationSequence),
          eq(flowWorkItems.revision, activeWorkItem.revision),
          eq(flowWorkItems.status, activeWorkItem.status)
        )
      )
      .returning({ id: flowWorkItems.id });
    if (!canceledWorkItem) {
      throw runtimeIntegrity("the Booking cancellation work-item fence became stale");
    }
  }
  return { runCanceled: true, workItemCanceled: activeWorkItem !== null };
}

async function persistCanceledAttempt(
  transaction: FlowBookingLifecycleTransaction,
  token: TokenRow,
  summary: ReturnType<typeof parseFlowRuntimeTraceSummary>,
  canceledAt: Date
): Promise<string> {
  if (
    !token.claimedAt ||
    !token.leaseOwner ||
    !token.leaseExpiresAt ||
    token.attemptCounter < 1n ||
    token.fencingToken < 1n
  ) {
    throw runtimeIntegrity("a claimed Flow token lacks its persisted attempt identity");
  }
  const [attempt] = await transaction
    .insert(flowExecutionAttempts)
    .values({
      ownerUserId: token.ownerUserId,
      flowRunId: token.flowRunId,
      tokenId: token.id,
      flowVersionId: token.flowVersionId,
      nodeId: token.nodeId,
      executorKey: token.executorKey,
      nodeActivationSequence: token.nodeActivationSequence,
      attemptNumber: token.attemptCounter,
      fencingToken: token.fencingToken,
      leaseOwner: token.leaseOwner,
      controlPolicyRevision: token.claimControlPolicyRevision,
      policyDigest: token.claimPolicyDigest,
      workerSessionId: token.claimWorkerSessionId,
      workerRegistrationDigest: token.claimWorkerRegistrationDigest,
      outcome: "canceled",
      resultCode: "FLOW_RUN_CANCELED",
      traceSummary: summary,
      startedAt: token.claimedAt,
      completedAt: canceledAt,
      createdAt: canceledAt
    })
    .returning({ id: flowExecutionAttempts.id });
  if (!attempt) throw runtimeIntegrity("the canceled Flow attempt was not persisted");
  return attempt.id;
}

async function persistHead(
  transaction: FlowBookingLifecycleTransaction,
  previous: FlowBookingLifecycleHead | null,
  next: FlowBookingLifecycleHead,
  appliedAt: Date
): Promise<void> {
  const schedule = next.schedule;
  if (!previous) {
    const [inserted] = await transaction
      .insert(flowBookingLifecycleHeads)
      .values({
        bookingId: next.bookingId,
        ownerUserId: next.ownerUserId,
        appliedRevision: next.appliedRevision,
        state: next.state,
        currentStartAt: schedule ? new Date(schedule.startAt) : null,
        currentEndAt: schedule ? new Date(schedule.endAt) : null,
        currentTimeZone: schedule?.timeZone ?? null,
        lastLifecycleEventId: next.lastLifecycleEventId,
        lastCanonicalDigest: next.lastCanonicalDigest,
        createdAt: appliedAt,
        updatedAt: appliedAt
      })
      .returning({ bookingId: flowBookingLifecycleHeads.bookingId });
    if (!inserted) throw runtimeIntegrity("the Flow Booking lifecycle head was not created");
    return;
  }
  const [updated] = await transaction
    .update(flowBookingLifecycleHeads)
    .set({
      appliedRevision: next.appliedRevision,
      state: next.state,
      currentStartAt: schedule ? new Date(schedule.startAt) : null,
      currentEndAt: schedule ? new Date(schedule.endAt) : null,
      currentTimeZone: schedule?.timeZone ?? null,
      lastLifecycleEventId: next.lastLifecycleEventId,
      lastCanonicalDigest: next.lastCanonicalDigest,
      updatedAt: appliedAt
    })
    .where(
      and(
        eq(flowBookingLifecycleHeads.bookingId, previous.bookingId),
        eq(flowBookingLifecycleHeads.ownerUserId, previous.ownerUserId),
        eq(flowBookingLifecycleHeads.appliedRevision, previous.appliedRevision),
        eq(flowBookingLifecycleHeads.lastLifecycleEventId, previous.lastLifecycleEventId)
      )
    )
    .returning({ bookingId: flowBookingLifecycleHeads.bookingId });
  if (!updated) throw runtimeIntegrity("the Flow Booking lifecycle head fence became stale");
}

async function readLockedHead(
  transaction: FlowBookingLifecycleTransaction,
  bookingId: string
): Promise<FlowBookingLifecycleHead | null> {
  const [row] = await transaction
    .select()
    .from(flowBookingLifecycleHeads)
    .where(eq(flowBookingLifecycleHeads.bookingId, bookingId))
    .limit(1)
    .for("update", { of: flowBookingLifecycleHeads });
  if (!row) return null;
  return {
    bookingId: row.bookingId,
    ownerUserId: row.ownerUserId,
    appliedRevision: row.appliedRevision,
    state: row.state as FlowBookingLifecycleHead["state"],
    schedule:
      (row.state === "confirmed" || row.state === "completed") &&
      row.currentStartAt &&
      row.currentEndAt &&
      row.currentTimeZone
        ? {
            startAt: row.currentStartAt.toISOString(),
            endAt: row.currentEndAt.toISOString(),
            timeZone: row.currentTimeZone
          }
        : null,
    lastLifecycleEventId: row.lastLifecycleEventId,
    lastCanonicalDigest: row.lastCanonicalDigest as `sha256:${string}`
  };
}

function toBookingLifecycleEvent(row: BookingLifecycleEventRow): BookingLifecycleEvent {
  const event = createBookingLifecycleEvent({
    id: row.id,
    bookingId: row.bookingId,
    ownerUserId: row.ownerUserId,
    revision: row.revision,
    kind: row.eventKind as BookingLifecycleEvent["kind"],
    actor:
      row.actorKind === "system"
        ? { kind: "system", userId: null }
        : {
            kind: row.actorKind as "astrologer" | "client",
            userId: requireLifecycleActorUserId(row.actorUserId)
          },
    reasonCode: row.reasonCode as BookingLifecycleEvent["reasonCode"],
    before:
      row.beforeStartAt && row.beforeEndAt && row.beforeTimeZone
        ? {
            startAt: row.beforeStartAt.toISOString(),
            endAt: row.beforeEndAt.toISOString(),
            timeZone: row.beforeTimeZone
          }
        : null,
    after:
      row.afterStartAt && row.afterEndAt && row.afterTimeZone
        ? {
            startAt: row.afterStartAt.toISOString(),
            endAt: row.afterEndAt.toISOString(),
            timeZone: row.afterTimeZone
          }
        : null,
    occurredAt: row.occurredAt.toISOString()
  });
  if (event.canonicalDigest !== row.canonicalDigest) {
    throw lifecycleIntegrity(
      "FLOW_BOOKING_LIFECYCLE_DIGEST_INVALID",
      "the canonical Booking event row does not match its persisted digest"
    );
  }
  return event;
}

function toReceiptIdentity(row: ReceiptRow): FlowBookingLifecycleReceiptIdentity {
  return {
    lifecycleEventId: row.lifecycleEventId,
    bookingId: row.bookingId,
    ownerUserId: row.ownerUserId,
    revision: row.revision,
    eventKind: row.eventKind as FlowBookingLifecycleReceiptIdentity["eventKind"],
    canonicalDigest: row.canonicalDigest as `sha256:${string}`
  };
}

function toProcessingResult(
  row: ReceiptRow,
  replayed: boolean
): FlowBookingLifecycleProcessingResult {
  if (!receiptOutcomeValues.includes(row.outcome as (typeof receiptOutcomeValues)[number])) {
    throw lifecycleIntegrity(
      "FLOW_BOOKING_LIFECYCLE_RECEIPT_CONFLICT",
      "the stored Flow Booking lifecycle outcome is unsupported"
    );
  }
  return {
    lifecycleEventId: row.lifecycleEventId,
    bookingId: row.bookingId,
    ownerUserId: row.ownerUserId,
    appliedRevision: row.revision,
    eventKind: row.eventKind as FlowBookingLifecycleProcessingResult["eventKind"],
    outcome: row.outcome as FlowBookingLifecycleReceiptOutcome,
    replayed,
    affectedRunCount: row.affectedRunCount,
    affectedWorkItemCount: row.affectedWorkItemCount,
    preservedCompletedWorkItemCount: row.preservedCompletedWorkItemCount
  };
}

async function readDatabaseInstant(transaction: FlowBookingLifecycleTransaction): Promise<Date> {
  const result = await transaction.execute<{ epochMilliseconds: string }>(sql`
    select (extract(epoch from clock_timestamp()) * 1000)::text as "epochMilliseconds"
  `);
  const instant = parseFlowDatabaseEpochMilliseconds(result.rows[0]?.epochMilliseconds);
  if (!instant) throw runtimeIntegrity("the PostgreSQL clock did not return a valid instant");
  return instant;
}

function lifecycleIntegrity(
  code: FlowBookingLifecycleIntegrityError["code"],
  message: string
): FlowBookingLifecycleIntegrityError {
  return new FlowBookingLifecycleIntegrityError(code, message);
}

function runtimeIntegrity(message: string): FlowBookingLifecycleIntegrityError {
  return lifecycleIntegrity("FLOW_BOOKING_LIFECYCLE_RUNTIME_STATE_INVALID", message);
}

function requireLifecycleActorUserId(actorUserId: string | null): string {
  if (!actorUserId) throw runtimeIntegrity("a user lifecycle actor lacks identity");
  return actorUserId;
}
