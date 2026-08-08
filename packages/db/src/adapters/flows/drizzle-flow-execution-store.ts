import { isDeepStrictEqual } from "node:util";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  lte,
  notInArray,
  or,
  sql,
  type SQL
} from "drizzle-orm";
import type { FlowApprovalKind, FlowWorkItemTaskKind } from "@elevenhouse/contracts";
import {
  flowExecutionFailureReasonCodeValues,
  flowExecutionPermanentFailureReasonCodeValues,
  flowExecutionQuarantineFailureReasonCodeValues,
  flowExecutionRetryScheduledFailureReasonCodeValues,
  flowExecutionRetryableFailureReasonCodeValues,
  flowExecutionRetryPolicyV1,
  FlowExecutionIntegrityError,
  FLOW_CHART_CALCULATION_TERMINAL_SIGNAL,
  FLOW_MESSAGING_DELIVERY_TERMINAL_SIGNAL,
  FlowBookingExecutionContextIntegrityError,
  FlowRuntimeControlIntegrityError,
  FlowWorkerReadinessLeaseLostError,
  FlowWorkerRuntimeModeCeilingError,
  createFlowRuntimeRolloutPolicyEvidence,
  formatFlowNodeExecutorKey,
  parseFlowExecutionDecision,
  parseFlowRuntimeTraceSummary,
  resolveFlowWorkItemDueAt,
  resolveFlowBookingExecutionContext,
  resolveFlowWorkItemNodePolicy,
  resolvePinnedFlowExecutionAdvanceTarget,
  resolvePinnedFlowExecutionNode,
  type FlowExecutionAttemptDetail,
  type FlowExecutionClaimAuthorityEvidence,
  type FlowExecutionClaim,
  type FlowExecutionFailure,
  type FlowExecutionFailureDisposition,
  type FlowExecutionFailureReasonCode,
  type FlowExecutionOwnerScope,
  type FlowExecutionRunDetail,
  type FlowExecutionStore,
  type FlowExecutionSignalIngestResult,
  type FlowExecutionSignalStore,
  type FlowExecutionTokenDetail,
  type FlowExecutionWorkerStore,
  type FlowNodeExecutorKey,
  type FlowRuntimeRolloutPolicy,
  type FlowRunEventDetail
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowBookingLifecycleHeads,
  flowExecutionAttempts,
  flowExecutionSignalInbox,
  flowExecutionSignalWaits,
  flowExecutionTokens,
  flowApprovals,
  flowRuntimeOwnerSubjects,
  flowRuntimeEvents,
  flowRunEvents,
  flowRuns,
  flowWorkItems,
  flowWorkerReadinessLeases,
  flowWorkerRegistrations,
  flowVersions
} from "../../schema/flows";
import { bookings } from "../../schema/scheduling";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";
import { readCurrentFlowRuntimeControl } from "./drizzle-flow-runtime-control-reader";

const MAX_LEASE_DURATION_MS = 5 * 60_000;
const MAX_RECOVERY_BATCH_SIZE = 100;
const MAX_FLOW_EXECUTION_CANARY_OWNERS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIMABLE_TOKEN_STATES = ["runnable", "retry_scheduled"] as const;
const CLAIMABLE_RUN_STATUSES = ["pending", "running", "failed_retryable"] as const;
const EVENT_TYPE_BY_ATTEMPT_OUTCOME: Readonly<Record<string, string>> = {
  advanced: "token_advanced",
  waiting: "token_waiting",
  retry_scheduled: "token_retry_scheduled",
  completed: "run_completed",
  failed: "run_failed",
  lease_expired: "token_lease_expired",
  canceled: "run_canceled"
};
const INTEGRITY_QUARANTINE_REASON_CODES = new Set<FlowExecutionFailureReasonCode>([
  ...flowExecutionQuarantineFailureReasonCodeValues
]);
const FAILURE_REASON_CODES = new Set<string>(flowExecutionFailureReasonCodeValues);
const PERMANENT_FAILURE_REASON_CODES = new Set<string>(
  flowExecutionPermanentFailureReasonCodeValues
);
const RETRYABLE_FAILURE_REASON_CODES = new Set<string>(
  flowExecutionRetryableFailureReasonCodeValues
);
const RETRY_SCHEDULED_FAILURE_REASON_CODES = new Set<string>(
  flowExecutionRetryScheduledFailureReasonCodeValues
);

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

type FlowWorkerExecutionIdentity = {
  readonly instanceId: string;
  readonly sessionId: string;
};

type FlowExecutionControlledClaimAuthority = {
  readonly policyAllowedRequirementKeys: readonly string[];
  readonly workerRequirementKeys: readonly string[];
  readonly killedRequirementKeys: readonly string[];
  readonly controlPolicyRevision: number;
  readonly policyDigest: `sha256:${string}`;
  readonly workerSessionId: string;
  readonly workerRegistrationDigest: `sha256:${string}`;
};

type PoisonFlowExecutionCandidate = {
  readonly tokenId: string;
  readonly ownerUserId: string;
  readonly runId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly nodeId: string;
  readonly nodeKind: string;
  readonly configSchemaVersion: number;
  readonly executorContractVersion: number;
  readonly state: string;
  readonly nodeActivationSequence: bigint;
  readonly attemptCounter: bigint;
  readonly fencingToken: bigint;
  readonly retryPolicyKey: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly failureDisposition: string | null;
  readonly failureReasonCode: string | null;
  readonly terminalAt: Date | null;
  readonly quarantinedAt: Date | null;
  readonly graph: unknown;
  readonly capabilityManifest: unknown;
};

type ExpiredFlowExecutionToken = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly flowRunId: string;
  readonly flowId: string;
  readonly flowVersionId: string;
  readonly nodeId: string;
  readonly nodeKind: string;
  readonly executorKey: string;
  readonly claimedAt: Date;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Date;
  readonly nodeActivationSequence: bigint;
  readonly attemptCounter: bigint;
  readonly fencingToken: bigint;
  readonly retryPolicyKey: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly claimControlPolicyRevision: number | null;
  readonly claimPolicyDigest: string | null;
  readonly claimWorkerSessionId: string | null;
  readonly claimWorkerRegistrationDigest: string | null;
};

export function createDrizzleFlowExecutionStore(database: ElevenHouseDatabase): FlowExecutionStore {
  return {
    claimNext: (input) => claimNext(database, input),
    finalize: (input) => finalize(database, input),
    finalizeFailure: (input) => finalizeFailure(database, input),
    recoverExpired: (input) => recoverExpired(database, input),
    getRunDetail: (input) => getRunDetail(database, input)
  };
}

export function createDrizzleFlowExecutionSignalStore(
  database: ElevenHouseDatabase
): FlowExecutionSignalStore {
  return {
    ingest: async (input) => {
      validateFlowExecutionSignalInput(input);
      return database.transaction(async (transaction) => {
        const [signal] = await transaction
          .insert(flowExecutionSignalInbox)
          .values({
            sourceEventId: input.sourceEventId,
            ownerUserId: input.ownerUserId,
            signalType: input.signalType,
            correlationId: input.correlationId,
            outcome: input.outcome,
            occurredAt: new Date(input.occurredAt)
          })
          .onConflictDoNothing()
          .returning({
            id: flowExecutionSignalInbox.id,
            ownerUserId: flowExecutionSignalInbox.ownerUserId,
            signalType: flowExecutionSignalInbox.signalType,
            correlationId: flowExecutionSignalInbox.correlationId,
            sourceEventId: flowExecutionSignalInbox.sourceEventId,
            outcome: flowExecutionSignalInbox.outcome
          });
        if (!signal) return { status: "replayed" } as const;
        return consumeFlowExecutionSignal(transaction, signal);
      });
    }
  };
}

export function createDrizzleFlowWorkerExecutionStore(
  database: ElevenHouseDatabase,
  identity: FlowWorkerExecutionIdentity
): FlowExecutionWorkerStore {
  validateWorkerIdentity(identity);
  return Object.freeze({
    claimNext: (input) => claimNextForWorker(database, identity, input),
    finalize: (input) => finalize(database, input),
    finalizeFailure: (input) => finalizeFailure(database, input),
    recoverExpired: (input) => recoverExpired(database, input)
  });
}

async function claimNext(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["claimNext"]>[0]
): ReturnType<FlowExecutionStore["claimNext"]> {
  validateClaimInput(input);

  return database.transaction((transaction) => claimNextInTransaction(transaction, input));
}

async function claimNextForWorker(
  database: ElevenHouseDatabase,
  identity: FlowWorkerExecutionIdentity,
  input: Parameters<FlowExecutionWorkerStore["claimNext"]>[0]
): ReturnType<FlowExecutionWorkerStore["claimNext"]> {
  validateExecutorKeys(input.executorKeys);

  return database.transaction(async (transaction) => {
    const policy = await readCurrentFlowRuntimeControl(transaction);
    const registration = await readWorkerClaimRegistration(transaction, identity);
    if (registration.policyRevision !== policy.revision) return null;
    const ownerScope = await resolveWorkerClaimOwnerScope(transaction, policy, registration);
    if (!ownerScope) return null;
    return claimNextInTransaction(
      transaction,
      {
        leaseOwner: identity.sessionId,
        leaseDurationMs: policy.tokenLeaseDurationMs,
        executorKeys: input.executorKeys,
        ownerScope
      },
      {
        policyAllowedRequirementKeys: policy.allowedRequirementKeys,
        workerRequirementKeys: registration.requirementKeys,
        killedRequirementKeys: policy.killSwitches.claim.capabilityKeys,
        controlPolicyRevision: policy.revision,
        policyDigest: createFlowRuntimeRolloutPolicyEvidence(policy).policyDigest,
        workerSessionId: identity.sessionId,
        workerRegistrationDigest: registration.registrationDigest as `sha256:${string}`
      }
    );
  });
}

async function claimNextInTransaction(
  transaction: FlowTransaction,
  input: Parameters<FlowExecutionStore["claimNext"]>[0],
  authority?: FlowExecutionControlledClaimAuthority
): ReturnType<FlowExecutionStore["claimNext"]> {
  const [candidate] = await transaction
    .select({
      tokenId: flowExecutionTokens.id,
      ownerUserId: flowExecutionTokens.ownerUserId,
      runId: flowExecutionTokens.flowRunId,
      flowId: flowRuns.flowId,
      flowVersionId: flowExecutionTokens.flowVersionId,
      nodeId: flowExecutionTokens.nodeId,
      nodeKind: flowExecutionTokens.nodeKind,
      configSchemaVersion: flowExecutionTokens.configSchemaVersion,
      executorContractVersion: flowExecutionTokens.executorContractVersion,
      state: flowExecutionTokens.state,
      nodeActivationSequence: flowExecutionTokens.nodeActivationSequence,
      attemptCounter: flowExecutionTokens.attemptCounter,
      fencingToken: flowExecutionTokens.fencingToken,
      retryPolicyKey: flowExecutionTokens.retryPolicyKey,
      maxAttempts: flowExecutionTokens.maxAttempts,
      retryBaseDelayMs: flowExecutionTokens.retryBaseDelayMs,
      retryMaxDelayMs: flowExecutionTokens.retryMaxDelayMs,
      failureDisposition: flowExecutionTokens.failureDisposition,
      failureReasonCode: flowExecutionTokens.failureReasonCode,
      terminalAt: flowExecutionTokens.terminalAt,
      quarantinedAt: flowExecutionTokens.quarantinedAt,
      graph: flowVersions.graph,
      capabilityManifest: flowVersions.capabilityManifest,
      enrollmentSnapshot: flowRuns.snapshot,
      runtimeEventSource: flowRuntimeEvents.source,
      runtimeEventSubjectType: flowRuntimeEvents.subjectType,
      runtimeEventSubjectId: flowRuntimeEvents.subjectId,
      bookingId: bookings.id,
      bookingOwnerUserId: bookings.ownerUserId,
      bookingState: bookings.state,
      bookingLifecycleRevision: bookings.lifecycleRevision,
      bookingStartAt: bookings.serviceStartAt,
      bookingEndAt: bookings.serviceEndAt,
      bookingTimeZone: bookings.timeZoneSnapshot,
      lifecycleHeadBookingId: flowBookingLifecycleHeads.bookingId,
      lifecycleHeadOwnerUserId: flowBookingLifecycleHeads.ownerUserId,
      lifecycleHeadAppliedRevision: flowBookingLifecycleHeads.appliedRevision,
      lifecycleHeadState: flowBookingLifecycleHeads.state,
      lifecycleHeadStartAt: flowBookingLifecycleHeads.currentStartAt,
      lifecycleHeadEndAt: flowBookingLifecycleHeads.currentEndAt,
      lifecycleHeadTimeZone: flowBookingLifecycleHeads.currentTimeZone,
      lifecycleHeadEventId: flowBookingLifecycleHeads.lastLifecycleEventId,
      lifecycleHeadCanonicalDigest: flowBookingLifecycleHeads.lastCanonicalDigest
    })
    .from(flowExecutionTokens)
    .innerJoin(
      flowRuns,
      and(
        eq(flowRuns.id, flowExecutionTokens.flowRunId),
        eq(flowRuns.flowVersionId, flowExecutionTokens.flowVersionId),
        eq(flowRuns.ownerUserId, flowExecutionTokens.ownerUserId)
      )
    )
    .innerJoin(
      flowRuntimeEvents,
      and(
        eq(flowRuntimeEvents.id, flowRuns.runtimeEventId),
        eq(flowRuntimeEvents.ownerUserId, flowExecutionTokens.ownerUserId)
      )
    )
    .leftJoin(
      bookings,
      and(
        sql`${bookings.id}::text = ${flowRuntimeEvents.subjectId}`,
        eq(bookings.ownerUserId, flowExecutionTokens.ownerUserId)
      )
    )
    .leftJoin(
      flowBookingLifecycleHeads,
      and(
        sql`${flowBookingLifecycleHeads.bookingId}::text = ${flowRuntimeEvents.subjectId}`,
        eq(flowBookingLifecycleHeads.ownerUserId, flowExecutionTokens.ownerUserId)
      )
    )
    .innerJoin(
      flowVersions,
      and(
        eq(flowVersions.id, flowExecutionTokens.flowVersionId),
        eq(flowVersions.ownerUserId, flowExecutionTokens.ownerUserId)
      )
    )
    .where(
      and(
        inArray(flowExecutionTokens.state, [...CLAIMABLE_TOKEN_STATES]),
        lte(flowExecutionTokens.availableAt, sql`transaction_timestamp()`),
        inArray(flowExecutionTokens.executorKey, [...input.executorKeys]),
        ownerScopeCondition(input.ownerScope),
        authority
          ? requirementsContainedIn(authority.policyAllowedRequirementKeys, true)
          : undefined,
        authority ? requirementsContainedIn(authority.workerRequirementKeys, false) : undefined,
        authority ? requirementsExcludedFrom(authority.killedRequirementKeys) : undefined,
        inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES]),
        sql`not (
          ${flowRuntimeEvents.source} = 'booking'
          and coalesce(${bookings.lifecycleRevision}, 0)
            > coalesce(${flowBookingLifecycleHeads.appliedRevision}, 0)
        )`
      )
    )
    .orderBy(
      asc(flowExecutionTokens.availableAt),
      asc(flowExecutionTokens.createdAt),
      asc(flowExecutionTokens.id)
    )
    .limit(1)
    .for("update", { of: flowExecutionTokens, skipLocked: true });

  if (!candidate) return null;

  if (!isClaimCandidateRuntimeStateValid(candidate)) {
    return quarantinePoisonCandidate(transaction, candidate, "FLOW_TOKEN_RUNTIME_STATE_INVALID");
  }

  let executionContext: Extract<
    ReturnType<typeof resolveFlowBookingExecutionContext>,
    { readonly kind: "ready" }
  >;
  try {
    const resolved = resolvePersistedFlowBookingExecutionContext(candidate, true);
    if (resolved.kind === "deferred") return null;
    executionContext = resolved;
  } catch (error) {
    if (!(error instanceof FlowBookingExecutionContextIntegrityError)) throw error;
    return quarantinePoisonCandidate(transaction, candidate, error.code);
  }

  try {
    resolvePinnedFlowExecutionNode({
      flowVersionId: candidate.flowVersionId,
      nodeId: candidate.nodeId,
      nodeKind: candidate.nodeKind as FlowExecutionClaim["nodeKind"],
      configSchemaVersion: candidate.configSchemaVersion,
      executorContractVersion: candidate.executorContractVersion,
      graph: candidate.graph,
      capabilityManifest: candidate.capabilityManifest
    });
  } catch (error) {
    if (!(error instanceof FlowExecutionIntegrityError)) throw error;
    return quarantinePoisonCandidate(transaction, candidate, error.code);
  }

  const claimedAt = await readPostLockDatabaseInstant(transaction);
  const [claimed] = await transaction
    .update(flowExecutionTokens)
    .set({
      state: "claimed",
      claimedAt,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: sql`${claimedAt}::timestamptz + (${input.leaseDurationMs} * interval '1 millisecond')`,
      claimControlPolicyRevision: authority?.controlPolicyRevision ?? null,
      claimPolicyDigest: authority?.policyDigest ?? null,
      claimWorkerSessionId: authority?.workerSessionId ?? null,
      claimWorkerRegistrationDigest: authority?.workerRegistrationDigest ?? null,
      attemptCounter: sql`${flowExecutionTokens.attemptCounter} + 1`,
      fencingToken: sql`${flowExecutionTokens.fencingToken} + 1`,
      failureDisposition: null,
      failureReasonCode: null,
      quarantinedAt: null,
      updatedAt: claimedAt
    })
    .where(
      and(
        eq(flowExecutionTokens.id, candidate.tokenId),
        inArray(flowExecutionTokens.state, [...CLAIMABLE_TOKEN_STATES])
      )
    )
    .returning({
      claimedAt: flowExecutionTokens.claimedAt,
      leaseExpiresAt: flowExecutionTokens.leaseExpiresAt,
      attemptCounter: flowExecutionTokens.attemptCounter,
      fencingToken: flowExecutionTokens.fencingToken
    });

  if (!claimed?.claimedAt || !claimed.leaseExpiresAt) {
    throw new Error("Claimed flow token did not persist complete lease state");
  }

  const [run] = await transaction
    .update(flowRuns)
    .set({
      status: "running",
      currentNodeId: candidate.nodeId,
      updatedAt: claimedAt
    })
    .where(
      and(
        eq(flowRuns.id, candidate.runId),
        eq(flowRuns.ownerUserId, candidate.ownerUserId),
        eq(flowRuns.flowVersionId, candidate.flowVersionId),
        inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
      )
    )
    .returning({ id: flowRuns.id });

  if (!run) throw new Error("Flow run became unavailable while claiming its token");

  return {
    status: "claimed",
    claim: {
      tokenId: candidate.tokenId,
      ownerUserId: candidate.ownerUserId,
      runId: candidate.runId,
      flowId: candidate.flowId,
      flowVersionId: candidate.flowVersionId,
      nodeId: candidate.nodeId,
      nodeKind: candidate.nodeKind as FlowExecutionClaim["nodeKind"],
      configSchemaVersion: candidate.configSchemaVersion,
      executorContractVersion: candidate.executorContractVersion,
      graph: candidate.graph,
      capabilityManifest: candidate.capabilityManifest,
      enrollmentSnapshot: candidate.enrollmentSnapshot,
      effectiveRunSnapshot: executionContext.effectiveRunSnapshot,
      bookingLifecycleContext: executionContext.bookingLifecycleContext,
      leaseOwner: input.leaseOwner,
      nodeActivationSequence: candidate.nodeActivationSequence,
      attemptNumber: claimed.attemptCounter,
      fencingToken: claimed.fencingToken,
      claimedAt: claimed.claimedAt.toISOString(),
      leaseExpiresAt: claimed.leaseExpiresAt.toISOString()
    }
  };
}

async function readWorkerClaimRegistration(
  transaction: FlowTransaction,
  identity: FlowWorkerExecutionIdentity
) {
  const [row] = await transaction
    .select({
      state: flowWorkerReadinessLeases.state,
      policyRevision: flowWorkerReadinessLeases.policyRevision,
      isFresh: sql<boolean>`${flowWorkerReadinessLeases.readyUntil} > clock_timestamp()`,
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
  if (!row || row.state !== "ready" || !row.isFresh) {
    throw new FlowWorkerReadinessLeaseLostError();
  }
  if (!row.roles.includes("executor") || !/^sha256:[a-f0-9]{64}$/.test(row.registrationDigest)) {
    throw new FlowRuntimeControlIntegrityError();
  }
  return row;
}

async function resolveWorkerClaimOwnerScope(
  transaction: FlowTransaction,
  policy: FlowRuntimeRolloutPolicy,
  registration: Awaited<ReturnType<typeof readWorkerClaimRegistration>>
): Promise<FlowExecutionOwnerScope | null> {
  if (policy.mode === "definition_only" || policy.killSwitches.claim.global) return null;
  if (
    (policy.mode === "enabled" && registration.maxRuntimeMode !== "enabled") ||
    (policy.mode === "canary" && registration.maxRuntimeMode === "definition_only")
  ) {
    throw new FlowWorkerRuntimeModeCeilingError();
  }

  if (policy.mode === "canary") {
    const deploymentSubjects =
      registration.maxRuntimeMode === "enabled"
        ? new Set(policy.canaryOwnerSubjectIds)
        : new Set(registration.maxCanaryOwnerSubjectIds);
    const killedSubjects = new Set(policy.killSwitches.claim.ownerSubjectIds);
    const admittedSubjectIds = policy.canaryOwnerSubjectIds.filter(
      (subjectId) => deploymentSubjects.has(subjectId) && !killedSubjects.has(subjectId)
    );
    if (admittedSubjectIds.length === 0) return null;
    return {
      kind: "allowlist",
      ownerUserIds: await resolveActiveOwnerUserIds(transaction, admittedSubjectIds)
    };
  }

  const deniedOwnerUserIds = await resolveActiveOwnerUserIds(
    transaction,
    policy.killSwitches.claim.ownerSubjectIds
  );
  return deniedOwnerUserIds.length === 0
    ? { kind: "all" }
    : { kind: "denylist", ownerUserIds: deniedOwnerUserIds };
}

async function resolveActiveOwnerUserIds(
  transaction: FlowTransaction,
  ownerSubjectIds: readonly string[]
): Promise<readonly string[]> {
  if (ownerSubjectIds.length === 0) return [];
  const rows = await transaction
    .select({
      ownerSubjectId: flowRuntimeOwnerSubjects.ownerSubjectId,
      ownerUserId: flowRuntimeOwnerSubjects.ownerUserId
    })
    .from(flowRuntimeOwnerSubjects)
    .where(
      and(
        inArray(flowRuntimeOwnerSubjects.ownerSubjectId, [...ownerSubjectIds]),
        eq(flowRuntimeOwnerSubjects.state, "active"),
        isNotNull(flowRuntimeOwnerSubjects.ownerUserId)
      )
    );
  const ownerUserBySubject = new Map(
    rows.map((row) => [row.ownerSubjectId, row.ownerUserId] as const)
  );
  const ownerUserIds = ownerSubjectIds.map((subjectId) => ownerUserBySubject.get(subjectId));
  if (ownerUserIds.some((ownerUserId) => !ownerUserId)) {
    throw new FlowRuntimeControlIntegrityError();
  }
  return [...new Set(ownerUserIds as string[])].sort(compareStableText);
}

function ownerScopeCondition(ownerScope: FlowExecutionOwnerScope): SQL | undefined {
  if (ownerScope.kind === "all") return undefined;
  return ownerScope.kind === "allowlist"
    ? inArray(flowExecutionTokens.ownerUserId, [...ownerScope.ownerUserIds])
    : notInArray(flowExecutionTokens.ownerUserId, [...ownerScope.ownerUserIds]);
}

function requirementsContainedIn(
  allowedRequirementKeys: readonly string[],
  includeTrigger: boolean
): SQL {
  const requirementRows = includeTrigger
    ? completeManifestRequirementRows()
    : executionManifestRequirementRows();
  return sql`(
    ${manifestRequirementShapeIsInvalid()}
    or not exists (
      select 1
        from (${requirementRows}) required
       where required.requirement_key is null
          or not (required.requirement_key = any(${textArraySql(allowedRequirementKeys)}))
    )
  )`;
}

function requirementsExcludedFrom(killedRequirementKeys: readonly string[]): SQL {
  if (killedRequirementKeys.length === 0) return sql`true`;
  return sql`(
    ${manifestRequirementShapeIsInvalid()}
    or not exists (
      select 1
        from (${completeManifestRequirementRows()}) required
       where required.requirement_key = any(${textArraySql(killedRequirementKeys)})
    )
  )`;
}

function completeManifestRequirementRows(): SQL {
  return sql`
    ${executionManifestRequirementRows()}
    union all
    select 'trigger:' || (${flowVersions.capabilityManifest}->'triggerMatcher'->>'kind')
      || ':' || (${flowVersions.capabilityManifest}->'triggerMatcher'->>'configSchemaVersion')
      || ':' || (${flowVersions.capabilityManifest}->'triggerMatcher'->>'matcherContractVersion')
      || ':' || (${flowVersions.capabilityManifest}->'triggerMatcher'->>'eventSchemaVersion')
      as requirement_key
     where ${flowVersions.capabilityManifest}->>'schemaVersion' = 'flow-capability-manifest.v2'
  `;
}

function executionManifestRequirementRows(): SQL {
  return sql`
    select 'runtime:' || (${flowVersions.capabilityManifest}->>'executionSemanticsVersion')
      as requirement_key
    union all
    select 'executor:' || (executor.value->>'kind')
      || ':' || (executor.value->>'configSchemaVersion')
      || ':' || (executor.value->>'executorContractVersion')
      as requirement_key
      from jsonb_array_elements(
        case when jsonb_typeof(${flowVersions.capabilityManifest}->'nodeExecutors') = 'array'
          then ${flowVersions.capabilityManifest}->'nodeExecutors'
          else '[]'::jsonb end
      ) executor(value)
     where executor.value->>'kind' not in ('booking_confirmed', 'manual_client')
    union all
    select 'capability:' || capability.value as requirement_key
      from jsonb_array_elements_text(
        case when jsonb_typeof(${flowVersions.capabilityManifest}->'requiredCapabilities') = 'array'
          then ${flowVersions.capabilityManifest}->'requiredCapabilities'
          else '[]'::jsonb end
      ) capability(value)
  `;
}

function manifestRequirementShapeIsInvalid(): SQL {
  return sql`(
    jsonb_typeof(${flowVersions.capabilityManifest}) is distinct from 'object'
    or ${flowVersions.capabilityManifest}->>'schemaVersion'
      is distinct from 'flow-capability-manifest.v2'
    or jsonb_typeof(${flowVersions.capabilityManifest}->'nodeExecutors') is distinct from 'array'
    or jsonb_typeof(${flowVersions.capabilityManifest}->'requiredCapabilities')
      is distinct from 'array'
    or jsonb_typeof(${flowVersions.capabilityManifest}->'triggerMatcher')
      is distinct from 'object'
  )`;
}

function textArraySql(values: readonly string[]): SQL {
  if (values.length === 0) return sql`array[]::text[]`;
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )}]::text[]`;
}

async function quarantinePoisonCandidate(
  transaction: FlowTransaction,
  candidate: PoisonFlowExecutionCandidate,
  reasonCode: FlowExecutionFailureReasonCode
) {
  const quarantinedAt = await readPostLockDatabaseInstant(transaction);
  const trace = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "failed",
    nodeKind: candidate.nodeKind,
    reasonCode,
    resultCode: "FLOW_EXECUTION_FAILED_TERMINAL"
  });
  const [token] = await transaction
    .update(flowExecutionTokens)
    .set({
      state: "failed",
      claimedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      failureDisposition: "quarantined",
      failureReasonCode: reasonCode,
      terminalAt: quarantinedAt,
      quarantinedAt,
      updatedAt: quarantinedAt
    })
    .where(
      and(
        eq(flowExecutionTokens.id, candidate.tokenId),
        eq(flowExecutionTokens.ownerUserId, candidate.ownerUserId),
        eq(flowExecutionTokens.flowRunId, candidate.runId),
        inArray(flowExecutionTokens.state, [...CLAIMABLE_TOKEN_STATES])
      )
    )
    .returning({ quarantinedAt: flowExecutionTokens.quarantinedAt });
  if (!token?.quarantinedAt) {
    throw new Error("Locked poison flow token could not be quarantined");
  }

  const [run] = await transaction
    .update(flowRuns)
    .set({
      status: "failed_terminal",
      currentNodeId: candidate.nodeId,
      traceSequence: sql`${flowRuns.traceSequence} + 1`,
      completedAt: token.quarantinedAt,
      updatedAt: token.quarantinedAt
    })
    .where(
      and(
        eq(flowRuns.id, candidate.runId),
        eq(flowRuns.ownerUserId, candidate.ownerUserId),
        eq(flowRuns.flowId, candidate.flowId),
        eq(flowRuns.flowVersionId, candidate.flowVersionId),
        inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
      )
    )
    .returning({ traceSequence: flowRuns.traceSequence });
  if (!run) throw new Error("Flow run became unavailable while quarantining its poison token");

  await transaction.insert(flowRunEvents).values({
    ownerUserId: candidate.ownerUserId,
    flowRunId: candidate.runId,
    sequence: run.traceSequence,
    eventType: "run_failed",
    nodeId: candidate.nodeId,
    attemptId: null,
    summary: trace,
    occurredAt: token.quarantinedAt
  });

  return {
    status: "quarantined" as const,
    tokenId: candidate.tokenId,
    runId: candidate.runId,
    attemptId: null,
    traceSequence: run.traceSequence,
    reasonCode
  };
}

async function finalize(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["finalize"]>[0]
): ReturnType<FlowExecutionStore["finalize"]> {
  const decision = parseFlowExecutionDecision(input.decision);
  if (decision.sourceNodeId !== input.claim.nodeId) {
    throw new Error("Flow execution decision does not belong to the claimed node");
  }
  if (decision.trace.nodeKind !== input.claim.nodeKind) {
    throw new Error("FLOW_RUNTIME_TRACE_INVALID: trace does not match the claimed transition");
  }

  return database.transaction(async (transaction) => {
    const [token] = await transaction
      .select({
        id: flowExecutionTokens.id,
        ownerUserId: flowExecutionTokens.ownerUserId,
        executorKey: flowExecutionTokens.executorKey,
        claimedAt: flowExecutionTokens.claimedAt,
        leaseExpiresAt: flowExecutionTokens.leaseExpiresAt,
        nodeActivationSequence: flowExecutionTokens.nodeActivationSequence,
        attemptNumber: flowExecutionTokens.attemptCounter,
        fencingToken: flowExecutionTokens.fencingToken,
        leaseOwner: flowExecutionTokens.leaseOwner,
        claimControlPolicyRevision: flowExecutionTokens.claimControlPolicyRevision,
        claimPolicyDigest: flowExecutionTokens.claimPolicyDigest,
        claimWorkerSessionId: flowExecutionTokens.claimWorkerSessionId,
        claimWorkerRegistrationDigest: flowExecutionTokens.claimWorkerRegistrationDigest,
        graph: flowVersions.graph,
        capabilityManifest: flowVersions.capabilityManifest,
        enrollmentSnapshot: flowRuns.snapshot,
        runtimeEventSource: flowRuntimeEvents.source,
        runtimeEventSubjectType: flowRuntimeEvents.subjectType,
        runtimeEventSubjectId: flowRuntimeEvents.subjectId,
        bookingId: bookings.id,
        bookingOwnerUserId: bookings.ownerUserId,
        bookingState: bookings.state,
        bookingLifecycleRevision: bookings.lifecycleRevision,
        bookingStartAt: bookings.serviceStartAt,
        bookingEndAt: bookings.serviceEndAt,
        bookingTimeZone: bookings.timeZoneSnapshot,
        lifecycleHeadBookingId: flowBookingLifecycleHeads.bookingId,
        lifecycleHeadOwnerUserId: flowBookingLifecycleHeads.ownerUserId,
        lifecycleHeadAppliedRevision: flowBookingLifecycleHeads.appliedRevision,
        lifecycleHeadState: flowBookingLifecycleHeads.state,
        lifecycleHeadStartAt: flowBookingLifecycleHeads.currentStartAt,
        lifecycleHeadEndAt: flowBookingLifecycleHeads.currentEndAt,
        lifecycleHeadTimeZone: flowBookingLifecycleHeads.currentTimeZone,
        lifecycleHeadEventId: flowBookingLifecycleHeads.lastLifecycleEventId,
        lifecycleHeadCanonicalDigest: flowBookingLifecycleHeads.lastCanonicalDigest
      })
      .from(flowExecutionTokens)
      .innerJoin(
        flowRuns,
        and(
          eq(flowRuns.id, flowExecutionTokens.flowRunId),
          eq(flowRuns.flowVersionId, flowExecutionTokens.flowVersionId),
          eq(flowRuns.ownerUserId, flowExecutionTokens.ownerUserId)
        )
      )
      .innerJoin(
        flowRuntimeEvents,
        and(
          eq(flowRuntimeEvents.id, flowRuns.runtimeEventId),
          eq(flowRuntimeEvents.ownerUserId, flowExecutionTokens.ownerUserId)
        )
      )
      .leftJoin(
        bookings,
        and(
          sql`${bookings.id}::text = ${flowRuntimeEvents.subjectId}`,
          eq(bookings.ownerUserId, flowExecutionTokens.ownerUserId)
        )
      )
      .leftJoin(
        flowBookingLifecycleHeads,
        and(
          sql`${flowBookingLifecycleHeads.bookingId}::text = ${flowRuntimeEvents.subjectId}`,
          eq(flowBookingLifecycleHeads.ownerUserId, flowExecutionTokens.ownerUserId)
        )
      )
      .innerJoin(
        flowVersions,
        and(
          eq(flowVersions.id, flowExecutionTokens.flowVersionId),
          eq(flowVersions.ownerUserId, flowExecutionTokens.ownerUserId)
        )
      )
      .where(
        and(
          eq(flowExecutionTokens.id, input.claim.tokenId),
          eq(flowExecutionTokens.ownerUserId, input.claim.ownerUserId),
          eq(flowExecutionTokens.flowRunId, input.claim.runId),
          eq(flowExecutionTokens.flowVersionId, input.claim.flowVersionId),
          eq(flowExecutionTokens.nodeId, input.claim.nodeId),
          eq(flowExecutionTokens.nodeKind, input.claim.nodeKind),
          eq(flowExecutionTokens.configSchemaVersion, input.claim.configSchemaVersion),
          eq(flowExecutionTokens.executorContractVersion, input.claim.executorContractVersion),
          eq(flowExecutionTokens.nodeActivationSequence, input.claim.nodeActivationSequence),
          eq(
            flowExecutionTokens.executorKey,
            `${input.claim.nodeKind}:${input.claim.configSchemaVersion}:${input.claim.executorContractVersion}`
          ),
          eq(flowExecutionTokens.state, "claimed"),
          eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
          eq(flowExecutionTokens.fencingToken, input.claim.fencingToken)
        )
      )
      .limit(1)
      .for("update", { of: flowExecutionTokens });

    if (!token) return { status: "stale" } as const;
    if (!token.claimedAt || !token.leaseOwner || !token.leaseExpiresAt) {
      throw new Error("Claimed flow token is missing database-owned audit state");
    }
    const executionContext = resolvePersistedFlowBookingExecutionContext(token, false);
    if (executionContext.kind === "deferred") {
      throw new FlowBookingExecutionContextIntegrityError(
        "an already claimed token cannot lose its applied Booking lifecycle head"
      );
    }
    if (
      !isDeepStrictEqual(
        input.claim.bookingLifecycleContext,
        executionContext.bookingLifecycleContext
      )
    ) {
      return { status: "stale" } as const;
    }
    const transitionAt = await readPostLockDatabaseInstant(transaction);
    if (token.leaseExpiresAt.getTime() <= transitionAt.getTime()) {
      return { status: "stale" } as const;
    }

    const persistedDefinition = {
      flowVersionId: input.claim.flowVersionId,
      nodeId: input.claim.nodeId,
      nodeKind: input.claim.nodeKind,
      configSchemaVersion: input.claim.configSchemaVersion,
      executorContractVersion: input.claim.executorContractVersion,
      graph: token.graph,
      capabilityManifest: token.capabilityManifest
    };
    const persistedNode = resolvePinnedFlowExecutionNode(persistedDefinition);
    let advanceTarget: ReturnType<typeof resolvePinnedFlowExecutionAdvanceTarget> | null = null;
    let workItem: {
      readonly taskKind: FlowWorkItemTaskKind;
      readonly title: string;
      readonly instructions: string | null;
      readonly priority: "low" | "normal" | "high" | "urgent";
      readonly duePolicy:
        | { readonly kind: "none" }
        | { readonly kind: "before_booking_start"; readonly leadTimeMinutes: number };
      readonly dueAt: string | null;
      readonly dueBookingLifecycleRevision: number | null;
    } | null = null;
    let signalWait: {
      readonly signalType:
        | "chart.calculation.terminal.v1"
        | "messaging.message.delivery.terminal.v1";
      readonly correlationId: string;
      readonly successHandle: "next" | "success";
      readonly failureHandle?: "error";
      readonly replayExistingResult?: boolean;
      readonly expectedSourceEventId?: string;
    } | null = null;
    let approvalWait: {
      readonly kind: FlowApprovalKind;
      readonly title: string;
      readonly preview: string;
      readonly artifact: {
        readonly calculationId: string;
        readonly interpretationId: string;
        readonly sourceChecksum: string;
        readonly contentChecksum: string;
        readonly outputText: string;
      } | null;
      readonly expiresAfterMinutes: number | null;
    } | null = null;
    let transitionResultCode = decision.resultCode;
    let transitionTrace = decision.trace;

    switch (decision.kind) {
      case "terminal":
        if (persistedNode.kind === "completed") {
          if (decision.resultCode !== persistedNode.config.goalKey) {
            throw new Error(
              "FLOW_RUNTIME_TRACE_INVALID: terminal decision does not match persisted terminal node"
            );
          }
        } else if (persistedNode.kind === "suppressed") {
          if (decision.resultCode !== persistedNode.config.reasonCode) {
            throw new Error(
              "FLOW_RUNTIME_TRACE_INVALID: terminal decision does not match persisted terminal node"
            );
          }
        } else if (persistedNode.kind === "failed") {
          if (decision.resultCode !== persistedNode.config.errorCode) {
            throw new Error(
              "FLOW_RUNTIME_TRACE_INVALID: terminal decision does not match persisted terminal node"
            );
          }
        } else {
          throw new Error(
            "FLOW_RUNTIME_TRACE_INVALID: terminal decision does not match persisted terminal node"
          );
        }
        transitionResultCode = decision.resultCode;
        transitionTrace = {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "terminal",
          nodeKind: persistedNode.kind,
          reasonCode: "FLOW_GOAL_REACHED",
          resultCode: decision.resultCode
        };
        break;
      case "advance":
        advanceTarget = resolvePinnedFlowExecutionAdvanceTarget({
          definition: persistedDefinition,
          sourceHandle: decision.sourceHandle
        });
        if (
          advanceTarget.edgeId !== decision.selectedEdgeId ||
          advanceTarget.node.id !== decision.targetNodeId ||
          advanceTarget.node.kind !== decision.targetNodeKind
        ) {
          throw new Error(
            "FLOW_RUNTIME_TRACE_INVALID: decision target does not match persisted graph"
          );
        }
        break;
      case "wait_work_item": {
        const policy =
          persistedNode.kind === "astrologer_work_item"
            ? resolveFlowWorkItemNodePolicy(persistedNode)
            : null;
        const dueAt = policy
          ? resolveFlowWorkItemDueAt(policy.duePolicy, executionContext.effectiveRunSnapshot)
          : null;
        const dueBookingLifecycleRevision =
          policy?.duePolicy.kind === "before_booking_start"
            ? requireBookingLifecycleRevision(executionContext.bookingLifecycleContext)
            : null;
        if (
          persistedNode.kind !== "astrologer_work_item" ||
          policy === null ||
          decision.completionHandle !== "success" ||
          decision.workItem.taskKind !== persistedNode.config.taskKind ||
          decision.workItem.title !== persistedNode.config.taskTitle ||
          decision.workItem.instructions !== (persistedNode.config.instructions ?? null) ||
          decision.workItem.priority !== persistedNode.config.priority ||
          decision.workItem.completionRequirements.resultSummary !==
            policy.completionRequirements.resultSummary ||
          !isDeepStrictEqual(decision.workItem.duePolicy, policy.duePolicy) ||
          decision.workItem.dueAt !== dueAt
        ) {
          throw new Error(
            "FLOW_RUNTIME_TRACE_INVALID: work-item decision does not match persisted node"
          );
        }
        resolvePinnedFlowExecutionAdvanceTarget({
          definition: persistedDefinition,
          sourceHandle: decision.completionHandle
        });
        workItem = {
          taskKind: persistedNode.config.taskKind,
          title: persistedNode.config.taskTitle,
          instructions: persistedNode.config.instructions ?? null,
          priority: persistedNode.config.priority,
          duePolicy: policy.duePolicy,
          dueAt,
          dueBookingLifecycleRevision
        };
        transitionResultCode = "FLOW_WAITING_WORK_ITEM";
        transitionTrace = {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "waiting",
          nodeKind: "astrologer_work_item",
          reasonCode: "FLOW_WORK_ITEM_CREATED",
          resultCode: "FLOW_WAITING_WORK_ITEM"
        };
        break;
      }
      case "wait_signal":
        if (
          persistedNode.kind !== "natal_chart_request" ||
          decision.wait.signalType !== "chart.calculation.terminal.v1" ||
          decision.wait.successHandle !== "next"
        ) {
          throw new Error(
            "FLOW_RUNTIME_TRACE_INVALID: signal-wait decision does not match persisted node"
          );
        }
        resolvePinnedFlowExecutionAdvanceTarget({
          definition: persistedDefinition,
          sourceHandle: decision.wait.successHandle
        });
        signalWait = {
          ...decision.wait,
          ...(decision.wait.replayExistingResult === true
            ? { expectedSourceEventId: input.claim.tokenId }
            : {})
        };
        transitionResultCode = "FLOW_WAITING_SIGNAL";
        transitionTrace = {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "waiting",
          nodeKind: "natal_chart_request",
          reasonCode: "FLOW_CHART_CALCULATION_REQUESTED",
          resultCode: "FLOW_WAITING_SIGNAL"
        };
        break;
      case "wait_external":
        if (
          persistedNode.kind !== "send_message" ||
          decision.wait.signalType !== FLOW_MESSAGING_DELIVERY_TERMINAL_SIGNAL ||
          decision.wait.successHandle !== "success" ||
          decision.wait.failureHandle !== "error"
        ) {
          throw new Error(
            "FLOW_RUNTIME_TRACE_INVALID: external-wait decision does not match persisted node"
          );
        }
        resolvePinnedFlowExecutionAdvanceTarget({
          definition: persistedDefinition,
          sourceHandle: decision.wait.successHandle
        });
        resolvePinnedFlowExecutionAdvanceTarget({
          definition: persistedDefinition,
          sourceHandle: decision.wait.failureHandle
        });
        signalWait = decision.wait;
        transitionResultCode = "FLOW_WAITING_EXTERNAL";
        transitionTrace = {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "waiting",
          nodeKind: "send_message",
          reasonCode: "FLOW_MESSAGING_DELIVERY_REQUESTED",
          resultCode: "FLOW_WAITING_EXTERNAL"
        };
        break;
      case "wait_approval":
        if (
          !(
            (persistedNode.kind === "astrologer_approval" &&
              decision.approval.kind === persistedNode.config.approvalKind &&
              decision.approval.title === persistedNode.config.approvalTitle &&
              decision.approval.preview === persistedNode.displayTitle &&
              decision.approval.artifact === null &&
              decision.approval.expiresAfterMinutes ===
                (persistedNode.config.expiresAfterMinutes ?? null)) ||
            (persistedNode.kind === "natal_chart_ai_draft" &&
              decision.approval.kind === "ai_output" &&
              decision.approval.title === persistedNode.config.approvalTitle &&
              decision.approval.artifact !== null &&
              decision.approval.expiresAfterMinutes ===
                (persistedNode.config.expiresAfterMinutes ?? null))
          )
        ) {
          throw new Error(
            "FLOW_RUNTIME_TRACE_INVALID: approval-wait decision does not match persisted node"
          );
        }
        resolvePinnedFlowExecutionAdvanceTarget({
          definition: persistedDefinition,
          sourceHandle: "approved"
        });
        resolvePinnedFlowExecutionAdvanceTarget({
          definition: persistedDefinition,
          sourceHandle: "rejected"
        });
        if (persistedNode.config.expiresAfterMinutes !== undefined) {
          resolvePinnedFlowExecutionAdvanceTarget({
            definition: persistedDefinition,
            sourceHandle: "timeout"
          });
        }
        approvalWait = decision.approval;
        transitionResultCode = "FLOW_WAITING_APPROVAL";
        transitionTrace = {
          schemaVersion: "flow-runtime-trace.v1",
          outcome: "waiting",
          nodeKind: persistedNode.kind,
          reasonCode: "FLOW_APPROVAL_CREATED",
          resultCode: "FLOW_WAITING_APPROVAL"
        };
        break;
      default:
        assertNeverFlowExecutionDecision(decision);
    }

    const [transitionedToken] = await transaction
      .update(flowExecutionTokens)
      .set(
        decision.kind === "terminal"
          ? {
              state: "completed",
              claimedAt: null,
              leaseOwner: null,
              leaseExpiresAt: null,
              terminalAt: transitionAt,
              updatedAt: transitionAt
            }
          : decision.kind === "wait_work_item"
            ? {
                state: "waiting_work_item",
                claimedAt: null,
                leaseOwner: null,
                leaseExpiresAt: null,
                failureDisposition: null,
                failureReasonCode: null,
                terminalAt: null,
                quarantinedAt: null,
                updatedAt: transitionAt
              }
            : decision.kind === "wait_signal"
              ? {
                  state: "waiting_signal",
                  claimedAt: null,
                  leaseOwner: null,
                  leaseExpiresAt: null,
                  failureDisposition: null,
                  failureReasonCode: null,
                  terminalAt: null,
                  quarantinedAt: null,
                  updatedAt: transitionAt
                }
              : decision.kind === "wait_external"
                ? {
                    state: "waiting_external",
                    claimedAt: null,
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    failureDisposition: null,
                    failureReasonCode: null,
                    terminalAt: null,
                    quarantinedAt: null,
                    updatedAt: transitionAt
                  }
              : decision.kind === "wait_approval"
                ? {
                    state: "waiting_approval",
                    claimedAt: null,
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    failureDisposition: null,
                    failureReasonCode: null,
                    terminalAt: null,
                    quarantinedAt: null,
                    updatedAt: transitionAt
                  }
              : {
                nodeId: advanceTarget?.node.id,
                nodeKind: advanceTarget?.node.kind,
                configSchemaVersion: advanceTarget?.node.configSchemaVersion,
                executorContractVersion: advanceTarget?.node.executorContractVersion,
                executorKey: advanceTarget
                  ? formatFlowNodeExecutorKey(advanceTarget.node)
                  : undefined,
                state: "runnable",
                availableAt: transitionAt,
                claimedAt: null,
                leaseOwner: null,
                leaseExpiresAt: null,
                nodeActivationSequence: sql`${flowExecutionTokens.nodeActivationSequence} + 1`,
                attemptCounter: 0n,
                failureDisposition: null,
                failureReasonCode: null,
                terminalAt: null,
                quarantinedAt: null,
                updatedAt: transitionAt
              }
      )
      .where(
        and(
          eq(flowExecutionTokens.id, token.id),
          eq(flowExecutionTokens.state, "claimed"),
          eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
          eq(flowExecutionTokens.nodeActivationSequence, token.nodeActivationSequence),
          eq(flowExecutionTokens.fencingToken, input.claim.fencingToken)
        )
      )
      .returning({ id: flowExecutionTokens.id });
    if (!transitionedToken) return { status: "stale" } as const;

    if (workItem) {
      const [createdWorkItem] = await transaction
        .insert(flowWorkItems)
        .values({
          ownerUserId: input.claim.ownerUserId,
          flowRunId: input.claim.runId,
          flowVersionId: input.claim.flowVersionId,
          tokenId: input.claim.tokenId,
          nodeActivationSequence: token.nodeActivationSequence,
          nodeId: input.claim.nodeId,
          completionHandle: "success",
          status: "pending",
          taskKind: workItem.taskKind,
          title: workItem.title,
          instructions: workItem.instructions,
          assigneeUserId: input.claim.ownerUserId,
          priority: workItem.priority,
          duePolicyKind: workItem.duePolicy.kind,
          dueLeadTimeMinutes:
            workItem.duePolicy.kind === "before_booking_start"
              ? workItem.duePolicy.leadTimeMinutes
              : null,
          dueBookingLifecycleRevision: workItem.dueBookingLifecycleRevision,
          dueAt: workItem.dueAt === null ? null : new Date(workItem.dueAt),
          availableAt: transitionAt,
          revision: 1,
          createdAt: transitionAt,
          updatedAt: transitionAt
        })
        .returning({ id: flowWorkItems.id });
      if (!createdWorkItem) throw new Error("Flow work item was not persisted");
    }
    if (signalWait) {
      const [createdSignalWait] = await transaction
        .insert(flowExecutionSignalWaits)
        .values({
          ownerUserId: input.claim.ownerUserId,
          flowRunId: input.claim.runId,
          flowVersionId: input.claim.flowVersionId,
          tokenId: input.claim.tokenId,
          nodeActivationSequence: token.nodeActivationSequence,
          nodeId: input.claim.nodeId,
          signalType: signalWait.signalType,
          correlationId: signalWait.correlationId,
          successHandle: signalWait.successHandle,
          failureHandle: signalWait.failureHandle ?? null,
          expectedSourceEventId: signalWait.expectedSourceEventId ?? null,
          state: "waiting",
          createdAt: transitionAt
        })
        .returning({ id: flowExecutionSignalWaits.id });
      if (!createdSignalWait) throw new Error("Flow signal wait was not persisted");
      if (signalWait.replayExistingResult === true) {
        const [replayedSignal] = await transaction
          .insert(flowExecutionSignalInbox)
          .values({
            sourceEventId: input.claim.tokenId,
            ownerUserId: input.claim.ownerUserId,
            signalType: signalWait.signalType,
            correlationId: signalWait.correlationId,
            outcome: "succeeded",
            occurredAt: sql`transaction_timestamp()`
          })
          .onConflictDoNothing()
          .returning({
            id: flowExecutionSignalInbox.id,
            ownerUserId: flowExecutionSignalInbox.ownerUserId,
            signalType: flowExecutionSignalInbox.signalType,
            correlationId: flowExecutionSignalInbox.correlationId,
            sourceEventId: flowExecutionSignalInbox.sourceEventId,
            outcome: flowExecutionSignalInbox.outcome
          });
        if (!replayedSignal) {
          throw new Error("FLOW_RUNTIME_REPLAY_SIGNAL_CONFLICT");
        }
      }
    }
    if (approvalWait) {
      const [createdApproval] = await transaction
        .insert(flowApprovals)
        .values({
          ownerUserId: input.claim.ownerUserId,
          flowRunId: input.claim.runId,
          flowStepRunId: null,
          executionTokenId: input.claim.tokenId,
          nodeActivationSequence: token.nodeActivationSequence,
          status: "pending",
          kind: approvalWait.kind,
          title: approvalWait.title,
          preview: approvalWait.preview,
          aiCalculationId: approvalWait.artifact?.calculationId ?? null,
          aiInterpretationId: approvalWait.artifact?.interpretationId ?? null,
          aiSourceChecksum: approvalWait.artifact?.sourceChecksum ?? null,
          aiContentChecksum: approvalWait.artifact?.contentChecksum ?? null,
          aiOutputText: approvalWait.artifact?.outputText ?? null,
          decisionNote: null,
          decidedByUserId: null,
          snoozedUntil: null,
          expiresAt:
            approvalWait.expiresAfterMinutes === null
              ? null
              : new Date(transitionAt.getTime() + approvalWait.expiresAfterMinutes * 60_000),
          revision: 1,
          lastCommandId: null,
          lastRunEventId: null,
          createdAt: transitionAt,
          decidedAt: null
        })
        .returning({ id: flowApprovals.id });
      if (!createdApproval) throw new Error("Flow approval was not persisted");
    }

    const [run] = await transaction
      .update(flowRuns)
      .set({
        status:
          decision.kind === "terminal"
            ? "completed"
            : decision.kind === "wait_work_item" ||
                decision.kind === "wait_signal" ||
                decision.kind === "wait_external" ||
                decision.kind === "wait_approval"
              ? "waiting"
              : "running",
        currentNodeId: decision.kind === "advance" ? advanceTarget?.node.id : input.claim.nodeId,
        traceSequence: sql`${flowRuns.traceSequence} + 1`,
        completedAt: decision.kind === "terminal" ? transitionAt : null,
        updatedAt: transitionAt
      })
      .where(
        and(
          eq(flowRuns.id, input.claim.runId),
          eq(flowRuns.ownerUserId, input.claim.ownerUserId),
          eq(flowRuns.flowId, input.claim.flowId),
          eq(flowRuns.flowVersionId, input.claim.flowVersionId),
          inArray(flowRuns.status, ["pending", "running"])
        )
      )
      .returning({ traceSequence: flowRuns.traceSequence });

    if (!run) throw new Error("Flow run became unavailable while finalizing its token");

    const [attempt] = await transaction
      .insert(flowExecutionAttempts)
      .values({
        ownerUserId: input.claim.ownerUserId,
        flowRunId: input.claim.runId,
        tokenId: input.claim.tokenId,
        flowVersionId: input.claim.flowVersionId,
        nodeId: input.claim.nodeId,
        executorKey: token.executorKey,
        nodeActivationSequence: token.nodeActivationSequence,
        attemptNumber: token.attemptNumber,
        fencingToken: token.fencingToken,
        leaseOwner: token.leaseOwner,
        controlPolicyRevision: token.claimControlPolicyRevision,
        policyDigest: token.claimPolicyDigest,
        workerSessionId: token.claimWorkerSessionId,
        workerRegistrationDigest: token.claimWorkerRegistrationDigest,
        outcome:
          decision.kind === "terminal"
            ? "completed"
            : decision.kind === "wait_work_item" ||
                decision.kind === "wait_signal" ||
                decision.kind === "wait_external" ||
                decision.kind === "wait_approval"
              ? "waiting"
              : "advanced",
        resultCode: transitionResultCode,
        traceSummary: transitionTrace,
        startedAt: token.claimedAt,
        completedAt: transitionAt,
        createdAt: transitionAt
      })
      .returning({ id: flowExecutionAttempts.id });

    if (!attempt) throw new Error("Flow execution attempt was not persisted");

    await transaction.insert(flowRunEvents).values({
      ownerUserId: input.claim.ownerUserId,
      flowRunId: input.claim.runId,
      sequence: run.traceSequence,
      eventType:
        decision.kind === "terminal"
          ? "run_completed"
          : decision.kind === "wait_work_item" ||
              decision.kind === "wait_signal" ||
              decision.kind === "wait_external" ||
              decision.kind === "wait_approval"
            ? "token_waiting"
            : "token_advanced",
      nodeId: input.claim.nodeId,
      attemptId: attempt.id,
      summary: transitionTrace,
      occurredAt: transitionAt
    });

    if (signalWait) {
      const [storedSignal] = await transaction
        .select({
          id: flowExecutionSignalInbox.id,
          ownerUserId: flowExecutionSignalInbox.ownerUserId,
          signalType: flowExecutionSignalInbox.signalType,
          correlationId: flowExecutionSignalInbox.correlationId,
          sourceEventId: flowExecutionSignalInbox.sourceEventId,
          outcome: flowExecutionSignalInbox.outcome
        })
        .from(flowExecutionSignalInbox)
        .where(
          and(
            eq(flowExecutionSignalInbox.ownerUserId, input.claim.ownerUserId),
            eq(flowExecutionSignalInbox.signalType, signalWait.signalType),
            eq(flowExecutionSignalInbox.correlationId, signalWait.correlationId),
            ...(signalWait.expectedSourceEventId
              ? [eq(flowExecutionSignalInbox.sourceEventId, signalWait.expectedSourceEventId)]
              : []),
            sql`${flowExecutionSignalInbox.consumedAt} is null`
          )
        )
        .limit(1)
        .for("update");
      if (storedSignal) {
        const consumed = await consumeFlowExecutionSignal(transaction, storedSignal);
        if (consumed.status === "consumed") {
          return { status: "applied", attemptId: attempt.id, traceSequence: consumed.traceSequence };
        }
      }
    }

    return { status: "applied", attemptId: attempt.id, traceSequence: run.traceSequence };
  });
}

async function consumeFlowExecutionSignal(
  transaction: FlowTransaction,
  signal: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly signalType: string;
    readonly correlationId: string;
    readonly sourceEventId: string;
    readonly outcome: string;
  }
): Promise<FlowExecutionSignalIngestResult> {
  const [wait] = await transaction
    .select({
      waitId: flowExecutionSignalWaits.id,
      waitNodeId: flowExecutionSignalWaits.nodeId,
      waitSuccessHandle: flowExecutionSignalWaits.successHandle,
      waitFailureHandle: flowExecutionSignalWaits.failureHandle,
      tokenId: flowExecutionTokens.id,
      tokenNodeKind: flowExecutionTokens.nodeKind,
      tokenNodeActivationSequence: flowExecutionTokens.nodeActivationSequence,
      tokenConfigSchemaVersion: flowExecutionTokens.configSchemaVersion,
      tokenExecutorContractVersion: flowExecutionTokens.executorContractVersion,
      runId: flowRuns.id,
      flowVersionId: flowRuns.flowVersionId,
      graph: flowVersions.graph,
      capabilityManifest: flowVersions.capabilityManifest
    })
    .from(flowExecutionSignalWaits)
    .innerJoin(
      flowExecutionTokens,
      and(
        eq(flowExecutionTokens.id, flowExecutionSignalWaits.tokenId),
        eq(flowExecutionTokens.flowRunId, flowExecutionSignalWaits.flowRunId),
        eq(flowExecutionTokens.ownerUserId, flowExecutionSignalWaits.ownerUserId)
      )
    )
    .innerJoin(
      flowRuns,
      and(
        eq(flowRuns.id, flowExecutionSignalWaits.flowRunId),
        eq(flowRuns.flowVersionId, flowExecutionSignalWaits.flowVersionId),
        eq(flowRuns.ownerUserId, flowExecutionSignalWaits.ownerUserId)
      )
    )
    .innerJoin(
      flowVersions,
      and(
        eq(flowVersions.id, flowExecutionSignalWaits.flowVersionId),
        eq(flowVersions.ownerUserId, flowExecutionSignalWaits.ownerUserId)
      )
    )
    .where(
      and(
        eq(flowExecutionSignalWaits.ownerUserId, signal.ownerUserId),
        eq(flowExecutionSignalWaits.signalType, signal.signalType),
        eq(flowExecutionSignalWaits.correlationId, signal.correlationId),
        or(
          sql`${flowExecutionSignalWaits.expectedSourceEventId} is null`,
          eq(flowExecutionSignalWaits.expectedSourceEventId, signal.sourceEventId)
        ),
        eq(flowExecutionSignalWaits.state, "waiting"),
        inArray(flowExecutionTokens.state, ["waiting_signal", "waiting_external"]),
        eq(flowRuns.status, "waiting")
      )
    )
    .orderBy(asc(flowExecutionSignalWaits.createdAt), asc(flowExecutionSignalWaits.id))
    .limit(1)
    .for("update");
  if (!wait) return { status: "stored" } as const;

  const persistedDefinition = {
    flowVersionId: wait.flowVersionId,
    nodeId: wait.waitNodeId,
    nodeKind: wait.tokenNodeKind as FlowExecutionClaim["nodeKind"],
    configSchemaVersion: wait.tokenConfigSchemaVersion,
    executorContractVersion: wait.tokenExecutorContractVersion,
    graph: wait.graph,
    capabilityManifest: wait.capabilityManifest
  };
  const persistedNode = resolvePinnedFlowExecutionNode(persistedDefinition);
  const isChartWait =
    persistedNode.kind === "natal_chart_request" &&
    signal.signalType === FLOW_CHART_CALCULATION_TERMINAL_SIGNAL &&
    wait.waitSuccessHandle === "next" &&
    wait.waitFailureHandle === null;
  const isMessagingWait =
    persistedNode.kind === "send_message" &&
    signal.signalType === FLOW_MESSAGING_DELIVERY_TERMINAL_SIGNAL &&
    wait.waitSuccessHandle === "success" &&
    wait.waitFailureHandle === "error";
  if (!isChartWait && !isMessagingWait) {
    throw new Error("FLOW_RUNTIME_TRACE_INVALID: signal wait does not match its pinned node");
  }
  const transitionAt = await readPostLockDatabaseInstant(transaction);
  const terminalFailure = isChartWait && signal.outcome === "failed";
  const sourceHandle = isChartWait
    ? "next"
    : signal.outcome === "succeeded"
      ? "success"
      : "error";
  const target = terminalFailure
    ? null
    : resolvePinnedFlowExecutionAdvanceTarget({ definition: persistedDefinition, sourceHandle });
  const [transitionedToken] = await transaction
    .update(flowExecutionTokens)
    .set(
      terminalFailure
        ? {
            state: "failed",
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            failureDisposition: "failed_terminal",
            failureReasonCode: "FLOW_CHART_CALCULATION_FAILED",
            terminalAt: transitionAt,
            quarantinedAt: null,
            updatedAt: transitionAt
          }
        : {
            nodeId: target?.node.id,
            nodeKind: target?.node.kind,
            configSchemaVersion: target?.node.configSchemaVersion,
            executorContractVersion: target?.node.executorContractVersion,
            executorKey: target ? formatFlowNodeExecutorKey(target.node) : undefined,
            state: "runnable",
            availableAt: transitionAt,
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            nodeActivationSequence: sql`${flowExecutionTokens.nodeActivationSequence} + 1`,
            attemptCounter: 0n,
            failureDisposition: null,
            failureReasonCode: null,
            terminalAt: null,
            quarantinedAt: null,
            updatedAt: transitionAt
          }
    )
    .where(
      and(
        eq(flowExecutionTokens.id, wait.tokenId),
        inArray(flowExecutionTokens.state, ["waiting_signal", "waiting_external"]),
        eq(flowExecutionTokens.nodeActivationSequence, wait.tokenNodeActivationSequence)
      )
    )
    .returning({ id: flowExecutionTokens.id });
  if (!transitionedToken) return { status: "stored" } as const;

  const [run] = await transaction
    .update(flowRuns)
    .set({
      status: terminalFailure ? "failed_terminal" : "running",
      currentNodeId: terminalFailure ? wait.waitNodeId : target?.node.id,
      traceSequence: sql`${flowRuns.traceSequence} + 1`,
      completedAt: terminalFailure ? transitionAt : null,
      updatedAt: transitionAt
    })
    .where(
      and(
        eq(flowRuns.id, wait.runId),
        eq(flowRuns.ownerUserId, signal.ownerUserId),
        eq(flowRuns.flowVersionId, wait.flowVersionId),
        eq(flowRuns.status, "waiting")
      )
    )
    .returning({ traceSequence: flowRuns.traceSequence });
  if (!run) throw new Error("Flow run became unavailable while consuming a terminal signal");

  const [consumedWait] = await transaction
    .update(flowExecutionSignalWaits)
    .set({ state: "consumed", consumedSignalId: signal.id, consumedAt: transitionAt })
    .where(and(eq(flowExecutionSignalWaits.id, wait.waitId), eq(flowExecutionSignalWaits.state, "waiting")))
    .returning({ id: flowExecutionSignalWaits.id });
  if (!consumedWait) throw new Error("Flow signal wait became unavailable while consuming a terminal signal");
  const [consumedSignal] = await transaction
    .update(flowExecutionSignalInbox)
    .set({ consumedAt: transitionAt })
    .where(and(eq(flowExecutionSignalInbox.id, signal.id), sql`${flowExecutionSignalInbox.consumedAt} is null`))
    .returning({ id: flowExecutionSignalInbox.id });
  if (!consumedSignal) throw new Error("Flow signal inbox row became unavailable while consuming a terminal signal");

  const trace = terminalFailure
    ? {
        schemaVersion: "flow-runtime-trace.v1" as const,
        outcome: "failed" as const,
        nodeKind: "natal_chart_request" as const,
        reasonCode: "FLOW_CHART_CALCULATION_FAILED" as const,
        resultCode: "FLOW_EXECUTION_FAILED_TERMINAL" as const
      }
    : isChartWait
      ? {
        schemaVersion: "flow-runtime-trace.v1" as const,
        outcome: "advanced" as const,
        nodeKind: "natal_chart_request" as const,
        reasonCode: "FLOW_CHART_CALCULATION_COMPLETED" as const,
        resultCode: "FLOW_TOKEN_ADVANCED" as const,
        sourceHandle: "next" as const,
        selectedEdgeId: target!.edgeId,
        targetNodeId: target!.node.id,
        targetNodeKind: target!.node.kind
      }
      : {
          schemaVersion: "flow-runtime-trace.v1" as const,
          outcome: "advanced" as const,
          nodeKind: "send_message" as const,
          reasonCode: "FLOW_MESSAGING_DELIVERY_COMPLETED" as const,
          resultCode: "FLOW_TOKEN_ADVANCED" as const,
          sourceHandle,
          selectedEdgeId: target!.edgeId,
          targetNodeId: target!.node.id,
          targetNodeKind: target!.node.kind
        };
  await transaction.insert(flowRunEvents).values({
    ownerUserId: signal.ownerUserId,
    flowRunId: wait.runId,
    sequence: run.traceSequence,
    eventType: terminalFailure ? "run_failed" : "token_signaled",
    nodeId: wait.waitNodeId,
    summary: trace,
    occurredAt: transitionAt
  });
  return { status: "consumed", runId: wait.runId, traceSequence: run.traceSequence };
}

function validateFlowExecutionSignalInput(
  input: Parameters<FlowExecutionSignalStore["ingest"]>[0]
): void {
  if (
    !UUID_PATTERN.test(input.sourceEventId) ||
    !UUID_PATTERN.test(input.ownerUserId) ||
    !UUID_PATTERN.test(input.correlationId) ||
    (input.signalType !== FLOW_CHART_CALCULATION_TERMINAL_SIGNAL &&
      input.signalType !== FLOW_MESSAGING_DELIVERY_TERMINAL_SIGNAL) ||
    (input.outcome !== "succeeded" && input.outcome !== "failed") ||
    Number.isNaN(Date.parse(input.occurredAt))
  ) {
    throw new Error("FLOW_EXECUTION_SIGNAL_INVALID");
  }
}

async function finalizeFailure(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["finalizeFailure"]>[0]
): ReturnType<FlowExecutionStore["finalizeFailure"]> {
  assertExecutionFailure(input.failure);

  return database.transaction(async (transaction) => {
    const [token] = await transaction
      .select({
        executorKey: flowExecutionTokens.executorKey,
        claimedAt: flowExecutionTokens.claimedAt,
        leaseExpiresAt: flowExecutionTokens.leaseExpiresAt,
        nodeActivationSequence: flowExecutionTokens.nodeActivationSequence,
        attemptNumber: flowExecutionTokens.attemptCounter,
        fencingToken: flowExecutionTokens.fencingToken,
        leaseOwner: flowExecutionTokens.leaseOwner,
        claimControlPolicyRevision: flowExecutionTokens.claimControlPolicyRevision,
        claimPolicyDigest: flowExecutionTokens.claimPolicyDigest,
        claimWorkerSessionId: flowExecutionTokens.claimWorkerSessionId,
        claimWorkerRegistrationDigest: flowExecutionTokens.claimWorkerRegistrationDigest,
        retryPolicyKey: flowExecutionTokens.retryPolicyKey,
        maxAttempts: flowExecutionTokens.maxAttempts,
        retryBaseDelayMs: flowExecutionTokens.retryBaseDelayMs,
        retryMaxDelayMs: flowExecutionTokens.retryMaxDelayMs
      })
      .from(flowExecutionTokens)
      .innerJoin(
        flowRuns,
        and(
          eq(flowRuns.id, flowExecutionTokens.flowRunId),
          eq(flowRuns.ownerUserId, flowExecutionTokens.ownerUserId),
          eq(flowRuns.flowVersionId, flowExecutionTokens.flowVersionId)
        )
      )
      .where(
        and(
          eq(flowExecutionTokens.id, input.claim.tokenId),
          eq(flowExecutionTokens.ownerUserId, input.claim.ownerUserId),
          eq(flowExecutionTokens.flowRunId, input.claim.runId),
          eq(flowExecutionTokens.flowVersionId, input.claim.flowVersionId),
          eq(flowExecutionTokens.nodeId, input.claim.nodeId),
          eq(flowExecutionTokens.nodeKind, input.claim.nodeKind),
          eq(flowExecutionTokens.configSchemaVersion, input.claim.configSchemaVersion),
          eq(flowExecutionTokens.executorContractVersion, input.claim.executorContractVersion),
          eq(flowExecutionTokens.nodeActivationSequence, input.claim.nodeActivationSequence),
          eq(
            flowExecutionTokens.executorKey,
            `${input.claim.nodeKind}:${input.claim.configSchemaVersion}:${input.claim.executorContractVersion}`
          ),
          eq(flowExecutionTokens.state, "claimed"),
          eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
          eq(flowExecutionTokens.fencingToken, input.claim.fencingToken),
          eq(flowRuns.flowId, input.claim.flowId),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .limit(1)
      .for("update", { of: flowExecutionTokens });

    if (!token) return { status: "stale" } as const;
    if (!token.claimedAt || !token.leaseOwner || !token.leaseExpiresAt) {
      throw new Error("Claimed flow token is missing database-owned audit state");
    }
    const dispositionAt = await readPostLockDatabaseInstant(transaction);
    if (token.leaseExpiresAt.getTime() <= dispositionAt.getTime()) {
      return { status: "stale" } as const;
    }
    assertPersistedRetryPolicy(token);

    const disposition = chooseFailureDisposition({
      failure: input.failure,
      attemptNumber: token.attemptNumber,
      maxAttempts: token.maxAttempts
    });
    const terminal = disposition !== "retry_scheduled";
    const resultCode = terminal
      ? input.failure.classification === "retryable"
        ? "FLOW_EXECUTION_RETRY_EXHAUSTED"
        : "FLOW_EXECUTION_FAILED_TERMINAL"
      : "FLOW_EXECUTION_RETRY_SCHEDULED";
    const trace = parseFlowRuntimeTraceSummary({
      schemaVersion: "flow-runtime-trace.v1",
      outcome: terminal ? "failed" : "retry_scheduled",
      nodeKind: input.claim.nodeKind,
      reasonCode: input.failure.reasonCode,
      resultCode
    });

    const [updatedToken] = terminal
      ? await transaction
          .update(flowExecutionTokens)
          .set({
            state: "failed",
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            failureDisposition: disposition,
            failureReasonCode: input.failure.reasonCode,
            terminalAt: dispositionAt,
            quarantinedAt: disposition === "quarantined" ? dispositionAt : null,
            updatedAt: dispositionAt
          })
          .where(
            and(
              eq(flowExecutionTokens.id, input.claim.tokenId),
              eq(flowExecutionTokens.state, "claimed"),
              eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
              eq(flowExecutionTokens.nodeActivationSequence, input.claim.nodeActivationSequence),
              eq(flowExecutionTokens.fencingToken, input.claim.fencingToken)
            )
          )
          .returning({
            dispositionAt: flowExecutionTokens.updatedAt,
            availableAt: flowExecutionTokens.availableAt
          })
      : await transaction
          .update(flowExecutionTokens)
          .set({
            state: "retry_scheduled",
            availableAt: retryAvailableAtSql({ ...token, transitionAt: dispositionAt }),
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            failureDisposition: "retry_scheduled",
            failureReasonCode: input.failure.reasonCode,
            terminalAt: null,
            quarantinedAt: null,
            updatedAt: dispositionAt
          })
          .where(
            and(
              eq(flowExecutionTokens.id, input.claim.tokenId),
              eq(flowExecutionTokens.state, "claimed"),
              eq(flowExecutionTokens.leaseOwner, input.claim.leaseOwner),
              eq(flowExecutionTokens.nodeActivationSequence, input.claim.nodeActivationSequence),
              eq(flowExecutionTokens.fencingToken, input.claim.fencingToken)
            )
          )
          .returning({
            dispositionAt: flowExecutionTokens.updatedAt,
            availableAt: flowExecutionTokens.availableAt
          });
    if (!updatedToken) return { status: "stale" } as const;

    const [run] = await transaction
      .update(flowRuns)
      .set({
        status: terminal ? "failed_terminal" : "failed_retryable",
        currentNodeId: input.claim.nodeId,
        traceSequence: sql`${flowRuns.traceSequence} + 1`,
        completedAt: terminal ? updatedToken.dispositionAt : null,
        updatedAt: updatedToken.dispositionAt
      })
      .where(
        and(
          eq(flowRuns.id, input.claim.runId),
          eq(flowRuns.ownerUserId, input.claim.ownerUserId),
          eq(flowRuns.flowId, input.claim.flowId),
          eq(flowRuns.flowVersionId, input.claim.flowVersionId),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .returning({ traceSequence: flowRuns.traceSequence });
    if (!run) throw new Error("Flow run became unavailable while finalizing its failed token");

    const [attempt] = await transaction
      .insert(flowExecutionAttempts)
      .values({
        ownerUserId: input.claim.ownerUserId,
        flowRunId: input.claim.runId,
        tokenId: input.claim.tokenId,
        flowVersionId: input.claim.flowVersionId,
        nodeId: input.claim.nodeId,
        executorKey: token.executorKey,
        nodeActivationSequence: token.nodeActivationSequence,
        attemptNumber: token.attemptNumber,
        fencingToken: token.fencingToken,
        leaseOwner: token.leaseOwner,
        controlPolicyRevision: token.claimControlPolicyRevision,
        policyDigest: token.claimPolicyDigest,
        workerSessionId: token.claimWorkerSessionId,
        workerRegistrationDigest: token.claimWorkerRegistrationDigest,
        outcome: terminal ? "failed" : "retry_scheduled",
        resultCode,
        traceSummary: trace,
        startedAt: token.claimedAt,
        completedAt: updatedToken.dispositionAt,
        createdAt: updatedToken.dispositionAt
      })
      .returning({ id: flowExecutionAttempts.id });
    if (!attempt) throw new Error("Failed flow execution attempt was not persisted");

    await transaction.insert(flowRunEvents).values({
      ownerUserId: input.claim.ownerUserId,
      flowRunId: input.claim.runId,
      sequence: run.traceSequence,
      eventType: terminal ? "run_failed" : "token_retry_scheduled",
      nodeId: input.claim.nodeId,
      attemptId: attempt.id,
      summary: trace,
      occurredAt: updatedToken.dispositionAt
    });

    return {
      status: "applied" as const,
      disposition,
      attemptId: attempt.id,
      traceSequence: run.traceSequence,
      availableAt: terminal ? null : updatedToken.availableAt.toISOString()
    };
  });
}

async function recoverExpired(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["recoverExpired"]>[0]
): ReturnType<FlowExecutionStore["recoverExpired"]> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RECOVERY_BATCH_SIZE) {
    throw new Error(`Flow recovery limit must be between 1 and ${MAX_RECOVERY_BATCH_SIZE}`);
  }
  let recoveredCount = 0;
  let retryScheduledCount = 0;
  let failedTerminalCount = 0;
  let quarantinedCount = 0;

  for (let index = 0; index < input.limit; index += 1) {
    const result = await recoverOneExpired(database);
    if (!result) break;
    recoveredCount += 1;
    if (result === "retry_scheduled") retryScheduledCount += 1;
    else if (result === "failed_terminal") failedTerminalCount += 1;
    else quarantinedCount += 1;
  }

  return { recoveredCount, retryScheduledCount, failedTerminalCount, quarantinedCount };
}

async function recoverOneExpired(
  database: ElevenHouseDatabase
): Promise<"retry_scheduled" | "failed_terminal" | "quarantined" | null> {
  return database.transaction(async (transaction) => {
    const [token] = await transaction
      .select({
        id: flowExecutionTokens.id,
        ownerUserId: flowExecutionTokens.ownerUserId,
        flowRunId: flowExecutionTokens.flowRunId,
        flowId: flowRuns.flowId,
        flowVersionId: flowExecutionTokens.flowVersionId,
        nodeId: flowExecutionTokens.nodeId,
        nodeKind: flowExecutionTokens.nodeKind,
        executorKey: flowExecutionTokens.executorKey,
        claimedAt: flowExecutionTokens.claimedAt,
        leaseOwner: flowExecutionTokens.leaseOwner,
        leaseExpiresAt: flowExecutionTokens.leaseExpiresAt,
        claimControlPolicyRevision: flowExecutionTokens.claimControlPolicyRevision,
        claimPolicyDigest: flowExecutionTokens.claimPolicyDigest,
        claimWorkerSessionId: flowExecutionTokens.claimWorkerSessionId,
        claimWorkerRegistrationDigest: flowExecutionTokens.claimWorkerRegistrationDigest,
        nodeActivationSequence: flowExecutionTokens.nodeActivationSequence,
        attemptCounter: flowExecutionTokens.attemptCounter,
        fencingToken: flowExecutionTokens.fencingToken,
        retryPolicyKey: flowExecutionTokens.retryPolicyKey,
        maxAttempts: flowExecutionTokens.maxAttempts,
        retryBaseDelayMs: flowExecutionTokens.retryBaseDelayMs,
        retryMaxDelayMs: flowExecutionTokens.retryMaxDelayMs
      })
      .from(flowExecutionTokens)
      .innerJoin(
        flowRuns,
        and(
          eq(flowRuns.id, flowExecutionTokens.flowRunId),
          eq(flowRuns.ownerUserId, flowExecutionTokens.ownerUserId),
          eq(flowRuns.flowVersionId, flowExecutionTokens.flowVersionId)
        )
      )
      .where(
        and(
          eq(flowExecutionTokens.state, "claimed"),
          isNotNull(flowExecutionTokens.leaseExpiresAt),
          or(
            lte(flowExecutionTokens.leaseExpiresAt, sql`clock_timestamp()`),
            gt(flowExecutionTokens.claimedAt, sql`clock_timestamp()`)
          ),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .orderBy(asc(flowExecutionTokens.leaseExpiresAt), asc(flowExecutionTokens.id))
      .limit(1)
      .for("update", { of: flowExecutionTokens, skipLocked: true });

    if (!token) return null;
    if (!token.claimedAt || !token.leaseOwner || !token.leaseExpiresAt) {
      throw new Error("Expired flow token has incomplete lease state");
    }
    const recoveredAt = await readPostLockDatabaseInstant(transaction);
    const expiredToken = token as ExpiredFlowExecutionToken;
    if (!isExpiredClaimRuntimeStateValid(expiredToken, recoveredAt)) {
      return quarantineInvalidExpiredClaim(transaction, expiredToken, recoveredAt);
    }

    const retryScheduled = expiredToken.attemptCounter < BigInt(expiredToken.maxAttempts);
    const disposition = retryScheduled ? "retry_scheduled" : "failed_terminal";
    const summary = parseFlowRuntimeTraceSummary(
      retryScheduled
        ? {
            schemaVersion: "flow-runtime-trace.v1",
            outcome: "lease_expired",
            nodeKind: expiredToken.nodeKind,
            reasonCode: "FLOW_TOKEN_LEASE_EXPIRED",
            resultCode: "FLOW_TOKEN_LEASE_EXPIRED"
          }
        : {
            schemaVersion: "flow-runtime-trace.v1",
            outcome: "failed",
            nodeKind: expiredToken.nodeKind,
            reasonCode: "FLOW_TOKEN_LEASE_EXPIRED",
            resultCode: "FLOW_EXECUTION_RETRY_EXHAUSTED"
          }
    );

    const [recovered] = retryScheduled
      ? await transaction
          .update(flowExecutionTokens)
          .set({
            state: "retry_scheduled",
            availableAt: retryAvailableAtSql({
              attemptNumber: expiredToken.attemptCounter,
              retryBaseDelayMs: expiredToken.retryBaseDelayMs,
              retryMaxDelayMs: expiredToken.retryMaxDelayMs,
              transitionAt: recoveredAt
            }),
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            fencingToken: sql`${flowExecutionTokens.fencingToken} + 1`,
            failureDisposition: "retry_scheduled",
            failureReasonCode: "FLOW_TOKEN_LEASE_EXPIRED",
            terminalAt: null,
            quarantinedAt: null,
            updatedAt: recoveredAt
          })
          .where(
            and(
              eq(flowExecutionTokens.id, expiredToken.id),
              eq(flowExecutionTokens.state, "claimed"),
              eq(flowExecutionTokens.leaseOwner, expiredToken.leaseOwner),
              eq(flowExecutionTokens.fencingToken, expiredToken.fencingToken)
            )
          )
          .returning({ recoveredAt: flowExecutionTokens.updatedAt })
      : await transaction
          .update(flowExecutionTokens)
          .set({
            state: "failed",
            claimedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            fencingToken: sql`${flowExecutionTokens.fencingToken} + 1`,
            failureDisposition: "failed_terminal",
            failureReasonCode: "FLOW_TOKEN_LEASE_EXPIRED",
            terminalAt: recoveredAt,
            quarantinedAt: null,
            updatedAt: recoveredAt
          })
          .where(
            and(
              eq(flowExecutionTokens.id, expiredToken.id),
              eq(flowExecutionTokens.state, "claimed"),
              eq(flowExecutionTokens.leaseOwner, expiredToken.leaseOwner),
              eq(flowExecutionTokens.fencingToken, expiredToken.fencingToken)
            )
          )
          .returning({ recoveredAt: flowExecutionTokens.updatedAt });
    if (!recovered) throw new Error("Locked expired flow token could not be recovered");

    const [run] = await transaction
      .update(flowRuns)
      .set({
        status: retryScheduled ? "failed_retryable" : "failed_terminal",
        traceSequence: sql`${flowRuns.traceSequence} + 1`,
        completedAt: retryScheduled ? null : recovered.recoveredAt,
        updatedAt: recovered.recoveredAt
      })
      .where(
        and(
          eq(flowRuns.id, expiredToken.flowRunId),
          eq(flowRuns.ownerUserId, expiredToken.ownerUserId),
          eq(flowRuns.flowVersionId, expiredToken.flowVersionId),
          inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
        )
      )
      .returning({ traceSequence: flowRuns.traceSequence });
    if (!run) throw new Error("Flow run became unavailable while recovering its token");

    const [attempt] = await transaction
      .insert(flowExecutionAttempts)
      .values({
        ownerUserId: expiredToken.ownerUserId,
        flowRunId: expiredToken.flowRunId,
        tokenId: expiredToken.id,
        flowVersionId: expiredToken.flowVersionId,
        nodeId: expiredToken.nodeId,
        executorKey: expiredToken.executorKey,
        nodeActivationSequence: expiredToken.nodeActivationSequence,
        attemptNumber: expiredToken.attemptCounter,
        fencingToken: expiredToken.fencingToken,
        leaseOwner: expiredToken.leaseOwner,
        controlPolicyRevision: expiredToken.claimControlPolicyRevision,
        policyDigest: expiredToken.claimPolicyDigest,
        workerSessionId: expiredToken.claimWorkerSessionId,
        workerRegistrationDigest: expiredToken.claimWorkerRegistrationDigest,
        outcome: retryScheduled ? "lease_expired" : "failed",
        resultCode: retryScheduled ? "FLOW_TOKEN_LEASE_EXPIRED" : "FLOW_EXECUTION_RETRY_EXHAUSTED",
        traceSummary: summary,
        startedAt: expiredToken.claimedAt,
        completedAt: recovered.recoveredAt,
        createdAt: recovered.recoveredAt
      })
      .returning({ id: flowExecutionAttempts.id });
    if (!attempt) throw new Error("Expired flow execution attempt was not persisted");

    await transaction.insert(flowRunEvents).values({
      ownerUserId: expiredToken.ownerUserId,
      flowRunId: expiredToken.flowRunId,
      sequence: run.traceSequence,
      eventType: retryScheduled ? "token_lease_expired" : "run_failed",
      nodeId: expiredToken.nodeId,
      attemptId: attempt.id,
      summary,
      occurredAt: recovered.recoveredAt
    });

    return disposition;
  });
}

async function getRunDetail(
  database: ElevenHouseDatabase,
  input: Parameters<FlowExecutionStore["getRunDetail"]>[0]
): ReturnType<FlowExecutionStore["getRunDetail"]> {
  return database.transaction(
    async (transaction) => {
      const [run] = await transaction
        .select({
          runId: flowRuns.id,
          ownerUserId: flowRuns.ownerUserId,
          flowId: flowRuns.flowId,
          flowVersionId: flowRuns.flowVersionId,
          graphSchemaVersion: flowVersions.graphSchemaVersion,
          status: flowRuns.status,
          currentNodeId: flowRuns.currentNodeId,
          traceSequence: flowRuns.traceSequence
        })
        .from(flowRuns)
        .innerJoin(
          flowVersions,
          and(
            eq(flowVersions.id, flowRuns.flowVersionId),
            eq(flowVersions.ownerUserId, flowRuns.ownerUserId)
          )
        )
        .where(and(eq(flowRuns.id, input.runId), eq(flowRuns.ownerUserId, input.ownerUserId)))
        .limit(1);

      if (!run || run.graphSchemaVersion !== "flow-graph.v2") return null;

      const token = await transaction
        .select()
        .from(flowExecutionTokens)
        .where(
          and(
            eq(flowExecutionTokens.flowRunId, input.runId),
            eq(flowExecutionTokens.ownerUserId, input.ownerUserId)
          )
        )
        .limit(1);
      const attempts = await transaction
        .select()
        .from(flowExecutionAttempts)
        .where(
          and(
            eq(flowExecutionAttempts.flowRunId, input.runId),
            eq(flowExecutionAttempts.ownerUserId, input.ownerUserId)
          )
        );
      const events = await transaction
        .select()
        .from(flowRunEvents)
        .where(
          and(
            eq(flowRunEvents.flowRunId, input.runId),
            eq(flowRunEvents.ownerUserId, input.ownerUserId)
          )
        )
        .orderBy(asc(flowRunEvents.sequence), asc(flowRunEvents.id));

      const persistedToken = token[0];
      if (!persistedToken) throw new Error("V2 flow run is missing its execution token");
      if ((events.at(-1)?.sequence ?? 0n) !== run.traceSequence) {
        throw new Error("Flow run trace sequence does not match its append-only events");
      }
      const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
      const orderedAttempts = events.flatMap((event) => {
        if (!event.attemptId) return [];
        const attempt = attemptsById.get(event.attemptId);
        if (!attempt) throw new Error("Flow run event references a missing execution attempt");
        assertCausalExecutionPair(attempt, event);
        return [attempt];
      });
      if (orderedAttempts.length !== attempts.length) {
        throw new Error("Flow execution attempt is missing its causal run event");
      }

      return {
        ...run,
        graphSchemaVersion: "flow-graph.v2",
        token: toTokenDetail(persistedToken),
        attempts: orderedAttempts.map(toAttemptDetail),
        events: events.map(toEventDetail)
      } satisfies FlowExecutionRunDetail;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

function assertExecutionFailure(failure: FlowExecutionFailure): void {
  if (!FAILURE_REASON_CODES.has(failure.reasonCode)) {
    throw new Error("Flow execution failure reason is not accepted by node finalization");
  }
  if (
    (failure.classification === "retryable" &&
      !RETRYABLE_FAILURE_REASON_CODES.has(failure.reasonCode)) ||
    (failure.classification === "permanent" &&
      !PERMANENT_FAILURE_REASON_CODES.has(failure.reasonCode))
  ) {
    throw new Error("Flow execution failure classification does not match its reason");
  }
}

function chooseFailureDisposition(input: {
  readonly failure: FlowExecutionFailure;
  readonly attemptNumber: bigint;
  readonly maxAttempts: number;
}): FlowExecutionFailureDisposition {
  if (input.failure.classification === "permanent") {
    return INTEGRITY_QUARANTINE_REASON_CODES.has(input.failure.reasonCode)
      ? "quarantined"
      : "failed_terminal";
  }

  const effectiveMaxAttempts =
    input.failure.reasonCode === "FLOW_NODE_EXECUTION_UNEXPECTED_FAILURE"
      ? Math.min(input.maxAttempts, 2)
      : input.maxAttempts;
  return input.attemptNumber < BigInt(effectiveMaxAttempts) ? "retry_scheduled" : "failed_terminal";
}

function assertPersistedRetryPolicy(input: {
  readonly retryPolicyKey: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
}): void {
  if (!isPersistedRetryPolicySupported(input)) {
    throw new Error("Flow execution token contains an unsupported retry policy snapshot");
  }
}

function isPersistedRetryPolicySupported(input: {
  readonly retryPolicyKey: string;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
}): boolean {
  return (
    input.retryPolicyKey === flowExecutionRetryPolicyV1.key &&
    input.maxAttempts === flowExecutionRetryPolicyV1.maxAttempts &&
    input.retryBaseDelayMs === flowExecutionRetryPolicyV1.baseDelayMs &&
    input.retryMaxDelayMs === flowExecutionRetryPolicyV1.maxDelayMs
  );
}

type PersistedFlowBookingExecutionContextEvidence = {
  readonly ownerUserId: string;
  readonly enrollmentSnapshot: unknown;
  readonly runtimeEventSource: string;
  readonly runtimeEventSubjectType: string;
  readonly runtimeEventSubjectId: string;
  readonly bookingId: string | null;
  readonly bookingOwnerUserId: string | null;
  readonly bookingState: string | null;
  readonly bookingLifecycleRevision: number | null;
  readonly bookingStartAt: Date | null;
  readonly bookingEndAt: Date | null;
  readonly bookingTimeZone: string | null;
  readonly lifecycleHeadBookingId: string | null;
  readonly lifecycleHeadOwnerUserId: string | null;
  readonly lifecycleHeadAppliedRevision: number | null;
  readonly lifecycleHeadState: string | null;
  readonly lifecycleHeadStartAt: Date | null;
  readonly lifecycleHeadEndAt: Date | null;
  readonly lifecycleHeadTimeZone: string | null;
  readonly lifecycleHeadEventId: string | null;
  readonly lifecycleHeadCanonicalDigest: string | null;
};

function resolvePersistedFlowBookingExecutionContext(
  evidence: PersistedFlowBookingExecutionContextEvidence,
  requireAggregateFreshness: boolean
): ReturnType<typeof resolveFlowBookingExecutionContext> {
  return resolveFlowBookingExecutionContext({
    enrollmentSnapshot: evidence.enrollmentSnapshot,
    ownerUserId: evidence.ownerUserId,
    runtimeEvent: {
      source: evidence.runtimeEventSource,
      subjectType: evidence.runtimeEventSubjectType,
      subjectId: evidence.runtimeEventSubjectId
    },
    booking: toFlowBookingExecutionAggregate(evidence),
    lifecycleHead: toFlowBookingExecutionLifecycleHead(evidence),
    requireAggregateFreshness
  });
}

function toFlowBookingExecutionAggregate(evidence: PersistedFlowBookingExecutionContextEvidence) {
  if (evidence.bookingId === null) return null;
  if (
    evidence.bookingOwnerUserId === null ||
    evidence.bookingState === null ||
    evidence.bookingLifecycleRevision === null ||
    evidence.bookingStartAt === null ||
    evidence.bookingEndAt === null ||
    evidence.bookingTimeZone === null
  ) {
    throw new FlowBookingExecutionContextIntegrityError(
      "the joined Booking aggregate is incomplete"
    );
  }
  return {
    id: evidence.bookingId,
    ownerUserId: evidence.bookingOwnerUserId,
    state: evidence.bookingState,
    lifecycleRevision: evidence.bookingLifecycleRevision,
    schedule: {
      startAt: evidence.bookingStartAt.toISOString(),
      endAt: evidence.bookingEndAt.toISOString(),
      timeZone: evidence.bookingTimeZone
    }
  };
}

function toFlowBookingExecutionLifecycleHead(
  evidence: PersistedFlowBookingExecutionContextEvidence
) {
  if (evidence.lifecycleHeadBookingId === null) return null;
  if (
    evidence.lifecycleHeadOwnerUserId === null ||
    evidence.lifecycleHeadAppliedRevision === null ||
    evidence.lifecycleHeadState === null ||
    evidence.lifecycleHeadEventId === null ||
    evidence.lifecycleHeadCanonicalDigest === null
  ) {
    throw new FlowBookingExecutionContextIntegrityError(
      "the joined Flow Booking lifecycle head is incomplete"
    );
  }
  const schedule =
    evidence.lifecycleHeadStartAt &&
    evidence.lifecycleHeadEndAt &&
    evidence.lifecycleHeadTimeZone
      ? {
          startAt: evidence.lifecycleHeadStartAt.toISOString(),
          endAt: evidence.lifecycleHeadEndAt.toISOString(),
          timeZone: evidence.lifecycleHeadTimeZone
        }
      : null;
  return {
    bookingId: evidence.lifecycleHeadBookingId,
    ownerUserId: evidence.lifecycleHeadOwnerUserId,
    appliedRevision: evidence.lifecycleHeadAppliedRevision,
    state: evidence.lifecycleHeadState as "confirmed" | "cancelled",
    schedule,
    lastLifecycleEventId: evidence.lifecycleHeadEventId,
    lastCanonicalDigest: evidence.lifecycleHeadCanonicalDigest as `sha256:${string}`
  };
}

function requireBookingLifecycleRevision(
  context: FlowExecutionClaim["bookingLifecycleContext"]
): number {
  if (!context) {
    throw new FlowBookingExecutionContextIntegrityError(
      "a booking-relative deadline requires an applied Booking lifecycle context"
    );
  }
  return context.appliedRevision;
}

function isClaimCandidateRuntimeStateValid(candidate: PoisonFlowExecutionCandidate): boolean {
  if (
    !isPersistedRetryPolicySupported(candidate) ||
    (candidate.state !== "runnable" && candidate.state !== "retry_scheduled") ||
    candidate.attemptCounter < 0n ||
    candidate.attemptCounter >= BigInt(candidate.maxAttempts) ||
    candidate.fencingToken < candidate.attemptCounter ||
    candidate.terminalAt !== null ||
    candidate.quarantinedAt !== null
  ) {
    return false;
  }

  if (candidate.state === "runnable") {
    return candidate.failureDisposition === null && candidate.failureReasonCode === null;
  }
  return (
    candidate.attemptCounter > 0n &&
    candidate.failureDisposition === "retry_scheduled" &&
    candidate.failureReasonCode !== null &&
    RETRY_SCHEDULED_FAILURE_REASON_CODES.has(candidate.failureReasonCode)
  );
}

function isExpiredClaimRuntimeStateValid(
  token: ExpiredFlowExecutionToken,
  recoveredAt: Date
): boolean {
  return (
    isPersistedRetryPolicySupported(token) &&
    token.attemptCounter > 0n &&
    token.attemptCounter <= BigInt(token.maxAttempts) &&
    token.fencingToken >= token.attemptCounter &&
    token.claimedAt.getTime() <= token.leaseExpiresAt.getTime() &&
    token.claimedAt.getTime() <= recoveredAt.getTime() &&
    token.leaseExpiresAt.getTime() <= recoveredAt.getTime()
  );
}

async function readPostLockDatabaseInstant(transaction: FlowTransaction): Promise<Date> {
  const result = await transaction.execute(
    sql<{ transitionEpochMs: string }>`
      select (extract(epoch from clock_timestamp()) * 1000)::text as "transitionEpochMs"
    `
  );
  const clock = result.rows[0];
  const transitionAt = parseFlowDatabaseEpochMilliseconds(clock?.transitionEpochMs);
  if (!transitionAt) {
    throw new Error("Database did not return a valid post-lock flow transition timestamp");
  }
  return transitionAt;
}

async function quarantineInvalidExpiredClaim(
  transaction: FlowTransaction,
  token: ExpiredFlowExecutionToken,
  quarantinedAt: Date
): Promise<"quarantined"> {
  const reasonCode = "FLOW_TOKEN_RUNTIME_STATE_INVALID" as const;
  const summary = parseFlowRuntimeTraceSummary({
    schemaVersion: "flow-runtime-trace.v1",
    outcome: "failed",
    nodeKind: token.nodeKind,
    reasonCode,
    resultCode: "FLOW_EXECUTION_FAILED_TERMINAL"
  });

  const [quarantinedToken] = await transaction
    .update(flowExecutionTokens)
    .set({
      state: "failed",
      claimedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      fencingToken: sql`greatest(
        ${flowExecutionTokens.fencingToken} + 1,
        ${flowExecutionTokens.attemptCounter},
        1
      )`,
      failureDisposition: "quarantined",
      failureReasonCode: reasonCode,
      terminalAt: quarantinedAt,
      quarantinedAt,
      updatedAt: quarantinedAt
    })
    .where(
      and(
        eq(flowExecutionTokens.id, token.id),
        eq(flowExecutionTokens.ownerUserId, token.ownerUserId),
        eq(flowExecutionTokens.flowRunId, token.flowRunId),
        eq(flowExecutionTokens.state, "claimed"),
        eq(flowExecutionTokens.leaseOwner, token.leaseOwner),
        eq(flowExecutionTokens.fencingToken, token.fencingToken)
      )
    )
    .returning({ id: flowExecutionTokens.id });
  if (!quarantinedToken) {
    throw new Error("Locked invalid expired flow token could not be quarantined");
  }

  const [run] = await transaction
    .update(flowRuns)
    .set({
      status: "failed_terminal",
      currentNodeId: token.nodeId,
      traceSequence: sql`${flowRuns.traceSequence} + 1`,
      completedAt: quarantinedAt,
      updatedAt: quarantinedAt
    })
    .where(
      and(
        eq(flowRuns.id, token.flowRunId),
        eq(flowRuns.ownerUserId, token.ownerUserId),
        eq(flowRuns.flowId, token.flowId),
        eq(flowRuns.flowVersionId, token.flowVersionId),
        inArray(flowRuns.status, [...CLAIMABLE_RUN_STATUSES])
      )
    )
    .returning({ traceSequence: flowRuns.traceSequence });
  if (!run) throw new Error("Flow run became unavailable while quarantining its invalid token");

  await transaction.insert(flowRunEvents).values({
    ownerUserId: token.ownerUserId,
    flowRunId: token.flowRunId,
    sequence: run.traceSequence,
    eventType: "run_failed",
    nodeId: token.nodeId,
    attemptId: null,
    summary,
    occurredAt: quarantinedAt
  });

  return "quarantined";
}

function retryAvailableAtSql(input: {
  readonly attemptNumber: bigint;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly transitionAt: Date;
}) {
  const exponent = Math.max(0, Math.min(Number(input.attemptNumber) - 1, 19));
  const cappedDelayMs = Math.min(input.retryMaxDelayMs, input.retryBaseDelayMs * 2 ** exponent);
  const minimumDelayMs = Math.max(1, Math.floor(cappedDelayMs / 2));
  const jitterWidthMs = cappedDelayMs - minimumDelayMs + 1;
  return sql`${input.transitionAt}::timestamptz + (
    ${minimumDelayMs} + floor(random() * ${jitterWidthMs})
  ) * interval '1 millisecond'`;
}

function validateClaimInput(input: Parameters<FlowExecutionStore["claimNext"]>[0]): void {
  if (!input.leaseOwner.trim() || input.leaseOwner.length > 180) {
    throw new Error("Flow execution lease owner must contain 1 to 180 characters");
  }
  if (
    !Number.isInteger(input.leaseDurationMs) ||
    input.leaseDurationMs < 1 ||
    input.leaseDurationMs > MAX_LEASE_DURATION_MS
  ) {
    throw new Error(
      `Flow execution lease duration must be between 1 and ${MAX_LEASE_DURATION_MS} ms`
    );
  }
  validateExecutorKeys(input.executorKeys);
  validateOwnerScope(input.ownerScope);
}

function validateExecutorKeys(executorKeys: readonly FlowNodeExecutorKey[]): void {
  if (executorKeys.length < 1 || executorKeys.length > 200) {
    throw new Error("Flow execution claim requires 1 to 200 executor keys");
  }
  if (new Set(executorKeys).size !== executorKeys.length) {
    throw new Error("Flow execution claim executor keys must be unique");
  }
}

function validateOwnerScope(ownerScope: FlowExecutionOwnerScope): void {
  if (ownerScope.kind === "all") return;
  if (ownerScope.kind !== "allowlist" && ownerScope.kind !== "denylist") {
    throw new Error("Flow execution owner scope is unsupported");
  }
  if (
    ownerScope.ownerUserIds.length < 1 ||
    ownerScope.ownerUserIds.length > MAX_FLOW_EXECUTION_CANARY_OWNERS
  ) {
    throw new Error(
      `Flow execution owner scope requires 1 to ${MAX_FLOW_EXECUTION_CANARY_OWNERS} owners`
    );
  }
  if (
    ownerScope.ownerUserIds.some((ownerUserId) => !UUID_PATTERN.test(ownerUserId)) ||
    new Set(ownerScope.ownerUserIds.map((ownerUserId) => ownerUserId.toLowerCase())).size !==
      ownerScope.ownerUserIds.length
  ) {
    throw new Error(
      ownerScope.kind === "allowlist"
        ? "Flow execution canary owner ids must be unique UUIDs"
        : "Flow execution denied owner ids must be unique UUIDs"
    );
  }
}

function validateWorkerIdentity(identity: FlowWorkerExecutionIdentity): void {
  if (
    !identity.instanceId ||
    identity.instanceId.length > 180 ||
    !/^[A-Za-z0-9._:-]+$/.test(identity.instanceId) ||
    !UUID_PATTERN.test(identity.sessionId)
  ) {
    throw new FlowRuntimeControlIntegrityError();
  }
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toTokenDetail(row: typeof flowExecutionTokens.$inferSelect): FlowExecutionTokenDetail {
  assertPersistedRetryPolicy(row);
  return {
    id: row.id,
    nodeId: row.nodeId,
    executorKey: row.executorKey as FlowNodeExecutorKey,
    state: row.state,
    nodeActivationSequence: row.nodeActivationSequence,
    attemptCounter: row.attemptCounter,
    fencingToken: row.fencingToken,
    retryPolicy: {
      key: flowExecutionRetryPolicyV1.key,
      maxAttempts: row.maxAttempts,
      baseDelayMs: row.retryBaseDelayMs,
      maxDelayMs: row.retryMaxDelayMs
    },
    failureDisposition: row.failureDisposition as FlowExecutionFailureDisposition | null,
    failureReasonCode: row.failureReasonCode as FlowExecutionFailureReasonCode | null,
    availableAt: row.availableAt.toISOString(),
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
    claimAuthority: toClaimAuthorityEvidence({
      controlPolicyRevision: row.claimControlPolicyRevision,
      policyDigest: row.claimPolicyDigest,
      workerSessionId: row.claimWorkerSessionId,
      workerRegistrationDigest: row.claimWorkerRegistrationDigest
    }),
    terminalAt: row.terminalAt?.toISOString() ?? null,
    quarantinedAt: row.quarantinedAt?.toISOString() ?? null
  };
}

function toAttemptDetail(
  row: typeof flowExecutionAttempts.$inferSelect
): FlowExecutionAttemptDetail {
  return {
    id: row.id,
    nodeId: row.nodeId,
    executorKey: row.executorKey as FlowNodeExecutorKey,
    nodeActivationSequence: row.nodeActivationSequence,
    attemptNumber: row.attemptNumber,
    fencingToken: row.fencingToken,
    leaseOwner: row.leaseOwner,
    claimAuthority: toClaimAuthorityEvidence({
      controlPolicyRevision: row.controlPolicyRevision,
      policyDigest: row.policyDigest,
      workerSessionId: row.workerSessionId,
      workerRegistrationDigest: row.workerRegistrationDigest
    }),
    outcome: row.outcome,
    resultCode: row.resultCode,
    traceSummary: row.traceSummary,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString()
  };
}

function toClaimAuthorityEvidence(input: {
  readonly controlPolicyRevision: number | null;
  readonly policyDigest: string | null;
  readonly workerSessionId: string | null;
  readonly workerRegistrationDigest: string | null;
}): FlowExecutionClaimAuthorityEvidence | null {
  const controlPolicyRevision = input.controlPolicyRevision;
  if (
    input.controlPolicyRevision === null &&
    input.policyDigest === null &&
    input.workerSessionId === null &&
    input.workerRegistrationDigest === null
  ) {
    return null;
  }
  if (
    controlPolicyRevision === null ||
    !Number.isSafeInteger(controlPolicyRevision) ||
    controlPolicyRevision < 1 ||
    !input.policyDigest ||
    !/^sha256:[a-f0-9]{64}$/.test(input.policyDigest) ||
    !input.workerSessionId ||
    !UUID_PATTERN.test(input.workerSessionId) ||
    !input.workerRegistrationDigest ||
    !/^sha256:[a-f0-9]{64}$/.test(input.workerRegistrationDigest)
  ) {
    throw new FlowRuntimeControlIntegrityError();
  }
  return {
    controlPolicyRevision,
    policyDigest: input.policyDigest as `sha256:${string}`,
    workerSessionId: input.workerSessionId,
    workerRegistrationDigest: input.workerRegistrationDigest as `sha256:${string}`
  };
}

function toEventDetail(row: typeof flowRunEvents.$inferSelect): FlowRunEventDetail {
  return {
    id: row.id,
    sequence: row.sequence,
    eventType: row.eventType,
    nodeId: row.nodeId,
    attemptId: row.attemptId,
    summary: row.summary,
    occurredAt: row.occurredAt.toISOString()
  };
}

function assertNeverFlowExecutionDecision(decision: never): never {
  void decision;
  throw new Error("FLOW_RUNTIME_TRACE_INVALID: unsupported execution decision");
}

function assertCausalExecutionPair(
  attempt: typeof flowExecutionAttempts.$inferSelect,
  event: typeof flowRunEvents.$inferSelect
): void {
  if (
    event.nodeId !== attempt.nodeId ||
    event.eventType !== EVENT_TYPE_BY_ATTEMPT_OUTCOME[attempt.outcome] ||
    !isDeepStrictEqual(event.summary, attempt.traceSummary)
  ) {
    throw new Error("Flow causal event does not match its execution attempt");
  }
}
