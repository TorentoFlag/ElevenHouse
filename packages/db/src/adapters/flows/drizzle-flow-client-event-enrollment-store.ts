import { flowRunSnapshotV2Schema, type FlowRunSnapshotV2 } from "@elevenhouse/contracts";
import {
  FlowClientEventEnrollmentIntegrityError,
  normalizeFlowClientEvent,
  planFlowClientEventEnrollment,
  stableJson,
  type CanonicalJson,
  type FlowClientEventEnrollmentCandidate,
  type FlowClientEventEnrollmentPersistedRun,
  type FlowClientEventEnrollmentRequestedPayloadV1,
  type FlowClientEventEnrollmentResult,
  type FlowClientEventEnrollmentStore,
  type FlowNormalizedClientEventV1
} from "@elevenhouse/domain";
import { and, asc, eq, gt, lte, notInArray, or, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { clientAstrologerRelationships, clientLifecycleHistory } from "../../schema/clients";
import { orders } from "../../schema/finance";
import {
  flowActivationEpochs,
  flowExecutionTokens,
  flowRunEvents,
  flowRuns,
  flowRuntimeEvents,
  flowRuntimeOwnerSubjects,
  flows,
  flowVersions
} from "../../schema/flows";
import {
  platformTariffSubscriptions,
  platformTariffVersionCapabilities
} from "../../schema/platform-billing";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";

type FlowClientEventEnrollmentTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];
type RuntimeEventRow = typeof flowRuntimeEvents.$inferSelect;
type ClientSubject = {
  readonly ownerUserId: string;
  readonly clientUserId: string;
  readonly relationshipId: string;
};
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

const persistedOutcomeValues = ["enrolled", "no_match", "suppressed"] as const;
const terminalFlowRunStatuses = [
  "completed",
  "skipped",
  "failed_terminal",
  "suppressed",
  "expired",
  "canceled"
] as const;

export function createDrizzleFlowClientEventEnrollmentStore(
  database: ElevenHouseDatabase
): FlowClientEventEnrollmentStore {
  return {
    enrollClientEvent: (input) =>
      database.transaction(async (transaction) => {
        const subject = await resolveClientSubject(transaction, input.request);
        const normalized = normalizeClientEventRequest(input.request, subject);
        const existing = await findExistingEvent(transaction, normalized);
        if (existing) return replayExistingEvent(transaction, existing, normalized);

        const processedAt = await readDatabaseInstant(transaction);
        const candidates = await readActivationCandidates(transaction, normalized);
        const plans = candidates
          .map((candidate) => planFlowClientEventEnrollment({ event: normalized, candidate }))
          .filter((plan) => plan.status === "matched");
        const admittedPlans = [];
        for (const plan of plans) {
          if (await isPlanSuppressedByPolicy(transaction, normalized, plan)) continue;
          admittedPlans.push(plan);
        }
        if (admittedPlans.length === 0) {
          return persistOutcome(transaction, {
            normalized,
            processedAt,
            status: plans.length === 0 ? "no_match" : "suppressed",
            plans: [],
            authority: null
          });
        }

        const authority = await resolveExecutionAuthority(transaction, input.request, normalized);
        if (!authority) {
          return persistOutcome(transaction, {
            normalized,
            processedAt,
            status: "suppressed",
            plans: [],
            authority: null
          });
        }

        return persistOutcome(transaction, {
          normalized,
          processedAt,
          status: "enrolled",
          plans: admittedPlans,
          authority
        });
      })
  };
}

function normalizeClientEventRequest(
  request: FlowClientEventEnrollmentRequestedPayloadV1,
  subject: ClientSubject
): FlowNormalizedClientEventV1 {
  if (request.subjectId !== subject.clientUserId) throw invalidPayload();
  if (request.eventKind === "new_lead") {
    return normalizeFlowClientEvent({
      ownerUserId: subject.ownerUserId,
      relationshipId: subject.relationshipId,
      source: "clients",
      sourceEventId: request.sourceEventId,
      event: { eventKind: "new_lead", clientUserId: subject.clientUserId },
      occurrenceKey: request.occurrenceKey,
      occurredAtUtc: request.occurredAt,
      payloadSchemaVersion: 1,
      allowlistedPayload: {
        clientUserId: subject.clientUserId,
        relationshipId: subject.relationshipId
      },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.new-lead.v1",
      dedupeKey: request.sourceEventId
    });
  }
  if (request.eventKind === "free_product_received") {
    return normalizeFlowClientEvent({
      ownerUserId: subject.ownerUserId,
      relationshipId: subject.relationshipId,
      source: "product",
      sourceEventId: request.sourceEventId,
      event: {
        eventKind: "free_product_received",
        clientUserId: subject.clientUserId,
        productId: request.payload.productId
      },
      occurrenceKey: request.occurrenceKey,
      occurredAtUtc: request.occurredAt,
      payloadSchemaVersion: 1,
      allowlistedPayload: {
        clientUserId: subject.clientUserId,
        relationshipId: subject.relationshipId,
        receiptId: request.payload.receiptId,
        productId: request.payload.productId
      },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.free-product-received.v1",
      dedupeKey: request.sourceEventId
    });
  }
  if (request.eventKind === "product_purchased") {
    return normalizeFlowClientEvent({
      ownerUserId: subject.ownerUserId,
      relationshipId: subject.relationshipId,
      source: "finance",
      sourceEventId: request.sourceEventId,
      event: {
        eventKind: "product_purchased",
        clientUserId: subject.clientUserId,
        productId: request.payload.productId
      },
      occurrenceKey: request.occurrenceKey,
      occurredAtUtc: request.occurredAt,
      payloadSchemaVersion: 1,
      allowlistedPayload: {
        clientUserId: subject.clientUserId,
        relationshipId: subject.relationshipId,
        orderId: request.payload.orderId,
        productId: request.payload.productId
      },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.product-purchased.v1",
      dedupeKey: request.sourceEventId
    });
  }
  if (request.eventKind === "first_inbound_message") {
    return normalizeFlowClientEvent({
      ownerUserId: subject.ownerUserId,
      relationshipId: subject.relationshipId,
      source: "messaging",
      sourceEventId: request.sourceEventId,
      event: { eventKind: "first_inbound_message", clientUserId: subject.clientUserId },
      occurrenceKey: request.occurrenceKey,
      occurredAtUtc: request.occurredAt,
      payloadSchemaVersion: 1,
      allowlistedPayload: {
        clientUserId: subject.clientUserId,
        relationshipId: subject.relationshipId,
        messageId: request.payload.messageId
      },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.first-inbound-message.v1",
      dedupeKey: request.sourceEventId
    });
  }
  if (request.eventKind === "astro_event") {
    return normalizeFlowClientEvent({
      ownerUserId: subject.ownerUserId,
      relationshipId: subject.relationshipId,
      source: "astro_calendar",
      sourceEventId: request.sourceEventId,
      event: {
        eventKind: "astro_event",
        clientUserId: subject.clientUserId,
        eventCode: request.payload.eventCode
      },
      occurrenceKey: request.occurrenceKey,
      occurredAtUtc: request.occurredAt,
      payloadSchemaVersion: 1,
      allowlistedPayload: {
        clientUserId: subject.clientUserId,
        relationshipId: subject.relationshipId,
        astroEventId: request.payload.astroEventId,
        eventCode: request.payload.eventCode
      },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.astro-event.v1",
      dedupeKey: request.sourceEventId
    });
  }
  if (request.eventKind === "client_lifecycle_changed") {
    return normalizeFlowClientEvent({
      ownerUserId: subject.ownerUserId,
      relationshipId: subject.relationshipId,
      source: "clients",
      sourceEventId: request.sourceEventId,
      event: {
        eventKind: "client_lifecycle_changed",
        clientUserId: subject.clientUserId,
        fromStatus: request.payload.fromStatus,
        toStatus: request.payload.toStatus
      },
      occurrenceKey: request.occurrenceKey,
      occurredAtUtc: request.occurredAt,
      payloadSchemaVersion: 1,
      allowlistedPayload: {
        clientUserId: subject.clientUserId,
        relationshipId: subject.relationshipId,
        historyId: request.payload.historyId,
        fromStatus: request.payload.fromStatus,
        toStatus: request.payload.toStatus
      },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.client-lifecycle-changed.v1",
      dedupeKey: request.sourceEventId
    });
  }
  if (request.eventKind === "schedule_time") {
    return normalizeFlowClientEvent({
      ownerUserId: subject.ownerUserId,
      relationshipId: subject.relationshipId,
      source: "crm",
      sourceEventId: request.sourceEventId,
      event: {
        eventKind: "schedule_time",
        clientUserId: subject.clientUserId,
        scheduleKey: request.payload.scheduleKey
      },
      occurrenceKey: request.occurrenceKey,
      occurredAtUtc: request.occurredAt,
      payloadSchemaVersion: 1,
      allowlistedPayload: {
        clientUserId: subject.clientUserId,
        relationshipId: subject.relationshipId,
        scheduleOccurrenceId: request.payload.scheduleOccurrenceId,
        scheduleKey: request.payload.scheduleKey
      },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.schedule-time.v1",
      dedupeKey: request.sourceEventId
    });
  }
  if (request.eventKind === "review_received") {
    return normalizeFlowClientEvent({
      ownerUserId: subject.ownerUserId,
      relationshipId: subject.relationshipId,
      source: "crm",
      sourceEventId: request.sourceEventId,
      event: { eventKind: "review_received", clientUserId: subject.clientUserId },
      occurrenceKey: request.occurrenceKey,
      occurredAtUtc: request.occurredAt,
      payloadSchemaVersion: 1,
      allowlistedPayload: {
        clientUserId: subject.clientUserId,
        relationshipId: subject.relationshipId,
        reviewId: request.payload.reviewId
      },
      classification: "personal",
      redactionVersion: 1,
      retentionPolicyId: "flows.review-received.v1",
      dedupeKey: request.sourceEventId
    });
  }
  return normalizeFlowClientEvent({
    ownerUserId: subject.ownerUserId,
    relationshipId: subject.relationshipId,
    source: "order",
    sourceEventId: request.sourceEventId,
    event: {
      eventKind: "subscription_event",
      clientUserId: subject.clientUserId,
      eventType: request.payload.eventType
    },
    occurrenceKey: request.occurrenceKey,
    occurredAtUtc: request.occurredAt,
    payloadSchemaVersion: 1,
    allowlistedPayload: {
      clientUserId: subject.clientUserId,
      relationshipId: subject.relationshipId,
      subscriptionEventId: request.payload.subscriptionEventId,
      eventType: request.payload.eventType
    },
    classification: "personal",
    redactionVersion: 1,
    retentionPolicyId: "flows.subscription-event.v1",
    dedupeKey: request.sourceEventId
  });
}

async function resolveClientSubject(
  transaction: FlowClientEventEnrollmentTransaction,
  request: FlowClientEventEnrollmentRequestedPayloadV1
): Promise<ClientSubject> {
  if (request.eventKind === "product_purchased") {
    const rows = await transaction
      .select({
        ownerUserId: orders.astrologerUserId,
        clientUserId: orders.clientUserId,
        productId: orders.productId,
        status: orders.status,
        relationshipId: clientAstrologerRelationships.id
      })
      .from(orders)
      .innerJoin(
        clientAstrologerRelationships,
        and(
          eq(clientAstrologerRelationships.astrologerUserId, orders.astrologerUserId),
          eq(clientAstrologerRelationships.clientUserId, orders.clientUserId),
          eq(clientAstrologerRelationships.status, "active")
        )
      )
      .where(eq(orders.id, request.payload.orderId))
      .limit(2)
      .for("share", { of: orders });
    if (rows.length !== 1) throw invalidPayload();
    const row = rows[0]!;
    if (
      row.clientUserId !== request.subjectId ||
      row.productId !== request.payload.productId ||
      !["paid", "fulfilled", "partially_refunded"].includes(row.status)
    ) {
      throw invalidPayload();
    }
    return {
      ownerUserId: row.ownerUserId,
      clientUserId: row.clientUserId,
      relationshipId: row.relationshipId
    };
  }

  const relationshipId = request.payload.relationshipId;
  const rows = await transaction
    .select({
      ownerUserId: clientAstrologerRelationships.astrologerUserId,
      clientUserId: clientAstrologerRelationships.clientUserId,
      relationshipId: clientAstrologerRelationships.id
    })
    .from(clientAstrologerRelationships)
    .where(
      and(
        eq(clientAstrologerRelationships.id, relationshipId),
        eq(clientAstrologerRelationships.clientUserId, request.subjectId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .limit(2)
    .for("share", { of: clientAstrologerRelationships });
  if (rows.length !== 1) throw invalidPayload();

  if (request.eventKind === "client_lifecycle_changed") {
    const historyRows = await transaction
      .select({
        id: clientLifecycleHistory.id,
        beforeStatus: clientLifecycleHistory.beforeStatus,
        afterStatus: clientLifecycleHistory.afterStatus,
        occurredAt: clientLifecycleHistory.occurredAt
      })
      .from(clientLifecycleHistory)
      .where(
        and(
          eq(clientLifecycleHistory.id, request.payload.historyId),
          eq(clientLifecycleHistory.relationshipId, relationshipId)
        )
      )
      .limit(1)
      .for("share", { of: clientLifecycleHistory });
    const history = historyRows[0];
    if (
      !history ||
      history.beforeStatus !== request.payload.fromStatus ||
      history.afterStatus !== request.payload.toStatus ||
      history.occurredAt.toISOString() !== request.occurredAt
    ) {
      throw invalidPayload();
    }
  }

  return {
    ownerUserId: rows[0]!.ownerUserId,
    clientUserId: rows[0]!.clientUserId,
    relationshipId: rows[0]!.relationshipId
  };
}

async function readActivationCandidates(
  transaction: FlowClientEventEnrollmentTransaction,
  normalized: FlowNormalizedClientEventV1
): Promise<readonly FlowClientEventEnrollmentCandidate[]> {
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

async function isPlanSuppressedByPolicy(
  transaction: FlowClientEventEnrollmentTransaction,
  normalized: FlowNormalizedClientEventV1,
  plan: Extract<ReturnType<typeof planFlowClientEventEnrollment>, { readonly status: "matched" }>
): Promise<boolean> {
  if (plan.enrollmentPolicyKey === "each_occurrence") return false;
  const rows = await transaction
    .select({ id: flowRuns.id })
    .from(flowRuns)
    .where(
      and(
        eq(flowRuns.ownerUserId, normalized.ownerUserId),
        eq(flowRuns.flowId, plan.flowId),
        eq(flowRuns.triggerNodeId, plan.triggerNodeId),
        eq(flowRuns.enrollmentPolicyKey, plan.enrollmentPolicyKey),
        plan.enrollmentPolicyKey === "once_per_client"
          ? eq(flowRuns.occurrenceKey, normalized.event.clientUserId)
          : notInArray(flowRuns.status, [...terminalFlowRunStatuses]),
        sql`${flowRuns.snapshot}->'subject'->>'type' = 'client'`,
        sql`${flowRuns.snapshot}->'subject'->>'clientUserId' = ${normalized.event.clientUserId}`
      )
    )
    .limit(1)
    .for("share", { of: flowRuns });
  return rows.length > 0;
}

async function resolveExecutionAuthority(
  transaction: FlowClientEventEnrollmentTransaction,
  request: FlowClientEventEnrollmentRequestedPayloadV1,
  normalized: FlowNormalizedClientEventV1
): Promise<ExecutionAuthority | null> {
  if (request.eventKind === "product_purchased") {
    return { basis: "paid_order_obligation", referenceId: request.payload.orderId };
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
        eq(platformTariffSubscriptions.ownerUserId, normalized.ownerUserId),
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

async function persistOutcome(
  transaction: FlowClientEventEnrollmentTransaction,
  input: {
    readonly normalized: FlowNormalizedClientEventV1;
    readonly processedAt: Date;
    readonly status: FlowClientEventEnrollmentResult["status"];
    readonly plans: readonly Extract<
      ReturnType<typeof planFlowClientEventEnrollment>,
      { readonly status: "matched" }
    >[];
    readonly authority: ExecutionAuthority | null;
  }
): Promise<FlowClientEventEnrollmentResult> {
  const [insertedEvent] = await transaction
    .insert(flowRuntimeEvents)
    .values({
      ownerUserId: input.normalized.ownerUserId,
      source: input.normalized.source,
      sourceEventId: input.normalized.sourceEventId,
      dedupeKey: input.normalized.dedupeKey,
      eventKind: input.normalized.event.eventKind,
      subjectType: "client",
      subjectId: input.normalized.event.clientUserId,
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
    return { status: input.status, replayed: false, eventId: insertedEvent.id, runs: [] };
  }
  if (!input.authority || input.plans.length === 0) throw invalidAuthority();

  const runs: FlowClientEventEnrollmentPersistedRun[] = [];
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
    if (!run) throw provenanceConflict();

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
    if (!token) throw provenanceConflict();

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
        eventKind: input.normalized.event.eventKind,
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

  return { status: "enrolled", replayed: false, eventId: insertedEvent.id, runs };
}

async function findExistingEvent(
  transaction: FlowClientEventEnrollmentTransaction,
  normalized: FlowNormalizedClientEventV1
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
  transaction: FlowClientEventEnrollmentTransaction,
  existing: RuntimeEventRow,
  normalized: FlowNormalizedClientEventV1
): Promise<FlowClientEventEnrollmentResult> {
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
  if ((existing.ingestionOutcome === "enrolled") !== runs.length > 0) throw provenanceConflict();
  return { status: existing.ingestionOutcome, replayed: true, eventId: existing.id, runs };
}

function assertExistingEventMatches(
  existing: RuntimeEventRow,
  normalized: FlowNormalizedClientEventV1
): void {
  if (
    existing.ownerUserId !== normalized.ownerUserId ||
    existing.source !== normalized.source ||
    existing.sourceEventId !== normalized.sourceEventId ||
    existing.dedupeKey !== normalized.dedupeKey ||
    existing.eventKind !== normalized.event.eventKind ||
    existing.subjectType !== "client" ||
    existing.subjectId !== normalized.event.clientUserId ||
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

function createRunSnapshot(input: {
  readonly normalized: FlowNormalizedClientEventV1;
  readonly processedAt: Date;
  readonly plan: Extract<
    ReturnType<typeof planFlowClientEventEnrollment>,
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
      type: "client",
      clientUserId: input.normalized.event.clientUserId,
      relationshipId: input.normalized.relationshipId
    },
    executionAuthority: input.authority
  });
}

async function readDatabaseInstant(
  transaction: FlowClientEventEnrollmentTransaction
): Promise<Date> {
  const result = await transaction.execute<{ epochMilliseconds: string }>(sql`
    select (extract(epoch from clock_timestamp()) * 1000)::text as "epochMilliseconds"
  `);
  const instant = parseFlowDatabaseEpochMilliseconds(result.rows[0]?.epochMilliseconds);
  if (!instant) throw invalidPayload();
  return instant;
}

function isPersistedOutcome(value: unknown): value is FlowClientEventEnrollmentResult["status"] {
  return (persistedOutcomeValues as readonly unknown[]).includes(value);
}

function invalidPayload(): FlowClientEventEnrollmentIntegrityError {
  return new FlowClientEventEnrollmentIntegrityError(
    "FLOW_CLIENT_EVENT_ENROLLMENT_PAYLOAD_INVALID",
    "the client event enrollment request does not match authoritative source data"
  );
}

function invalidAuthority(): FlowClientEventEnrollmentIntegrityError {
  return new FlowClientEventEnrollmentIntegrityError(
    "FLOW_CLIENT_EVENT_ENROLLMENT_AUTHORITY_INVALID",
    "the client event execution authority is ambiguous or unavailable"
  );
}

function provenanceConflict(): FlowClientEventEnrollmentIntegrityError {
  return new FlowClientEventEnrollmentIntegrityError(
    "FLOW_CLIENT_EVENT_ENROLLMENT_PROVENANCE_CONFLICT",
    "the same source identity or occurrence was already stored with different canonical data"
  );
}
