import {
  flowRunSnapshotV2Schema,
  type FlowRunSnapshotV2
} from "@elevenhouse/contracts";
import {
  evaluateBookingConfirmedFlowEventTiming,
  evaluateFlowRuntimeEnrollmentAdmission,
  FlowBookingEnrollmentDeferredError,
  FlowBookingEnrollmentIntegrityError,
  FlowRuntimeControlIntegrityError,
  normalizeBookingConfirmedFlowEnrollmentEvent,
  planBookingConfirmedFlowEnrollment,
  stableJson,
  type CanonicalJson,
  type FlowBookingEnrollmentCandidate,
  type FlowBookingEnrollmentPersistedRun,
  type FlowBookingEnrollmentResult,
  type FlowBookingEnrollmentStore,
  type FlowNormalizedBookingConfirmedEventV1,
  type FlowWorkerReadinessLease
} from "@elevenhouse/domain";
import { and, asc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { orders } from "../../schema/finance";
import {
  flowActivationEpochs,
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowRuntimeEvents,
  flowRuntimeOwnerSubjects,
  flowWorkerReadinessLeases,
  flowWorkerRegistrations,
  flows,
  flowVersions
} from "../../schema/flows";
import { platformTariffSubscriptions } from "../../schema/platform-billing";
import { platformTariffVersionCapabilities } from "../../schema/platform-billing/tariff-authority.schema";
import { bookings } from "../../schema/scheduling";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";
import { readCurrentFlowRuntimeControl } from "./drizzle-flow-runtime-control-reader";

type FlowBookingEnrollmentTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];
export type FlowBookingEnrollmentBookingRow = typeof bookings.$inferSelect;
type RuntimeEventRow = typeof flowRuntimeEvents.$inferSelect;

type ActivationCandidateRow = {
  readonly activationEpochId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly ownerUserId: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly rolloutPolicyRevision: number;
  readonly manifestDigest: string;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
};

type ExecutionAuthority = {
  readonly basis: "current_entitlement" | "paid_order_obligation";
  readonly referenceId: string;
};

const persistedOutcomeValues = [
  "enrolled",
  "no_match",
  "late_unmatched",
  "subject_ineligible",
  "suppressed"
] as const;

export type FlowBookingEnrollmentWorkerIdentity = {
  readonly instanceId: string;
  readonly sessionId: string;
};

export function createDrizzleFlowBookingEnrollmentStore(
  database: ElevenHouseDatabase,
  workerIdentity: FlowBookingEnrollmentWorkerIdentity
): FlowBookingEnrollmentStore {
  return {
    enrollBookingConfirmed: (input) =>
      database.transaction(async (transaction) => {
        const [booking] = await transaction
          .select()
          .from(bookings)
          .where(eq(bookings.id, input.request.subjectId))
          .limit(1)
          .for("share", { of: bookings });
        if (!booking) {
          throw new FlowBookingEnrollmentIntegrityError(
            "FLOW_BOOKING_ENROLLMENT_SUBJECT_UNAVAILABLE",
            "the referenced Booking aggregate does not exist"
          );
        }

        const normalized = normalizeBookingConfirmedFlowEnrollmentEvent({
          request: input.request,
          subject: toFlowBookingEnrollmentSubject(booking)
        });
        return enrollNormalizedBookingConfirmedInTransaction({
          transaction,
          booking,
          normalized,
          workerIdentity,
          subjectEligible: booking.state === "confirmed",
          latenessHorizonMs: input.latenessHorizonMs,
          futureSkewToleranceMs: input.futureSkewToleranceMs
        });
      })
  };
}

export async function enrollNormalizedBookingConfirmedInTransaction(input: {
  readonly transaction: FlowBookingEnrollmentTransaction;
  readonly booking: FlowBookingEnrollmentBookingRow;
  readonly normalized: FlowNormalizedBookingConfirmedEventV1;
  readonly workerIdentity: FlowBookingEnrollmentWorkerIdentity;
  readonly subjectEligible: boolean;
  readonly latenessHorizonMs: number;
  readonly futureSkewToleranceMs: number;
}): Promise<FlowBookingEnrollmentResult> {
  const existing = await findExistingEvent(input.transaction, input.normalized);
  if (existing) return replayExistingEvent(input.transaction, existing, input.normalized);

  const processedAt = await readDatabaseInstant(input.transaction);
  const timing = evaluateBookingConfirmedFlowEventTiming({
    occurredAtUtc: input.normalized.occurredAtUtc,
    receivedAtUtc: processedAt.toISOString(),
    latenessHorizonMs: input.latenessHorizonMs,
    futureSkewToleranceMs: input.futureSkewToleranceMs
  });

  if (timing === "late_unmatched") {
    return persistOutcome(input.transaction, {
      normalized: input.normalized,
      processedAt,
      status: "late_unmatched",
      plans: [],
      authority: null
    });
  }
  if (!input.subjectEligible) {
    return persistOutcome(input.transaction, {
      normalized: input.normalized,
      processedAt,
      status: "subject_ineligible",
      plans: [],
      authority: null
    });
  }

  const candidates = await readActivationCandidates(input.transaction, input.normalized);
  const plans = candidates
    .map((candidate) =>
      planBookingConfirmedFlowEnrollment({ event: input.normalized, candidate })
    )
    .filter((plan) => plan.status === "matched");
  if (plans.length === 0) {
    return persistOutcome(input.transaction, {
      normalized: input.normalized,
      processedAt,
      status: "no_match",
      plans: [],
      authority: null
    });
  }

  await assertRuntimeEnrollmentAdmitted(input.transaction, {
    workerIdentity: input.workerIdentity,
    ownerUserId: input.normalized.ownerUserId,
    requirementKeys: [...new Set(plans.flatMap((plan) => plan.requirementKeys))],
    checkedAt: processedAt
  });

  const authority = await resolveExecutionAuthority(
    input.transaction,
    input.booking,
    input.normalized
  );
  if (!authority) {
    return persistOutcome(input.transaction, {
      normalized: input.normalized,
      processedAt,
      status: "suppressed",
      plans: [],
      authority: null
    });
  }

  return persistOutcome(input.transaction, {
    normalized: input.normalized,
    processedAt,
    status: "enrolled",
    plans,
    authority
  });
}

async function assertRuntimeEnrollmentAdmitted(
  transaction: FlowBookingEnrollmentTransaction,
  input: {
    readonly workerIdentity: FlowBookingEnrollmentWorkerIdentity;
    readonly ownerUserId: string;
    readonly requirementKeys: readonly string[];
    readonly checkedAt: Date;
  }
): Promise<void> {
  try {
    const policy = await readCurrentFlowRuntimeControl(transaction);
    const ownerSubjects = await transaction
      .select({ ownerSubjectId: flowRuntimeOwnerSubjects.ownerSubjectId })
      .from(flowRuntimeOwnerSubjects)
      .where(
        and(
          eq(flowRuntimeOwnerSubjects.ownerUserId, input.ownerUserId),
          eq(flowRuntimeOwnerSubjects.state, "active")
        )
      )
      .limit(2)
      .for("share", { of: flowRuntimeOwnerSubjects });
    if (ownerSubjects.length !== 1) throw new FlowRuntimeControlIntegrityError();

    const workerLease = await readEnrollmentWorkerLease(
      transaction,
      input.workerIdentity
    );
    if (!workerLease) {
      throw new FlowBookingEnrollmentDeferredError(
        "FLOW_RUNTIME_ENROLLMENT_WORKER_NOT_READY"
      );
    }
    const admission = evaluateFlowRuntimeEnrollmentAdmission({
      policy,
      ownerSubjectId: ownerSubjects[0]!.ownerSubjectId,
      requirementKeys: input.requirementKeys,
      workerLease,
      checkedAt: input.checkedAt.toISOString()
    });
    if (admission.kind === "deferred") {
      throw new FlowBookingEnrollmentDeferredError(admission.reasonCode);
    }
  } catch (error) {
    if (error instanceof FlowBookingEnrollmentDeferredError) throw error;
    if (error instanceof FlowRuntimeControlIntegrityError) {
      throw new FlowBookingEnrollmentDeferredError(
        "FLOW_RUNTIME_ENROLLMENT_WORKER_NOT_READY"
      );
    }
    throw error;
  }
}

async function readEnrollmentWorkerLease(
  transaction: FlowBookingEnrollmentTransaction,
  identity: FlowBookingEnrollmentWorkerIdentity
): Promise<FlowWorkerReadinessLease | null> {
  const [row] = await transaction
    .select({
      state: flowWorkerReadinessLeases.state,
      policyRevision: flowWorkerReadinessLeases.policyRevision,
      readyUntil: flowWorkerReadinessLeases.readyUntil,
      roles: flowWorkerRegistrations.roles,
      maxRuntimeMode: flowWorkerRegistrations.maxRuntimeMode,
      maxCanaryOwnerSubjectIds: flowWorkerRegistrations.maxCanaryOwnerSubjectIds,
      requirementKeys: flowWorkerRegistrations.requirementKeys,
      registrationDigest: flowWorkerRegistrations.registrationDigest
    })
    .from(flowWorkerReadinessLeases)
    .innerJoin(
      flowWorkerRegistrations,
      eq(flowWorkerRegistrations.sessionId, flowWorkerReadinessLeases.sessionId)
    )
    .where(
      and(
        eq(flowWorkerReadinessLeases.instanceId, identity.instanceId),
        eq(flowWorkerReadinessLeases.sessionId, identity.sessionId)
      )
    )
    .limit(1)
    .for("share", { of: flowWorkerReadinessLeases });
  if (!row) return null;
  if (!/^sha256:[a-f0-9]{64}$/.test(row.registrationDigest)) {
    throw new FlowRuntimeControlIntegrityError();
  }
  return {
    schemaVersion: "flow-worker-readiness-lease.v1",
    instanceId: identity.instanceId,
    state: row.state as FlowWorkerReadinessLease["state"],
    policyRevision: row.policyRevision,
    roles: row.roles as FlowWorkerReadinessLease["roles"],
    maxRuntimeMode: row.maxRuntimeMode as FlowWorkerReadinessLease["maxRuntimeMode"],
    maxCanaryOwnerSubjectIds: row.maxCanaryOwnerSubjectIds,
    requirementKeys: row.requirementKeys,
    readyUntil: row.readyUntil.toISOString()
  };
}

async function persistOutcome(
  transaction: FlowBookingEnrollmentTransaction,
  input: {
    readonly normalized: FlowNormalizedBookingConfirmedEventV1;
    readonly processedAt: Date;
    readonly status: FlowBookingEnrollmentResult["status"];
    readonly plans: readonly Extract<
      ReturnType<typeof planBookingConfirmedFlowEnrollment>,
      { readonly status: "matched" }
    >[];
    readonly authority: ExecutionAuthority | null;
  }
): Promise<FlowBookingEnrollmentResult> {
  const [insertedEvent] = await transaction
    .insert(flowRuntimeEvents)
    .values({
      ownerUserId: input.normalized.ownerUserId,
      source: input.normalized.source,
      sourceEventId: input.normalized.sourceEventId,
      dedupeKey: input.normalized.dedupeKey,
      eventKind: input.normalized.eventKind,
      subjectType: input.normalized.subjectType,
      subjectId: input.normalized.subjectId,
      occurrenceKey: input.normalized.occurrenceKey,
      occurredAt: new Date(input.normalized.occurredAtUtc),
      payloadSchemaVersion: input.normalized.payloadSchemaVersion,
      payloadDigest: input.normalized.canonicalPayloadHash,
      payload: input.normalized.allowlistedPayload,
      classification: input.normalized.classification,
      redactionVersion: input.normalized.redactionVersion,
      retentionPolicyId: input.normalized.retentionPolicyId,
      ingestionOutcome: input.status,
      processedAt: input.processedAt,
      createdAt: input.processedAt
    })
    .onConflictDoNothing()
    .returning();
  if (!insertedEvent) {
    const existing = await findExistingEvent(transaction, input.normalized);
    if (!existing) throw provenanceConflict();
    return replayExistingEvent(transaction, existing, input.normalized);
  }

  if (input.status !== "enrolled") {
    return {
      status: input.status,
      replayed: false,
      eventId: insertedEvent.id,
      runs: []
    };
  }
  if (!input.authority || input.plans.length === 0) {
    throw new FlowBookingEnrollmentIntegrityError(
      "FLOW_BOOKING_ENROLLMENT_AUTHORITY_INVALID",
      "an enrolled event requires execution authority and at least one run plan"
    );
  }

  const runs: FlowBookingEnrollmentPersistedRun[] = [];
  for (const plan of input.plans) {
    const snapshot = createRunSnapshot({
      normalized: input.normalized,
      processedAt: input.processedAt,
      plan,
      authority: input.authority
    });
    const [run] = await transaction
      .insert(flowRuns)
      .values({
        ownerUserId: input.normalized.ownerUserId,
        flowId: plan.flowId,
        flowVersionId: plan.flowVersionId,
        runtimeEventId: insertedEvent.id,
        activationEpochId: plan.activationEpochId,
        triggerNodeId: plan.triggerNodeId,
        occurrenceKey: plan.occurrenceKey,
        enrollmentPolicyKey: plan.enrollmentPolicyKey,
        enrollmentPolicyRevision: plan.enrollmentPolicyRevision,
        executionAuthorityBasis: input.authority.basis,
        executionAuthorityRefId: input.authority.referenceId,
        status: "pending",
        snapshot,
        currentNodeId: plan.initialToken.nodeId,
        traceSequence: 1n,
        createdAt: input.processedAt,
        updatedAt: input.processedAt
      })
      .returning({ id: flowRuns.id });
    if (!run) throw new Error("Expected flow run insert");

    const [token] = await transaction
      .insert(flowExecutionTokens)
      .values({
        ownerUserId: input.normalized.ownerUserId,
        flowRunId: run.id,
        flowVersionId: plan.flowVersionId,
        nodeId: plan.initialToken.nodeId,
        nodeKind: plan.initialToken.nodeKind,
        configSchemaVersion: plan.initialToken.configSchemaVersion,
        executorContractVersion: plan.initialToken.executorContractVersion,
        executorKey: plan.initialToken.executorKey,
        state: "runnable",
        availableAt: input.processedAt,
        createdAt: input.processedAt,
        updatedAt: input.processedAt
      })
      .returning({ id: flowExecutionTokens.id });
    if (!token) throw new Error("Expected initial flow execution token insert");

    await transaction.insert(flowRunEvents).values({
      ownerUserId: input.normalized.ownerUserId,
      flowRunId: run.id,
      sequence: 1n,
      eventType: "run_enrolled",
      nodeId: plan.triggerNodeId,
      summary: {
        schemaVersion: "flow-enrollment-trace.v1",
        outcome: "enrolled",
        reasonCode: "FLOW_TRIGGER_MATCHED",
        resultCode: "FLOW_RUN_ENROLLED",
        eventKind: input.normalized.eventKind,
        activationEpochId: plan.activationEpochId,
        triggerNodeId: plan.triggerNodeId,
        targetNodeId: plan.initialToken.nodeId,
        targetNodeKind: plan.initialToken.nodeKind,
        enrollmentPolicyKey: plan.enrollmentPolicyKey,
        occurrenceKey: plan.occurrenceKey
      },
      occurredAt: input.processedAt
    });
    runs.push({
      runId: run.id,
      tokenId: token.id,
      flowId: plan.flowId,
      flowVersionId: plan.flowVersionId,
      activationEpochId: plan.activationEpochId
    });
  }

  return {
    status: "enrolled",
    replayed: false,
    eventId: insertedEvent.id,
    runs
  };
}

async function findExistingEvent(
  transaction: FlowBookingEnrollmentTransaction,
  normalized: FlowNormalizedBookingConfirmedEventV1
): Promise<RuntimeEventRow | null> {
  const rows = await transaction
    .select()
    .from(flowRuntimeEvents)
    .where(
      or(
        and(
          eq(flowRuntimeEvents.source, normalized.source),
          eq(flowRuntimeEvents.sourceEventId, normalized.sourceEventId)
        ),
        and(
          eq(flowRuntimeEvents.ownerUserId, normalized.ownerUserId),
          eq(flowRuntimeEvents.dedupeKey, normalized.dedupeKey)
        )
      )
    )
    .limit(2)
    .for("update", { of: flowRuntimeEvents });
  if (rows.length > 1) throw provenanceConflict();
  return rows[0] ?? null;
}

async function replayExistingEvent(
  transaction: FlowBookingEnrollmentTransaction,
  existing: RuntimeEventRow,
  normalized: FlowNormalizedBookingConfirmedEventV1
): Promise<FlowBookingEnrollmentResult> {
  assertExistingEventMatches(existing, normalized);
  if (!isPersistedOutcome(existing.ingestionOutcome)) throw provenanceConflict();

  const rows = await transaction
    .select({
      runId: flowRuns.id,
      tokenId: flowExecutionTokens.id,
      flowId: flowRuns.flowId,
      flowVersionId: flowRuns.flowVersionId,
      activationEpochId: flowRuns.activationEpochId
    })
    .from(flowRuns)
    .innerJoin(flowExecutionTokens, eq(flowExecutionTokens.flowRunId, flowRuns.id))
    .where(
      and(
        eq(flowRuns.ownerUserId, normalized.ownerUserId),
        eq(flowRuns.runtimeEventId, existing.id)
      )
    )
    .orderBy(asc(flowRuns.flowId));
  const runs = rows.map((row) => {
    if (!row.activationEpochId) throw provenanceConflict();
    return {
      runId: row.runId,
      tokenId: row.tokenId,
      flowId: row.flowId,
      flowVersionId: row.flowVersionId,
      activationEpochId: row.activationEpochId
    };
  });
  if ((existing.ingestionOutcome === "enrolled") !== (runs.length > 0)) {
    throw provenanceConflict();
  }
  return {
    status: existing.ingestionOutcome,
    replayed: true,
    eventId: existing.id,
    runs
  };
}

function assertExistingEventMatches(
  existing: RuntimeEventRow,
  normalized: FlowNormalizedBookingConfirmedEventV1
): void {
  if (
    existing.ownerUserId !== normalized.ownerUserId ||
    existing.source !== normalized.source ||
    existing.sourceEventId !== normalized.sourceEventId ||
    existing.dedupeKey !== normalized.dedupeKey ||
    existing.eventKind !== normalized.eventKind ||
    existing.subjectType !== normalized.subjectType ||
    existing.subjectId !== normalized.subjectId ||
    existing.occurrenceKey !== normalized.occurrenceKey ||
    existing.occurredAt.toISOString() !== normalized.occurredAtUtc ||
    existing.payloadSchemaVersion !== normalized.payloadSchemaVersion ||
    existing.payloadDigest !== normalized.canonicalPayloadHash ||
    existing.classification !== normalized.classification ||
    existing.redactionVersion !== normalized.redactionVersion ||
    existing.retentionPolicyId !== normalized.retentionPolicyId ||
    stableJson(existing.payload as CanonicalJson) !==
      stableJson(normalized.allowlistedPayload as unknown as CanonicalJson)
  ) {
    throw provenanceConflict();
  }
}

async function readActivationCandidates(
  transaction: FlowBookingEnrollmentTransaction,
  normalized: FlowNormalizedBookingConfirmedEventV1
): Promise<readonly FlowBookingEnrollmentCandidate[]> {
  const occurredAt = new Date(normalized.occurredAtUtc);
  const rows = await transaction
    .select({
      activationEpochId: flowActivationEpochs.id,
      flowId: flowActivationEpochs.flowId,
      flowVersionId: flowActivationEpochs.flowVersionId,
      ownerUserId: flows.ownerUserId,
      effectiveFrom: flowActivationEpochs.effectiveFrom,
      effectiveTo: flowActivationEpochs.effectiveTo,
      rolloutPolicyRevision: flowActivationEpochs.rolloutPolicyRevision,
      manifestDigest: flowActivationEpochs.manifestDigest,
      graph: flowVersions.graph,
      capabilityManifest: flowVersions.capabilityManifest
    })
    .from(flowActivationEpochs)
    .innerJoin(
      flowRuntimeOwnerSubjects,
      eq(flowRuntimeOwnerSubjects.ownerSubjectId, flowActivationEpochs.ownerSubjectId)
    )
    .innerJoin(flows, eq(flows.id, flowActivationEpochs.flowId))
    .innerJoin(
      flowVersions,
      and(
        eq(flowVersions.id, flowActivationEpochs.flowVersionId),
        eq(flowVersions.flowId, flowActivationEpochs.flowId),
        eq(flowVersions.ownerUserId, flows.ownerUserId)
      )
    )
    .where(
      and(
        eq(flowRuntimeOwnerSubjects.ownerUserId, normalized.ownerUserId),
        eq(flowRuntimeOwnerSubjects.state, "active"),
        eq(flows.ownerUserId, normalized.ownerUserId),
        lte(flowActivationEpochs.effectiveFrom, occurredAt),
        or(
          sql`${flowActivationEpochs.effectiveTo} is null`,
          gt(flowActivationEpochs.effectiveTo, occurredAt)
        )
      )
    )
    .orderBy(asc(flowActivationEpochs.flowId))
    .for("share", { of: flowActivationEpochs });

  return (rows as readonly ActivationCandidateRow[]).map((row) => ({
    activationEpochId: row.activationEpochId,
    flowId: row.flowId,
    flowVersionId: row.flowVersionId,
    ownerUserId: row.ownerUserId,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    rolloutPolicyRevision: row.rolloutPolicyRevision,
    manifestDigest: row.manifestDigest as `sha256:${string}`,
    graph: row.graph,
    capabilityManifest: row.capabilityManifest
  }));
}

async function resolveExecutionAuthority(
  transaction: FlowBookingEnrollmentTransaction,
  booking: FlowBookingEnrollmentBookingRow,
  normalized: FlowNormalizedBookingConfirmedEventV1
): Promise<ExecutionAuthority | null> {
  if (booking.source === "client_paid") {
    const rows = await transaction
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.bookingId, booking.id),
          eq(orders.astrologerUserId, booking.ownerUserId),
          eq(orders.clientUserId, booking.clientUserId),
          eq(orders.productId, booking.productId),
          inArray(orders.status, ["paid", "fulfilled", "partially_refunded"])
        )
      )
      .limit(2)
      .for("share", { of: orders });
    if (rows.length > 1) throw invalidAuthority();
    return rows[0] ? { basis: "paid_order_obligation", referenceId: rows[0].id } : null;
  }

  const occurredAt = new Date(normalized.occurredAtUtc);
  const rows = await transaction
    .select({ id: platformTariffSubscriptions.id })
    .from(platformTariffSubscriptions)
    .innerJoin(
      platformTariffVersionCapabilities,
      and(
        eq(
          platformTariffVersionCapabilities.tariffSeriesId,
          platformTariffSubscriptions.tariffSeriesId
        ),
        eq(
          platformTariffVersionCapabilities.tariffVersion,
          platformTariffSubscriptions.tariffVersion
        )
      )
    )
    .where(
      and(
        eq(platformTariffSubscriptions.ownerUserId, booking.ownerUserId),
        eq(platformTariffSubscriptions.state, "active"),
        lte(platformTariffSubscriptions.startsAt, occurredAt),
        gt(platformTariffSubscriptions.endsAt, occurredAt),
        eq(platformTariffVersionCapabilities.capability, "funnels")
      )
    )
    .limit(2)
    .for("share", { of: platformTariffSubscriptions });
  if (rows.length > 1) throw invalidAuthority();
  return rows[0] ? { basis: "current_entitlement", referenceId: rows[0].id } : null;
}

function createRunSnapshot(input: {
  readonly normalized: FlowNormalizedBookingConfirmedEventV1;
  readonly processedAt: Date;
  readonly plan: Extract<
    ReturnType<typeof planBookingConfirmedFlowEnrollment>,
    { readonly status: "matched" }
  >;
  readonly authority: ExecutionAuthority;
}): FlowRunSnapshotV2 {
  return flowRunSnapshotV2Schema.parse({
    schemaVersion: "flow-run-snapshot.v2",
    enrollment: {
      activationEpochId: input.plan.activationEpochId,
      triggerNodeId: input.plan.triggerNodeId,
      occurrenceKey: input.plan.occurrenceKey,
      policyKey: input.plan.enrollmentPolicyKey,
      policyRevision: input.plan.enrollmentPolicyRevision,
      rolloutPolicyRevision: input.plan.rolloutPolicyRevision,
      eventOccurredAt: input.normalized.occurredAtUtc,
      enrolledAt: input.processedAt.toISOString()
    },
    subject: {
      type: "booking",
      bookingId: input.normalized.allowlistedPayload.bookingId,
      clientUserId: input.normalized.allowlistedPayload.clientUserId,
      productId: input.normalized.allowlistedPayload.productId,
      startAt: input.normalized.allowlistedPayload.startAt,
      endAt: input.normalized.allowlistedPayload.endAt
    },
    executionAuthority: {
      basis: input.authority.basis,
      referenceId: input.authority.referenceId
    }
  });
}

export function toFlowBookingEnrollmentSubject(row: FlowBookingEnrollmentBookingRow) {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    clientUserId: row.clientUserId,
    productId: row.productId,
    state: row.state as Parameters<
      typeof normalizeBookingConfirmedFlowEnrollmentEvent
    >[0]["subject"]["state"],
    source: row.source as Parameters<
      typeof normalizeBookingConfirmedFlowEnrollmentEvent
    >[0]["subject"]["source"],
    startAt: row.serviceStartAt.toISOString(),
    endAt: row.serviceEndAt.toISOString(),
    timeZone: row.timeZoneSnapshot
  };
}

async function readDatabaseInstant(transaction: FlowBookingEnrollmentTransaction): Promise<Date> {
  const result = await transaction.execute<{ epochMilliseconds: string }>(sql`
    select (extract(epoch from clock_timestamp()) * 1000)::text as "epochMilliseconds"
  `);
  const instant = parseFlowDatabaseEpochMilliseconds(result.rows[0]?.epochMilliseconds);
  if (!instant) {
    throw new FlowBookingEnrollmentIntegrityError(
      "FLOW_BOOKING_ENROLLMENT_EVENT_TIME_INVALID",
      "the PostgreSQL clock did not return a valid instant"
    );
  }
  return instant;
}

function isPersistedOutcome(value: unknown): value is FlowBookingEnrollmentResult["status"] {
  return (persistedOutcomeValues as readonly unknown[]).includes(value);
}

function provenanceConflict(): FlowBookingEnrollmentIntegrityError {
  return new FlowBookingEnrollmentIntegrityError(
    "FLOW_BOOKING_ENROLLMENT_EVENT_PROVENANCE_CONFLICT",
    "the same source identity or occurrence was already stored with different canonical data"
  );
}

function invalidAuthority(): FlowBookingEnrollmentIntegrityError {
  return new FlowBookingEnrollmentIntegrityError(
    "FLOW_BOOKING_ENROLLMENT_AUTHORITY_INVALID",
    "the Booking execution authority is ambiguous or inconsistent"
  );
}
