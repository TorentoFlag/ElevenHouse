import { flowRunSnapshotV2Schema, type FlowRunSnapshotV2 } from "@elevenhouse/contracts";
import {
  FlowManualClientEnrollmentIdempotencyConflictError,
  FlowManualClientEnrollmentIntegrityError,
  FlowManualClientEnrollmentSubjectUnavailableError,
  normalizeManualClientFlowEnrollmentEvent,
  planManualClientFlowEnrollment,
  stableJson,
  type CanonicalJson,
  type FlowManualClientEnrollmentCandidate,
  type FlowManualClientEnrollmentPersistedRun,
  type FlowManualClientEnrollmentResult,
  type FlowManualClientEnrollmentStore,
  type FlowNormalizedManualClientEventV1
} from "@elevenhouse/domain";
import { and, asc, eq, gt, lte, or, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { clientAstrologerRelationships } from "../../schema/clients";
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

type FlowManualClientEnrollmentTransaction = Parameters<
  Parameters<ElevenHouseDatabase["transaction"]>[0]
>[0];
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
  readonly basis: "current_entitlement";
  readonly referenceId: string;
};

const persistedOutcomeValues = ["enrolled", "no_match", "suppressed"] as const;

/**
 * Direct astrologer commands are intentionally persisted through the same immutable
 * runtime-event/run/token lineage as asynchronous booking enrollment. The browser
 * identifies a client; the relationship and entitlement are authoritative DB facts.
 */
export function createDrizzleFlowManualClientEnrollmentStore(
  database: ElevenHouseDatabase
): FlowManualClientEnrollmentStore {
  return Object.freeze({
    enrollManualClient: (input) =>
      database.transaction(async (transaction) => {
        const relationship = await readActiveRelationship(transaction, input);
        const processedAt = await readDatabaseInstant(transaction);
        const normalized = normalizeManualClientFlowEnrollmentEvent({
          ownerUserId: input.ownerUserId,
          flowId: input.flowId,
          client: {
            userId: input.clientUserId,
            relationshipId: relationship.id
          },
          idempotencyKey: input.idempotencyKey,
          occurredAt: processedAt.toISOString()
        });

        const existing = await findExistingEvent(transaction, normalized);
        if (existing) return replayExistingEvent(transaction, existing, normalized);

        const candidate = await readActiveCandidate(transaction, normalized, input.flowId, processedAt);
        if (!candidate || !isManualClientCandidate(candidate)) {
          return persistOutcome(transaction, {
            normalized,
            processedAt,
            status: "no_match",
            plan: null,
            authority: null
          });
        }

        const plan = planManualClientFlowEnrollment({ event: normalized, candidate });
        const authority = await resolveCurrentEntitlement(
          transaction,
          normalized.ownerUserId,
          processedAt
        );
        if (!authority) {
          return persistOutcome(transaction, {
            normalized,
            processedAt,
            status: "suppressed",
            plan: null,
            authority: null
          });
        }

        return persistOutcome(transaction, {
          normalized,
          processedAt,
          status: "enrolled",
          plan,
          authority
        });
      })
  });
}

async function readActiveRelationship(
  transaction: FlowManualClientEnrollmentTransaction,
  input: {
    readonly ownerUserId: string;
    readonly clientUserId: string;
  }
): Promise<{ readonly id: string }> {
  const rows = await transaction
    .select({ id: clientAstrologerRelationships.id })
    .from(clientAstrologerRelationships)
    .where(
      and(
        eq(clientAstrologerRelationships.astrologerUserId, input.ownerUserId),
        eq(clientAstrologerRelationships.clientUserId, input.clientUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .limit(2)
    .for("share", { of: clientAstrologerRelationships });
  if (rows.length !== 1) throw new FlowManualClientEnrollmentSubjectUnavailableError();
  return rows[0]!;
}

async function readActiveCandidate(
  transaction: FlowManualClientEnrollmentTransaction,
  normalized: FlowNormalizedManualClientEventV1,
  flowId: string,
  occurredAt: Date
): Promise<FlowManualClientEnrollmentCandidate | null> {
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
        eq(flowActivationEpochs.flowId, flowId),
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
    .limit(2)
    .for("share", { of: flowActivationEpochs });
  if (rows.length > 1) {
    throw new FlowManualClientEnrollmentIntegrityError(
      "multiple active enrollment epochs exist for one Flow"
    );
  }
  const row = rows[0] as ActivationCandidateRow | undefined;
  return row
    ? {
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
      }
    : null;
}

function isManualClientCandidate(candidate: FlowManualClientEnrollmentCandidate): boolean {
  const manifest = candidate.capabilityManifest as { triggerMatcher?: { kind?: unknown } };
  return manifest.triggerMatcher?.kind === "manual_client";
}

async function resolveCurrentEntitlement(
  transaction: FlowManualClientEnrollmentTransaction,
  ownerUserId: string,
  occurredAt: Date
): Promise<ExecutionAuthority | null> {
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
        eq(platformTariffSubscriptions.ownerUserId, ownerUserId),
        eq(platformTariffSubscriptions.state, "active"),
        lte(platformTariffSubscriptions.startsAt, occurredAt),
        gt(platformTariffSubscriptions.endsAt, occurredAt),
        eq(platformTariffVersionCapabilities.capability, "funnels")
      )
    )
    .limit(2)
    .for("share", { of: platformTariffSubscriptions });
  if (rows.length > 1) {
    throw new FlowManualClientEnrollmentIntegrityError(
      "more than one current funnel entitlement exists for the owner"
    );
  }
  return rows[0] ? { basis: "current_entitlement", referenceId: rows[0].id } : null;
}

async function persistOutcome(
  transaction: FlowManualClientEnrollmentTransaction,
  input: {
    readonly normalized: FlowNormalizedManualClientEventV1;
    readonly processedAt: Date;
    readonly status: FlowManualClientEnrollmentResult["status"];
    readonly plan: ReturnType<typeof planManualClientFlowEnrollment> | null;
    readonly authority: ExecutionAuthority | null;
  }
): Promise<FlowManualClientEnrollmentResult> {
  const [event] = await transaction
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
  if (!event) {
    const existing = await findExistingEvent(transaction, input.normalized);
    if (!existing) throw new FlowManualClientEnrollmentIdempotencyConflictError();
    return replayExistingEvent(transaction, existing, input.normalized);
  }
  if (input.status !== "enrolled") {
    return { status: input.status, replayed: false, eventId: event.id, runs: [] };
  }
  if (!input.plan || !input.authority) {
    throw new FlowManualClientEnrollmentIntegrityError(
      "an enrolled manual client event requires an authority and a run plan"
    );
  }

  const snapshot = createRunSnapshot({
    normalized: input.normalized,
    processedAt: input.processedAt,
    plan: input.plan,
    authority: input.authority
  });
  const [run] = await transaction
    .insert(flowRuns)
    .values({
      ownerUserId: input.normalized.ownerUserId,
      flowId: input.plan.flowId,
      flowVersionId: input.plan.flowVersionId,
      runtimeEventId: event.id,
      activationEpochId: input.plan.activationEpochId,
      triggerNodeId: input.plan.triggerNodeId,
      occurrenceKey: input.plan.occurrenceKey,
      enrollmentPolicyKey: input.plan.enrollmentPolicyKey,
      enrollmentPolicyRevision: input.plan.enrollmentPolicyRevision,
      executionAuthorityBasis: input.authority.basis,
      executionAuthorityRefId: input.authority.referenceId,
      status: "pending",
      snapshot,
      currentNodeId: input.plan.initialToken.nodeId,
      traceSequence: 1n,
      createdAt: input.processedAt,
      updatedAt: input.processedAt
    })
    .returning({ id: flowRuns.id });
  if (!run) throw new FlowManualClientEnrollmentIntegrityError("the Flow run was not persisted");
  const [token] = await transaction
    .insert(flowExecutionTokens)
    .values({
      ownerUserId: input.normalized.ownerUserId,
      flowRunId: run.id,
      flowVersionId: input.plan.flowVersionId,
      nodeId: input.plan.initialToken.nodeId,
      nodeKind: input.plan.initialToken.nodeKind,
      configSchemaVersion: input.plan.initialToken.configSchemaVersion,
      executorContractVersion: input.plan.initialToken.executorContractVersion,
      executorKey: input.plan.initialToken.executorKey,
      state: "runnable",
      availableAt: input.processedAt,
      createdAt: input.processedAt,
      updatedAt: input.processedAt
    })
    .returning({ id: flowExecutionTokens.id });
  if (!token) throw new FlowManualClientEnrollmentIntegrityError("the first token was not persisted");
  await transaction.insert(flowRunEvents).values({
    ownerUserId: input.normalized.ownerUserId,
    flowRunId: run.id,
    sequence: 1n,
    eventType: "run_enrolled",
    nodeId: input.plan.triggerNodeId,
    summary: {
      schemaVersion: "flow-enrollment-trace.v1",
      outcome: "enrolled",
      reasonCode: "FLOW_TRIGGER_MATCHED",
      resultCode: "FLOW_RUN_ENROLLED",
      eventKind: input.normalized.eventKind,
      activationEpochId: input.plan.activationEpochId,
      triggerNodeId: input.plan.triggerNodeId,
      targetNodeId: input.plan.initialToken.nodeId,
      targetNodeKind: input.plan.initialToken.nodeKind,
      enrollmentPolicyKey: input.plan.enrollmentPolicyKey,
      occurrenceKey: input.plan.occurrenceKey
    },
    occurredAt: input.processedAt
  });
  return {
    status: "enrolled",
    replayed: false,
    eventId: event.id,
    runs: [
      {
        runId: run.id,
        tokenId: token.id,
        flowId: input.plan.flowId,
        flowVersionId: input.plan.flowVersionId,
        activationEpochId: input.plan.activationEpochId
      }
    ]
  };
}

async function findExistingEvent(
  transaction: FlowManualClientEnrollmentTransaction,
  normalized: FlowNormalizedManualClientEventV1
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
  if (rows.length > 1) throw new FlowManualClientEnrollmentIdempotencyConflictError();
  return rows[0] ?? null;
}

async function replayExistingEvent(
  transaction: FlowManualClientEnrollmentTransaction,
  existing: RuntimeEventRow,
  normalized: FlowNormalizedManualClientEventV1
): Promise<FlowManualClientEnrollmentResult> {
  assertExistingEventMatches(existing, normalized);
  if (!isPersistedOutcome(existing.ingestionOutcome)) {
    throw new FlowManualClientEnrollmentIdempotencyConflictError();
  }
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
    .orderBy(asc(flowRuns.id));
  const runs: FlowManualClientEnrollmentPersistedRun[] = rows.map((row) => {
    if (!row.activationEpochId) throw new FlowManualClientEnrollmentIdempotencyConflictError();
    return {
      runId: row.runId,
      tokenId: row.tokenId,
      flowId: row.flowId,
      flowVersionId: row.flowVersionId,
      activationEpochId: row.activationEpochId
    };
  });
  if ((existing.ingestionOutcome === "enrolled") !== (runs.length === 1)) {
    throw new FlowManualClientEnrollmentIdempotencyConflictError();
  }
  return { status: existing.ingestionOutcome, replayed: true, eventId: existing.id, runs };
}

function assertExistingEventMatches(
  existing: RuntimeEventRow,
  normalized: FlowNormalizedManualClientEventV1
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
    existing.payloadSchemaVersion !== normalized.payloadSchemaVersion ||
    existing.payloadDigest !== normalized.canonicalPayloadHash ||
    existing.classification !== normalized.classification ||
    existing.redactionVersion !== normalized.redactionVersion ||
    existing.retentionPolicyId !== normalized.retentionPolicyId ||
    stableJson(existing.payload as CanonicalJson) !==
      stableJson(normalized.allowlistedPayload as unknown as CanonicalJson)
  ) {
    throw new FlowManualClientEnrollmentIdempotencyConflictError();
  }
}

function isPersistedOutcome(value: string | null): value is FlowManualClientEnrollmentResult["status"] {
  return persistedOutcomeValues.includes(value as (typeof persistedOutcomeValues)[number]);
}

function createRunSnapshot(input: {
  readonly normalized: FlowNormalizedManualClientEventV1;
  readonly processedAt: Date;
  readonly plan: ReturnType<typeof planManualClientFlowEnrollment>;
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
      clientUserId: input.normalized.allowlistedPayload.clientUserId,
      relationshipId: input.normalized.allowlistedPayload.relationshipId
    },
    executionAuthority: input.authority
  });
}

async function readDatabaseInstant(transaction: FlowManualClientEnrollmentTransaction): Promise<Date> {
  const result = await transaction.execute<{ epochMilliseconds: string }>(sql`
    select (extract(epoch from clock_timestamp()) * 1000)::text as "epochMilliseconds"
  `);
  const instant = parseFlowDatabaseEpochMilliseconds(result.rows[0]?.epochMilliseconds);
  if (!instant) {
    throw new FlowManualClientEnrollmentIntegrityError("the database clock did not return an instant");
  }
  return instant;
}
