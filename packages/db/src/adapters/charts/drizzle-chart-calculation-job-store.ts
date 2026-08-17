import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import {
  chartExecutionProfileSchema,
  chartMethodVersions,
  chartResultSchema,
  isReproducibleChartResult,
  type ChartExecutionProfile,
  type ChartInterpretationMode,
  type ChartResult,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import {
  buildChartJobInputSnapshotForResult,
  buildChartCalculationRequestFingerprint,
  buildChartJobRequestFingerprint,
  buildChartResultReproducibilityFingerprint,
  assertStoredChartCalculationIntegrity,
  canonicalizeChartExecutionProfile,
  ChartCalculationCompletionError,
  ChartCalculationReplacementError,
  ChartParticipantRelationshipInactiveError,
  ChartStoredResultIntegrityError,
  CHART_CALCULATION_REQUESTED_EVENT,
  CHART_CALCULATION_TERMINAL_EVENT,
  sha256CanonicalJson,
  stableJson,
  type CanonicalJson,
  type ChartCalculationCommandStore,
  type ChartCalculationJobStore,
  type ChartCalculationParticipant,
  type ChartJobAttemptFailureOutcome,
  type ChartJobDeliveryState,
  type ChartJobProcessingStore,
  type ClaimChartJobOutcome,
  type CreateOrReuseChartJobInput,
  type CreateOrReuseChartJobResult,
  type CreateOrReuseNatalJobResult
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import {
  calculationParticipants,
  calculationRecords,
  chartCalculationJobs,
  clientAstrologerRelationships,
  clientProfiles,
  clientRelatedBirthProfiles,
  outboxEvents
} from "../../schema";
import {
  chartCalculationJobReturningColumns,
  parseChartDatabaseTimestamp,
  parseChartCalculationParticipants,
  parseChartInterpretationMode,
  toChartCalculationJob,
  toChartJobForProcessing,
  toChartJobLease,
  type ChartCalculationJobReturningRow,
  type ChartCalculationJobRow
} from "./chart-calculation-job-row";
import {
  replaceCalculationResultWithInvalidation,
  type ReplaceCalculationResultWithInvalidationOutcome
} from "./chart-calculation-replacement";
import {
  isCalculationExactKeyUniqueViolation,
  lockCalculationExactKey
} from "../calculations/calculation-exact-key";

type ChartTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ChartDatabase = ElevenHouseDatabase | ChartTransaction;
type CalculationRecordRow = typeof calculationRecords.$inferSelect;
type CalculationParticipantRow = typeof calculationParticipants.$inferSelect;
const maximumLeaseMs = 24 * 60 * 60 * 1_000;
const maximumRetryDelayMs = 24 * 60 * 60 * 1_000;
const maximumWorkerOperationTimeoutMs = 60_000;
const defaultWorkerOperationTimeoutMs = 5_000;
const maximumSweepLimit = 1_000;
const retryExhaustedCode = "retry_exhausted";
const retryExhaustedMessage = "Chart calculation retry attempts were exhausted";
const invalidDurableStateCode = "chart_job_durable_state_invalid";
const invalidDurableStateMessage = "Chart calculation durable state is invalid";
const recoveredLeaseCode = "chart_job_lease_expired";
const recoveredLeaseMessage = "Chart calculation lease expired and was recovered";

export function createDrizzleChartCalculationJobStore(
  database: ElevenHouseDatabase
): ChartCalculationJobStore {
  return {
    createOrReuseChartJob: (input) =>
      database.transaction((transaction) => createOrReuseChartJob(transaction, input)),
    createOrReuseNatalJob: (input) =>
      database.transaction((transaction) =>
        createOrReuseChartJob(transaction, { ...input, method: "natal" })
      ),
    getOwnerScopedJob: (input) => getOwnerScopedJob(database, input),
    getOwnerScopedResult: (input) => getOwnerScopedResult(database, input)
  };
}

export function createDrizzleChartCalculationCommandStore(
  database: ElevenHouseDatabase
): ChartCalculationCommandStore {
  return {
    createOrReuseChartJobAndRequestCalculation: (input) =>
      createChartJobAndOutboxEvent(database, input),
    createOrReuseNatalJobAndRequestCalculation: (input) =>
      createChartJobAndOutboxEvent(database, { ...input, method: "natal" })
  };
}

export function createDrizzleChartWorkerJobStore(
  database: ElevenHouseDatabase,
  options: { readonly operationTimeoutMs?: number } = {}
): ChartJobProcessingStore {
  const operationTimeoutMs = normalizeWorkerOperationTimeoutMs(
    options.operationTimeoutMs ?? defaultWorkerOperationTimeoutMs
  );
  return {
    getPreClaimExecutionProfile: (jobId) =>
      getPreClaimExecutionProfile(database, jobId, operationTimeoutMs),
    getDeliveryState: (jobId) => getChartJobDeliveryState(database, jobId, operationTimeoutMs),
    getQueueDispatch: (jobId) => getQueueDispatch(database, jobId, operationTimeoutMs),
    claimForProcessing: (input) => claimChartJobForProcessing(database, input, operationTimeoutMs),
    extendLease: (input) => extendChartJobLease(database, input, operationTimeoutMs),
    complete: (input) => completeChartJob(database, input, operationTimeoutMs),
    recordAttemptFailure: (input) =>
      recordChartJobAttemptFailure(database, input, operationTimeoutMs),
    recoverExpired: (input) => recoverExpiredChartJobs(database, input, operationTimeoutMs),
    recoverPendingDeliveries: (input) =>
      recoverPendingChartDeliveries(database, input, operationTimeoutMs)
  };
}

async function createChartJobAndOutboxEvent(
  database: ElevenHouseDatabase,
  input: CreateOrReuseChartJobInput & { readonly now: string }
): Promise<CreateOrReuseChartJobResult> {
  return database.transaction(async (transaction) => {
    const result = await createOrReuseChartJob(transaction, input);
    if (result.kind === "active_job") {
      const occurredAt = new Date(input.now);
      await transaction
        .insert(outboxEvents)
        .values({
          eventType: CHART_CALCULATION_REQUESTED_EVENT,
          aggregateId: result.jobId,
          payload: { jobId: result.jobId },
          status: "pending",
          attempts: 0,
          availableAt: occurredAt,
          createdAt: occurredAt,
          updatedAt: occurredAt
        })
        .onConflictDoNothing({ target: [outboxEvents.eventType, outboxEvents.aggregateId] });
    }
    return result;
  });
}

async function createOrReuseChartJob(
  database: ChartTransaction,
  input: CreateOrReuseChartJobInput
): Promise<CreateOrReuseChartJobResult> {
  const normalizedInput = {
    ...input,
    executionProfile: canonicalizeChartExecutionProfile(input.executionProfile)
  };
  assertChartJobInputFingerprint(normalizedInput);
  await lockChartJobIdentity(
    database,
    normalizedInput.ownerUserId,
    normalizedInput.inputFingerprint
  );
  await requireActiveParticipantRelationships(
    database,
    normalizedInput.ownerUserId,
    normalizedInput.participants
  );
  const existing = await findExistingOrActive(database, normalizedInput);
  if (existing) return existing;

  const [inserted] = await database
    .insert(chartCalculationJobs)
    .values({
      ownerUserId: normalizedInput.ownerUserId,
      clientId: normalizedInput.clientId,
      method: normalizedInput.method,
      interpretationMode: normalizedInput.interpretationMode,
      methodVersion: normalizedInput.methodVersion,
      status: "queued",
      inputFingerprint: normalizedInput.inputFingerprint,
      inputSnapshot: normalizedInput.inputSnapshot,
      settingsSnapshot: normalizedInput.settingsSnapshot,
      participantSnapshot: normalizedInput.participants,
      schemaVersion: "chart-result.v2",
      executionProfile: normalizedInput.executionProfile,
      maxAttempts: normalizedInput.maxAttempts,
      targetCalculationId: normalizedInput.targetCalculationId,
      expectedSourceChecksum: normalizedInput.expectedSourceChecksum
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return { kind: "active_job", jobId: inserted.id };
  const raced = await findExistingOrActive(database, normalizedInput);
  if (raced) return raced;
  throw new Error("CHART_JOB_CREATE_CONFLICT");
}

async function findExistingOrActive(
  database: ChartDatabase,
  input: CreateOrReuseChartJobInput
): Promise<CreateOrReuseNatalJobResult | null> {
  if (input.targetCalculationId === null) {
    const rows = await database
      .select({ job: chartCalculationJobs, calculation: calculationRecords })
      .from(chartCalculationJobs)
      .innerJoin(
        calculationRecords,
        and(
          eq(calculationRecords.id, chartCalculationJobs.resultCalculationId),
          eq(calculationRecords.ownerUserId, chartCalculationJobs.ownerUserId),
          ne(calculationRecords.status, "archived")
        )
      )
      .where(
        and(
          eq(chartCalculationJobs.ownerUserId, input.ownerUserId),
          eq(chartCalculationJobs.inputFingerprint, input.inputFingerprint),
          eq(chartCalculationJobs.status, "succeeded"),
          eq(chartCalculationJobs.schemaVersion, "chart-result.v2"),
          isNotNull(chartCalculationJobs.resultCalculationId)
        )
      )
      .for("share");
    const calculationIds = [...new Set(rows.map((row) => row.calculation.id))];
    const participantRows =
      calculationIds.length > 0
        ? await database
            .select()
            .from(calculationParticipants)
            .where(inArray(calculationParticipants.calculationId, calculationIds))
            .orderBy(calculationParticipants.calculationId, calculationParticipants.order)
            .for("share")
        : [];
    let foundUntrustedHistoricalResult = false;
    for (const candidate of rows) {
      const persistedCalculationParticipants = participantRows.filter(
        (participant) => participant.calculationId === candidate.calculation.id
      );
      const result = getReusableSucceededJobResult(
        candidate.job,
        candidate.calculation,
        persistedCalculationParticipants,
        input
      );
      if (result && candidate.job.resultCalculationId) {
        return {
          kind: "existing_result",
          calculationId: candidate.job.resultCalculationId,
          result
        };
      }
      const explicitlySuperseded = await hasValidSucceededReplacementForCurrentCalculation(
        database,
        candidate.job,
        candidate.calculation,
        persistedCalculationParticipants
      );
      if (!explicitlySuperseded) foundUntrustedHistoricalResult = true;
    }
    if (foundUntrustedHistoricalResult) {
      throw new ChartStoredResultIntegrityError();
    }
  }

  const [active] = await database
    .select()
    .from(chartCalculationJobs)
    .where(
      and(
        eq(chartCalculationJobs.ownerUserId, input.ownerUserId),
        eq(chartCalculationJobs.inputFingerprint, input.inputFingerprint),
        eq(chartCalculationJobs.schemaVersion, "chart-result.v2"),
        inArray(chartCalculationJobs.status, ["queued", "processing"])
      )
    )
    .limit(1);
  return active && rowIdentityMatchesInput(active, input)
    ? { kind: "active_job", jobId: active.id }
    : null;
}

async function getOwnerScopedJob(
  database: ChartDatabase,
  input: { readonly ownerUserId: string; readonly jobId: string }
) {
  const [row] = await database
    .select()
    .from(chartCalculationJobs)
    .where(
      and(
        eq(chartCalculationJobs.ownerUserId, input.ownerUserId),
        eq(chartCalculationJobs.id, input.jobId)
      )
    )
    .limit(1);
  return row ? toChartCalculationJob(row) : null;
}

async function getOwnerScopedResult(
  database: ChartDatabase,
  input: { readonly ownerUserId: string; readonly calculationId: string }
): Promise<unknown | null> {
  const [row] = await database
    .select({ resultData: calculationRecords.resultData })
    .from(calculationRecords)
    .where(
      and(
        eq(calculationRecords.ownerUserId, input.ownerUserId),
        eq(calculationRecords.id, input.calculationId),
        eq(calculationRecords.module, "chart")
      )
    )
    .limit(1);
  return row?.resultData ?? null;
}

async function getChartJobDeliveryState(
  database: ElevenHouseDatabase,
  jobId: string,
  operationTimeoutMs: number
): Promise<ChartJobDeliveryState | null> {
  return withChartWorkerTransaction(database, operationTimeoutMs, async (transaction) => {
    const [row] = await transaction
      .select({
        kind: chartCalculationJobs.status,
        attempts: chartCalculationJobs.attempts,
        maxAttempts: chartCalculationJobs.maxAttempts
      })
      .from(chartCalculationJobs)
      .where(eq(chartCalculationJobs.id, jobId))
      .limit(1);
    if (!row) return null;
    if (
      row.kind !== "queued" &&
      row.kind !== "processing" &&
      row.kind !== "succeeded" &&
      row.kind !== "failed"
    ) {
      throw new Error("CHART_JOB_DELIVERY_STATE_INVALID");
    }
    return { kind: row.kind, attempts: row.attempts, maxAttempts: row.maxAttempts };
  });
}

async function getPreClaimExecutionProfile(
  database: ElevenHouseDatabase,
  jobId: string,
  operationTimeoutMs: number
): Promise<unknown | null> {
  return withChartWorkerTransaction(database, operationTimeoutMs, async (transaction) => {
    const [row] = await transaction
      .select({ executionProfile: chartCalculationJobs.executionProfile })
      .from(chartCalculationJobs)
      .where(
        and(
          eq(chartCalculationJobs.id, jobId),
          inArray(chartCalculationJobs.status, ["queued", "processing"]),
          sql`${chartCalculationJobs.attempts} < ${chartCalculationJobs.maxAttempts}`
        )
      )
      .limit(1);
    return row?.executionProfile ?? null;
  });
}

async function getQueueDispatch(
  database: ElevenHouseDatabase,
  jobId: string,
  operationTimeoutMs: number
) {
  return withChartWorkerTransaction(database, operationTimeoutMs, async (transaction) => {
    const [row] = await transaction
      .select()
      .from(chartCalculationJobs)
      .where(eq(chartCalculationJobs.id, jobId))
      .for("update")
      .limit(1);
    if (!row || row.status !== "queued") return null;
    const dbNow = await readDatabaseClock(transaction);
    if (!isChartJobDurableRowValidForClaim(row)) {
      await terminalizeChartJob(transaction, row.id, dbNow, {
        code: invalidDurableStateCode,
        message: invalidDurableStateMessage
      });
      return null;
    }
    if (row.attempts >= row.maxAttempts) {
      await terminalizeChartJob(transaction, row.id, dbNow, {
        code: retryExhaustedCode,
        message: retryExhaustedMessage
      });
      return null;
    }
    return { jobId: row.id, attempts: row.attempts, maxAttempts: row.maxAttempts };
  });
}

async function claimChartJobForProcessing(
  database: ElevenHouseDatabase,
  input: { readonly jobId: string; readonly workerId: string; readonly leaseMs: number },
  operationTimeoutMs: number
): Promise<ClaimChartJobOutcome> {
  const workerId = normalizeWorkerId(input.workerId);
  const leaseMs = normalizeLeaseMs(input.leaseMs);
  return withChartWorkerTransaction(database, operationTimeoutMs, async (transaction) => {
    const [candidate] = await transaction
      .select()
      .from(chartCalculationJobs)
      .where(eq(chartCalculationJobs.id, input.jobId))
      .for("update")
      .limit(1);
    if (!candidate) return { kind: "not_claimable" };

    const dbNow = await readDatabaseClock(transaction);
    const expired =
      candidate.status === "processing" &&
      candidate.lockedUntil !== null &&
      candidate.lockedUntil <= dbNow;
    if (candidate.status !== "queued" && !expired) return { kind: "not_claimable" };

    if (!isChartJobDurableRowValidForClaim(candidate)) {
      await terminalizeChartJob(transaction, candidate.id, dbNow, {
        code: invalidDurableStateCode,
        message: invalidDurableStateMessage
      });
      return { kind: "not_claimable" };
    }
    if (candidate.attempts >= candidate.maxAttempts) {
      await terminalizeChartJob(transaction, candidate.id, dbNow, {
        code: retryExhaustedCode,
        message: retryExhaustedMessage
      });
      return {
        kind: "exhausted",
        jobId: candidate.id,
        attempts: candidate.attempts,
        maxAttempts: candidate.maxAttempts
      };
    }

    const [claimed] = await transaction
      .update(chartCalculationJobs)
      .set({
        status: "processing",
        attempts: candidate.attempts + 1,
        lockedBy: workerId,
        lockedUntil: new Date(dbNow.getTime() + leaseMs),
        leaseGeneration: candidate.leaseGeneration + 1,
        startedAt: candidate.startedAt ?? dbNow,
        finishedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: dbNow
      })
      .where(eq(chartCalculationJobs.id, candidate.id))
      .returning();
    if (!claimed) throw new Error("CHART_JOB_CLAIM_WRITE_FAILED");
    return { kind: "claimed", job: toChartJobForProcessing(claimed) };
  });
}

async function extendChartJobLease(
  database: ElevenHouseDatabase,
  input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseGeneration: number;
    readonly leaseMs: number;
  },
  operationTimeoutMs: number
) {
  const workerId = normalizeWorkerId(input.workerId);
  const leaseGeneration = normalizeLeaseGeneration(input.leaseGeneration);
  const leaseMs = normalizeLeaseMs(input.leaseMs);
  return withChartWorkerTransaction(database, operationTimeoutMs, async (transaction) => {
    const result = await transaction.execute(sql<ChartCalculationJobReturningRow>`
      with candidate as materialized (
        select ${chartCalculationJobs.id}
        from ${chartCalculationJobs}
        where ${chartCalculationJobs.id} = ${input.jobId}
        for update
      ),
      db_clock as materialized (
        select clock_timestamp() as db_now from candidate
      ),
      extended as (
        update ${chartCalculationJobs}
        set locked_until = db_clock.db_now + (${leaseMs} * interval '1 millisecond'),
            updated_at = db_clock.db_now
        from candidate, db_clock
        where ${chartCalculationJobs.id} = candidate.id
          and ${chartCalculationJobs.status} = 'processing'
          and ${chartCalculationJobs.lockedBy} = ${workerId}
          and ${chartCalculationJobs.leaseGeneration} = ${leaseGeneration}
          and ${chartCalculationJobs.lockedUntil} > db_clock.db_now
        returning ${chartCalculationJobReturningColumns()}
      )
      select * from extended
    `);
    const [updated] = result.rows as unknown as ChartCalculationJobReturningRow[];
    return updated ? toChartJobLease(updated) : null;
  });
}

async function recordChartJobAttemptFailure(
  database: ElevenHouseDatabase,
  input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseGeneration: number;
    readonly code: string;
    readonly reason: string;
    readonly disposition: "retryable" | "permanent";
    readonly retryDelayMs: number;
  },
  operationTimeoutMs: number
): Promise<ChartJobAttemptFailureOutcome | null> {
  const workerId = normalizeWorkerId(input.workerId);
  const leaseGeneration = normalizeLeaseGeneration(input.leaseGeneration);
  const code = normalizeFailureText(input.code, 100, "CHART_JOB_FAILURE_CODE_INVALID");
  const reason = normalizeFailureText(input.reason, 500, "CHART_JOB_FAILURE_REASON_INVALID");
  const disposition = normalizeFailureDisposition(input.disposition);
  const retryDelayMs = normalizeRetryDelayMs(input.retryDelayMs);
  const isPermanent = disposition === "permanent";
  return withChartWorkerTransaction(database, operationTimeoutMs, async (transaction) => {
    const result = await transaction.execute(sql<{
      status: string;
      ownerUserId: string;
      attempts: number;
      maxAttempts: number;
      updatedAt: Date | string;
    }>`
    with candidate as materialized (
      select ${chartCalculationJobs.id}
      from ${chartCalculationJobs}
      where ${chartCalculationJobs.id} = ${input.jobId}
      for update
    ),
    db_clock as materialized (
      select clock_timestamp() as db_now from candidate
    ),
    failed_attempt as (
      update ${chartCalculationJobs}
      set status = case
            when ${isPermanent} or ${chartCalculationJobs.attempts} >= ${chartCalculationJobs.maxAttempts}
              then 'failed'
            else 'queued'
          end,
          locked_by = null, locked_until = null,
          finished_at = case
            when ${isPermanent} or ${chartCalculationJobs.attempts} >= ${chartCalculationJobs.maxAttempts}
              then db_clock.db_now
            else null
          end,
          last_error_code = ${code}, last_error_message = ${reason}, updated_at = db_clock.db_now
      from candidate, db_clock
      where ${chartCalculationJobs.id} = candidate.id
        and ${chartCalculationJobs.status} = 'processing'
        and ${chartCalculationJobs.lockedBy} = ${workerId}
        and ${chartCalculationJobs.leaseGeneration} = ${leaseGeneration}
        and ${chartCalculationJobs.lockedUntil} > db_clock.db_now
      returning ${chartCalculationJobs.status} as "status",
        ${chartCalculationJobs.ownerUserId} as "ownerUserId",
        ${chartCalculationJobs.attempts} as "attempts",
        ${chartCalculationJobs.maxAttempts} as "maxAttempts",
        ${chartCalculationJobs.updatedAt} as "updatedAt"
    )
    select * from failed_attempt
  `);
    const [updated] = result.rows as unknown as {
      status: string;
      ownerUserId: string;
      attempts: number;
      maxAttempts: number;
      updatedAt: Date | string;
    }[];
    if (!updated) return null;
    if (updated.status === "queued") {
      const retryAt = new Date(
        parseChartDatabaseTimestamp(
          updated.updatedAt,
          "CHART_JOB_FAILURE_CLOCK_INVALID"
        ).getTime() + retryDelayMs
      );
      await rearmChartCalculationOutbox(transaction, [input.jobId], retryAt);
    } else {
      await persistChartCalculationTerminalOutbox(
        transaction,
        [{ jobId: input.jobId, ownerUserId: updated.ownerUserId }],
        "failed",
        parseChartDatabaseTimestamp(updated.updatedAt, "CHART_JOB_FAILURE_CLOCK_INVALID")
      );
    }
    return {
      kind: updated.status === "failed" ? "failed" : "requeued",
      attempts: updated.attempts,
      maxAttempts: updated.maxAttempts
    };
  });
}

async function recoverPendingChartDeliveries(
  database: ElevenHouseDatabase,
  input: { readonly limit: number },
  operationTimeoutMs: number
) {
  validateSweepLimit(input.limit);
  return withChartWorkerTransaction(database, operationTimeoutMs, async (transaction) => {
    const dbNow = await readDatabaseClock(transaction);
    const candidates = await transaction
      .select({ id: chartCalculationJobs.id })
      .from(chartCalculationJobs)
      .innerJoin(
        outboxEvents,
        and(
          eq(outboxEvents.eventType, CHART_CALCULATION_REQUESTED_EVENT),
          eq(outboxEvents.aggregateId, chartCalculationJobs.id)
        )
      )
      .where(and(eq(chartCalculationJobs.status, "queued"), eq(outboxEvents.status, "published")))
      .orderBy(chartCalculationJobs.updatedAt, chartCalculationJobs.id)
      .limit(input.limit)
      .for("update", { of: chartCalculationJobs, skipLocked: true });
    const rearmedJobIds = candidates.map(({ id }) => id);
    await rearmChartCalculationOutbox(transaction, rearmedJobIds, dbNow);
    return { rearmedJobIds };
  });
}

async function recoverExpiredChartJobs(
  database: ElevenHouseDatabase,
  input: { readonly limit: number },
  operationTimeoutMs: number
) {
  validateSweepLimit(input.limit);
  return withChartWorkerTransaction(database, operationTimeoutMs, async (transaction) => {
    const dbNow = await readDatabaseClock(transaction);
    const candidates = await transaction
      .select()
      .from(chartCalculationJobs)
      .where(
        and(
          eq(chartCalculationJobs.status, "processing"),
          isNotNull(chartCalculationJobs.lockedUntil),
          lte(chartCalculationJobs.lockedUntil, dbNow)
        )
      )
      .orderBy(chartCalculationJobs.lockedUntil, chartCalculationJobs.id)
      .limit(input.limit)
      .for("update", { of: chartCalculationJobs, skipLocked: true });

    const requeuedJobIds: string[] = [];
    const exhaustedJobIds: string[] = [];
    const invalidJobIds: string[] = [];
    for (const candidate of candidates) {
      if (!isChartJobDurableRowValidForClaim(candidate)) invalidJobIds.push(candidate.id);
      else if (candidate.attempts >= candidate.maxAttempts) exhaustedJobIds.push(candidate.id);
      else requeuedJobIds.push(candidate.id);
    }

    if (requeuedJobIds.length > 0) {
      await transaction
        .update(chartCalculationJobs)
        .set({
          status: "queued",
          lockedBy: null,
          lockedUntil: null,
          finishedAt: null,
          lastErrorCode: recoveredLeaseCode,
          lastErrorMessage: recoveredLeaseMessage,
          updatedAt: dbNow
        })
        .where(inArray(chartCalculationJobs.id, requeuedJobIds));
      await rearmChartCalculationOutbox(transaction, requeuedJobIds, dbNow);
    }
    if (exhaustedJobIds.length > 0) {
      await terminalizeChartJobs(transaction, exhaustedJobIds, dbNow, {
        code: retryExhaustedCode,
        message: retryExhaustedMessage
      });
    }
    if (invalidJobIds.length > 0) {
      await terminalizeChartJobs(transaction, invalidJobIds, dbNow, {
        code: invalidDurableStateCode,
        message: invalidDurableStateMessage
      });
    }

    const failed = new Set([...exhaustedJobIds, ...invalidJobIds]);
    return {
      requeuedJobIds,
      failedJobIds: candidates.filter((candidate) => failed.has(candidate.id)).map(({ id }) => id)
    };
  });
}

async function completeChartJob(
  database: ElevenHouseDatabase,
  input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseGeneration: number;
    readonly result: unknown;
    readonly resultChecksum: string;
  },
  operationTimeoutMs: number
): Promise<boolean> {
  const workerId = normalizeWorkerId(input.workerId);
  const leaseGeneration = normalizeLeaseGeneration(input.leaseGeneration);
  const result = parseStrictV2ChartWorkerResult(input.result);
  const canonicalChecksum = sha256CanonicalJson(result as CanonicalJson);
  if (input.resultChecksum !== canonicalChecksum) {
    throw new ChartCalculationCompletionError("CHART_RESULT_CHECKSUM_MISMATCH");
  }

  try {
    return await withChartWorkerTransaction(database, operationTimeoutMs, async (transaction) => {
      await lockChartJobIdentityById(transaction, input.jobId);
      const [job] = await transaction
        .select()
        .from(chartCalculationJobs)
        .where(eq(chartCalculationJobs.id, input.jobId))
        .for("update")
        .limit(1);
      if (!job) return false;
      const dbNow = await readDatabaseClock(transaction);
      if (!hasLiveLease(job, workerId, leaseGeneration, dbNow)) return false;
      assertChartResultMatchesJob(job, result);
      const participants = parseChartCalculationParticipants(
        job.participantSnapshot,
        result.method,
        job.clientId
      );
      const participantProfiles = await lockActiveParticipantProfiles(
        transaction,
        job.ownerUserId,
        participants
      );
      const calculationId =
        job.targetCalculationId === null
          ? await insertInitialChartCalculation(
              transaction,
              job,
              result,
              canonicalChecksum,
              participantProfiles,
              dbNow
            )
          : await replaceTargetChartCalculation(
              transaction,
              job,
              result,
              canonicalChecksum,
              participantProfiles,
              dbNow
            );

      const finalResult = await transaction.execute(sql<{ id: string }>`
        with db_clock as materialized (select clock_timestamp() as db_now)
        update ${chartCalculationJobs}
        set status = 'succeeded', result_calculation_id = ${calculationId},
            result_checksum = ${canonicalChecksum},
            result_reproducibility_fingerprint = ${result.reproducibilityFingerprint},
            locked_by = null, locked_until = null, finished_at = db_clock.db_now,
            last_error_code = null, last_error_message = null, updated_at = db_clock.db_now
        from db_clock
        where ${chartCalculationJobs.id} = ${input.jobId}
          and ${chartCalculationJobs.status} = 'processing'
          and ${chartCalculationJobs.lockedBy} = ${workerId}
          and ${chartCalculationJobs.leaseGeneration} = ${leaseGeneration}
          and ${chartCalculationJobs.lockedUntil} > db_clock.db_now
        returning ${chartCalculationJobs.id} as "id"
      `);
      const [updated] = finalResult.rows;
      if (!updated) throw new LeaseLostDuringCompletionError();
      await persistChartCalculationTerminalOutbox(
        transaction,
        [{ jobId: job.id, ownerUserId: job.ownerUserId }],
        "succeeded",
        dbNow
      );
      return true;
    });
  } catch (error) {
    if (error instanceof LeaseLostDuringCompletionError) return false;
    if (isCalculationExactKeyUniqueViolation(error)) {
      throw new ChartCalculationReplacementError("CHART_REPLACEMENT_EXACT_KEY_CONFLICT");
    }
    throw error;
  }
}

async function insertInitialChartCalculation(
  transaction: ChartTransaction,
  job: ChartCalculationJobRow,
  result: ReproducibleChartResult,
  resultChecksum: string,
  participantProfiles: readonly {
    readonly role: "subject" | "partner";
    readonly clientId: string;
    readonly source?: "client_related_profile";
    readonly relatedProfileId?: string;
    readonly displayName: string;
  }[],
  now: Date
): Promise<string> {
  const calculationId = randomUUID();
  await lockCalculationExactKey(transaction, {
    ownerUserId: job.ownerUserId,
    module: "chart",
    mode: chartCalculationMode(result.method),
    methodCode: job.method,
    requestFingerprint: calculationRequestFingerprint(job)
  });
  const [calculation] = await transaction
    .insert(calculationRecords)
    .values({
      id: calculationId,
      ownerUserId: job.ownerUserId,
      module: "chart",
      mode: chartCalculationMode(result.method),
      interpretationMode:
        job.method === "natal" ? parseChartInterpretationMode(job.interpretationMode) : null,
      methodCode: job.method,
      title: buildChartCalculationTitle(job.method),
      status: "calculated",
      requestFingerprint: calculationRequestFingerprint(job),
      inputData: { inputSnapshot: job.inputSnapshot, settings: job.settingsSnapshot },
      resultData: result,
      resultSummary: buildChartResultSummary(result),
      resultChecksum,
      createdAt: now,
      updatedAt: now
    })
    .returning();
  if (!calculation) throw new Error("CHART_CALCULATION_INSERT_FAILED");

  await transaction.insert(calculationParticipants).values(
    participantProfiles.map((participant, order) => ({
      calculationId,
      role: participant.role,
      source: participant.source ?? ("crm_client" as const),
      clientId: participant.clientId,
      relatedProfileId: participant.relatedProfileId ?? null,
      displayName: participant.displayName,
      order,
      createdAt: now,
      updatedAt: now
    }))
  );
  return calculationId;
}

async function replaceTargetChartCalculation(
  transaction: ChartTransaction,
  job: ChartCalculationJobRow,
  result: ReproducibleChartResult,
  resultChecksum: string,
  participantProfiles: readonly {
    readonly role: "subject" | "partner";
    readonly clientId: string;
    readonly source?: "client_related_profile";
    readonly relatedProfileId?: string;
    readonly displayName: string;
  }[],
  now: Date
): Promise<string> {
  if (job.targetCalculationId === null || job.expectedSourceChecksum === null) {
    throw new ChartCalculationReplacementError("CHART_REPLACEMENT_JOB_IDENTITY_INVALID");
  }
  const outcome = await replaceCalculationResultWithInvalidation(transaction, {
    ownerUserId: job.ownerUserId,
    calculationId: job.targetCalculationId,
    expectedModule: "chart",
    replacementMode: chartCalculationMode(result.method),
    expectedMethodCode: job.method,
    expectedSourceChecksum: job.expectedSourceChecksum,
    participants: participantProfiles.map((participant) => ({
      ...participant,
      source: participant.source ?? ("crm_client" as const),
      relatedProfileId: participant.relatedProfileId ?? null
    })),
    requestFingerprint: calculationRequestFingerprint(job),
    inputData: { inputSnapshot: job.inputSnapshot, settings: job.settingsSnapshot },
    resultData: result,
    resultSummary: buildChartResultSummary(result),
    resultChecksum,
    expectedExecutionProfile: chartExecutionProfileSchema.parse(job.executionProfile),
    now
  });
  return requireReplacedCalculationId(outcome);
}

function requireReplacedCalculationId(
  outcome: ReplaceCalculationResultWithInvalidationOutcome
): string {
  if (outcome.kind === "replaced") return outcome.calculationId;
  const errorByOutcome = {
    not_found: "CHART_REPLACEMENT_TARGET_NOT_FOUND",
    source_changed: "CHART_REPLACEMENT_SOURCE_CHANGED",
    target_mismatch: "CHART_REPLACEMENT_TARGET_MISMATCH",
    participant_mismatch: "CHART_REPLACEMENT_PARTICIPANT_MISMATCH",
    exact_key_conflict: "CHART_REPLACEMENT_EXACT_KEY_CONFLICT"
  } as const;
  throw new ChartCalculationReplacementError(errorByOutcome[outcome.kind]);
}

function chartCalculationMode(method: ChartCalculationJobRow["method"]) {
  return method === "synastry" || method === "composite" ? "compatibility" : "individual";
}

function parseStrictV2ChartWorkerResult(value: unknown): ReproducibleChartResult {
  const parsed = chartResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new ChartCalculationCompletionError("CHART_RESULT_CONTRACT_INVALID");
  }
  const result = parsed.data;
  if (!isReproducibleChartResult(result)) {
    throw new ChartCalculationCompletionError("CHART_RESULT_V2_REQUIRED");
  }
  if (result.reproducibilityFingerprint !== buildChartResultReproducibilityFingerprint(result)) {
    throw new ChartCalculationCompletionError("CHART_RESULT_REPRODUCIBILITY_FINGERPRINT_MISMATCH");
  }
  return result;
}

function assertChartResultMatchesJob(
  job: ChartCalculationJobRow,
  result: ReproducibleChartResult
): void {
  if (
    job.schemaVersion !== "chart-result.v2" ||
    result.method !== job.method ||
    result.methodVersion !== job.methodVersion ||
    stableJson(result.settings as CanonicalJson) !==
      stableJson(job.settingsSnapshot as CanonicalJson) ||
    stableJson(buildChartJobInputSnapshotForResult(result)) !==
      stableJson(job.inputSnapshot as CanonicalJson)
  ) {
    throw new ChartCalculationCompletionError("CHART_RESULT_JOB_BINDING_MISMATCH");
  }
  const parsedProfile = chartExecutionProfileSchema.safeParse(job.executionProfile);
  if (!parsedProfile.success) {
    throw new ChartCalculationCompletionError("CHART_RESULT_EXECUTION_PROFILE_MISMATCH");
  }
  const profile = parsedProfile.data;
  if (!providerMatchesExecutionProfile(result, profile)) {
    throw new ChartCalculationCompletionError("CHART_RESULT_EXECUTION_PROFILE_MISMATCH");
  }
  const participants = parseChartCalculationParticipants(
    job.participantSnapshot,
    result.method,
    job.clientId
  );
  const expectedFingerprint = buildChartJobRequestFingerprint({
    ownerUserId: job.ownerUserId,
    method: result.method,
    methodVersion: result.methodVersion,
    executionProfile: profile,
    interpretationMode: parseChartInterpretationMode(job.interpretationMode),
    settings: job.settingsSnapshot as CanonicalJson,
    inputSnapshot: job.inputSnapshot as CanonicalJson,
    participants,
    targetCalculationId: job.targetCalculationId,
    expectedSourceChecksum: job.expectedSourceChecksum
  });
  if (job.inputFingerprint !== expectedFingerprint) {
    throw new ChartCalculationCompletionError("CHART_JOB_FINGERPRINT_MISMATCH");
  }
}

function providerMatchesExecutionProfile(
  result: ReproducibleChartResult,
  profile: ChartExecutionProfile
): boolean {
  return (
    result.provider.name === profile.provider &&
    result.provider.version === profile.kerykeionVersion &&
    result.provider.pyswissephVersion === profile.pyswissephVersion &&
    result.provider.ephemeris === profile.expectedEphemeris &&
    stableJson([...result.provider.ephemerisFlags].sort() as CanonicalJson) ===
      stableJson([...profile.expectedEphemerisFlags].sort() as CanonicalJson) &&
    result.provider.ephemerisDataRevision === profile.expectedEphemerisDataRevision
  );
}

function getReusableSucceededJobResult(
  job: ChartCalculationJobRow,
  calculation: CalculationRecordRow,
  persistedParticipants: readonly CalculationParticipantRow[],
  input: CreateOrReuseChartJobInput
): ReproducibleChartResult | null {
  if (
    !rowIdentityMatchesInput(job, input) ||
    !job.resultChecksum ||
    !job.resultReproducibilityFingerprint
  ) {
    return null;
  }
  const expectedMode =
    job.method === "synastry" || job.method === "composite" ? "compatibility" : "individual";
  if (
    calculation.module !== "chart" ||
    calculation.mode !== expectedMode ||
    (job.method === "natal"
      ? (calculation.interpretationMode ?? "legacy_unclassified") !==
        parseChartInterpretationMode(job.interpretationMode)
      : calculation.interpretationMode !== null) ||
    calculation.methodCode !== job.method ||
    !["calculated", "linked", "published"].includes(calculation.status) ||
    calculation.requestFingerprint !== calculationRequestFingerprint(job) ||
    stableJson(calculation.inputData as CanonicalJson) !==
      stableJson({
        inputSnapshot: job.inputSnapshot,
        settings: job.settingsSnapshot
      } as CanonicalJson)
  ) {
    return null;
  }
  const parsed = chartResultSchema.safeParse(calculation.resultData);
  if (!parsed.success || !isReproducibleChartResult(parsed.data)) return null;
  try {
    const result = assertStoredChartCalculationIntegrity({
      calculation: {
        module: calculation.module,
        methodCode: calculation.methodCode,
        inputData: calculation.inputData,
        resultData: calculation.resultData,
        resultChecksum: calculation.resultChecksum
      },
      expectedExecutionProfile: input.executionProfile
    });
    if (!isReproducibleChartResult(result)) return null;
    assertChartResultMatchesJob(job, parsed.data);
    const expectedParticipants = parseChartCalculationParticipants(
      job.participantSnapshot,
      parsed.data.method,
      job.clientId
    );
    const reusable =
      persistedParticipants.length === expectedParticipants.length &&
      persistedParticipants.every((participant, order) => {
        const expected = expectedParticipants[order];
        const expectedSource =
          expected && "source" in expected ? expected.source : ("crm_client" as const);
        const expectedRelatedProfileId =
          expected && "relatedProfileId" in expected ? expected.relatedProfileId : null;
        return (
          expected !== undefined &&
          participant.calculationId === calculation.id &&
          participant.order === order &&
          participant.role === expected.role &&
          participant.source === expectedSource &&
          participant.clientId === expected.clientId &&
          participant.relatedProfileId === expectedRelatedProfileId &&
          participant.displayName.trim().length > 0
        );
      }) &&
      parsed.data.reproducibilityFingerprint === job.resultReproducibilityFingerprint &&
      parsed.data.reproducibilityFingerprint ===
        buildChartResultReproducibilityFingerprint(parsed.data) &&
      job.resultChecksum === calculation.resultChecksum &&
      calculation.resultChecksum === sha256CanonicalJson(parsed.data as CanonicalJson) &&
      stableJson(calculation.resultSummary as CanonicalJson) ===
        stableJson(buildChartResultSummary(parsed.data) as unknown as CanonicalJson);
    return reusable ? result : null;
  } catch {
    return null;
  }
}

async function hasValidSucceededReplacementForCurrentCalculation(
  database: ChartDatabase,
  historicalJob: ChartCalculationJobRow,
  calculation: CalculationRecordRow,
  persistedParticipants: readonly CalculationParticipantRow[]
): Promise<boolean> {
  const historicalInput = toPersistedChartJobInput(historicalJob);
  const historicalFinishedAt = chartJobFinishedAtMillis(historicalJob);
  if (
    historicalJob.resultCalculationId !== calculation.id ||
    !historicalJob.resultChecksum ||
    historicalFinishedAt === null ||
    !historicalInput ||
    !hasValidChartJobInputFingerprint(historicalInput) ||
    historicalJob.resultChecksum === calculation.resultChecksum
  ) {
    return false;
  }
  const replacementJobs = await database
    .select()
    .from(chartCalculationJobs)
    .where(
      and(
        eq(chartCalculationJobs.ownerUserId, historicalJob.ownerUserId),
        eq(chartCalculationJobs.status, "succeeded"),
        eq(chartCalculationJobs.schemaVersion, "chart-result.v2"),
        eq(chartCalculationJobs.resultCalculationId, calculation.id),
        eq(chartCalculationJobs.targetCalculationId, calculation.id),
        ne(chartCalculationJobs.id, historicalJob.id)
      )
    )
    .for("share");

  const replacementsBySourceChecksum = new Map<
    string,
    Array<{
      readonly job: ChartCalculationJobRow;
      readonly input: CreateOrReuseChartJobInput;
      readonly finishedAt: number;
    }>
  >();
  for (const job of replacementJobs) {
    const input = toPersistedChartJobInput(job);
    const finishedAt = chartJobFinishedAtMillis(job);
    if (
      !input ||
      !job.expectedSourceChecksum ||
      !job.resultChecksum ||
      !job.resultReproducibilityFingerprint ||
      finishedAt === null ||
      !hasValidChartJobInputFingerprint(input)
    ) {
      continue;
    }
    const edges = replacementsBySourceChecksum.get(job.expectedSourceChecksum) ?? [];
    edges.push({ job, input, finishedAt });
    replacementsBySourceChecksum.set(job.expectedSourceChecksum, edges);
  }

  const earliestReachTime = new Map<string, number>([
    [historicalJob.resultChecksum, historicalFinishedAt]
  ]);
  const pendingChecksums = [historicalJob.resultChecksum];
  for (let index = 0; index < pendingChecksums.length; index += 1) {
    const sourceChecksum = pendingChecksums[index];
    if (!sourceChecksum) continue;
    const sourceReachedAt = earliestReachTime.get(sourceChecksum);
    if (sourceReachedAt === undefined) continue;
    for (const replacement of replacementsBySourceChecksum.get(sourceChecksum) ?? []) {
      if (replacement.finishedAt <= sourceReachedAt) continue;
      const resultChecksum = replacement.job.resultChecksum;
      if (!resultChecksum || resultChecksum === sourceChecksum) continue;
      if (resultChecksum === calculation.resultChecksum) {
        if (
          getReusableSucceededJobResult(
            replacement.job,
            calculation,
            persistedParticipants,
            replacement.input
          )
        ) {
          return true;
        }
        continue;
      }
      const previousReachTime = earliestReachTime.get(resultChecksum);
      if (previousReachTime !== undefined && previousReachTime <= replacement.finishedAt) continue;
      earliestReachTime.set(resultChecksum, replacement.finishedAt);
      pendingChecksums.push(resultChecksum);
    }
  }
  return false;
}

function chartJobFinishedAtMillis(job: ChartCalculationJobRow): number | null {
  const value = job.finishedAt?.getTime();
  return value !== undefined && Number.isFinite(value) ? value : null;
}

function toPersistedChartJobInput(job: ChartCalculationJobRow): CreateOrReuseChartJobInput | null {
  const method = job.method as keyof typeof chartMethodVersions;
  const executionProfile = chartExecutionProfileSchema.safeParse(job.executionProfile);
  if (
    job.schemaVersion !== "chart-result.v2" ||
    !(method in chartMethodVersions) ||
    !job.methodVersion ||
    chartMethodVersions[method] !== job.methodVersion ||
    !executionProfile.success
  ) {
    return null;
  }
  try {
    return {
      method,
      methodVersion: job.methodVersion,
      executionProfile: executionProfile.data,
      interpretationMode: parseChartInterpretationMode(job.interpretationMode),
      ownerUserId: job.ownerUserId,
      clientId: job.clientId,
      participants: parseChartCalculationParticipants(
        job.participantSnapshot,
        method,
        job.clientId
      ),
      maxAttempts: job.maxAttempts,
      targetCalculationId: job.targetCalculationId,
      expectedSourceChecksum: job.expectedSourceChecksum,
      inputFingerprint: job.inputFingerprint,
      inputSnapshot: job.inputSnapshot,
      settingsSnapshot: job.settingsSnapshot
    };
  } catch {
    return null;
  }
}

function rowIdentityMatchesInput(
  row: ChartCalculationJobRow,
  input: CreateOrReuseChartJobInput
): boolean {
  return (
    row.schemaVersion === "chart-result.v2" &&
    row.method === input.method &&
    row.methodVersion === input.methodVersion &&
    parseChartInterpretationMode(row.interpretationMode) === input.interpretationMode &&
    executionProfilesMatch(row.executionProfile, input.executionProfile) &&
    stableJson(row.participantSnapshot as CanonicalJson) ===
      stableJson(input.participants as CanonicalJson) &&
    row.targetCalculationId === input.targetCalculationId &&
    row.expectedSourceChecksum === input.expectedSourceChecksum
  );
}

function executionProfilesMatch(left: unknown, right: ChartExecutionProfile): boolean {
  const parsed = chartExecutionProfileSchema.safeParse(left);
  if (!parsed.success) return false;
  return (
    stableJson(canonicalizeChartExecutionProfile(parsed.data) as CanonicalJson) ===
    stableJson(canonicalizeChartExecutionProfile(right) as CanonicalJson)
  );
}

function calculationRequestFingerprint(job: ChartCalculationJobRow): `sha256:${string}` {
  const input = toPersistedChartJobInput(job);
  if (!input) throw new ChartCalculationCompletionError("CHART_JOB_FINGERPRINT_MISMATCH");
  return buildChartCalculationRequestFingerprint({
    ownerUserId: input.ownerUserId,
    method: input.method,
    methodVersion: input.methodVersion,
    executionProfile: input.executionProfile,
    interpretationMode: input.interpretationMode,
    settings: input.settingsSnapshot as CanonicalJson,
    inputSnapshot: input.inputSnapshot as CanonicalJson,
    participants: input.participants
  });
}

function assertChartJobInputFingerprint(input: CreateOrReuseChartJobInput): void {
  const expected = buildChartJobRequestFingerprint({
    ownerUserId: input.ownerUserId,
    method: input.method,
    methodVersion: input.methodVersion,
    executionProfile: input.executionProfile,
    interpretationMode: input.interpretationMode,
    settings: input.settingsSnapshot as CanonicalJson,
    inputSnapshot: input.inputSnapshot as CanonicalJson,
    participants: input.participants,
    targetCalculationId: input.targetCalculationId,
    expectedSourceChecksum: input.expectedSourceChecksum
  });
  if (input.inputFingerprint !== expected) throw new Error("CHART_JOB_FINGERPRINT_MISMATCH");
}

function hasValidChartJobInputFingerprint(input: CreateOrReuseChartJobInput): boolean {
  try {
    assertChartJobInputFingerprint(input);
    return true;
  } catch {
    return false;
  }
}

async function requireActiveParticipantRelationships(
  database: ChartTransaction,
  ownerUserId: string,
  participants: readonly ChartCalculationParticipant[]
): Promise<void> {
  const participantIds = [
    ...new Set(participants.map((participant) => participant.clientId))
  ].sort();
  const rows = await database
    .select({ clientId: clientAstrologerRelationships.clientUserId })
    .from(clientAstrologerRelationships)
    .where(
      and(
        eq(clientAstrologerRelationships.astrologerUserId, ownerUserId),
        eq(clientAstrologerRelationships.status, "active"),
        inArray(clientAstrologerRelationships.clientUserId, participantIds)
      )
    )
    .orderBy(clientAstrologerRelationships.clientUserId)
    .for("update");
  const activeIds = new Set(rows.map((row) => row.clientId));
  if (activeIds.size !== participantIds.length || participantIds.some((id) => !activeIds.has(id))) {
    throw new ChartParticipantRelationshipInactiveError();
  }
}

async function lockActiveParticipantProfiles(
  database: ChartTransaction,
  ownerUserId: string,
  participants: readonly ChartCalculationParticipant[]
) {
  const participantIds = [
    ...new Set(participants.map((participant) => participant.clientId))
  ].sort();
  const rows = await database
    .select({
      clientId: clientAstrologerRelationships.clientUserId,
      displayName: clientProfiles.displayNameSnapshot
    })
    .from(clientAstrologerRelationships)
    .innerJoin(
      clientProfiles,
      eq(clientProfiles.userId, clientAstrologerRelationships.clientUserId)
    )
    .where(
      and(
        eq(clientAstrologerRelationships.astrologerUserId, ownerUserId),
        eq(clientAstrologerRelationships.status, "active"),
        inArray(clientAstrologerRelationships.clientUserId, participantIds)
      )
    )
    .orderBy(clientAstrologerRelationships.clientUserId)
    .for("update");
  const byClient = new Map(rows.map((row) => [row.clientId, row.displayName?.trim()]));
  const relatedProfileIds = participants.flatMap((participant) =>
    "relatedProfileId" in participant ? [participant.relatedProfileId] : []
  );
  const relatedRows =
    relatedProfileIds.length === 0
      ? []
      : await database
          .select({
            id: clientRelatedBirthProfiles.id,
            clientId: clientRelatedBirthProfiles.clientUserId,
            displayName: clientRelatedBirthProfiles.displayName,
            relationshipLabel: clientRelatedBirthProfiles.relationshipLabel
          })
          .from(clientRelatedBirthProfiles)
          .where(inArray(clientRelatedBirthProfiles.id, relatedProfileIds))
          .orderBy(clientRelatedBirthProfiles.id)
          .for("update");
  const byRelatedProfile = new Map(relatedRows.map((row) => [row.id, row]));
  return participants.map((participant) => {
    if ("relatedProfileId" in participant) {
      const related = byRelatedProfile.get(participant.relatedProfileId);
      if (!related || related.clientId !== participant.clientId || !related.displayName.trim()) {
        throw new ChartCalculationCompletionError("CHART_PARTICIPANT_PROFILE_INVALID");
      }
      return {
        ...participant,
        displayName: `${related.displayName.trim()} · ${related.relationshipLabel.trim()}`
      };
    }
    const displayName = byClient.get(participant.clientId);
    if (!displayName) {
      throw new ChartCalculationCompletionError("CHART_PARTICIPANT_PROFILE_INVALID");
    }
    return { ...participant, displayName };
  });
}

function hasLiveLease(
  job: ChartCalculationJobRow,
  workerId: string,
  leaseGeneration: number,
  dbNow: Date
): boolean {
  return (
    job.status === "processing" &&
    job.lockedBy === workerId &&
    job.leaseGeneration === leaseGeneration &&
    Boolean(job.lockedUntil && job.lockedUntil > dbNow)
  );
}

function isChartJobDurableRowValidForClaim(row: ChartCalculationJobRow): boolean {
  let interpretationMode: ChartInterpretationMode;
  try {
    interpretationMode = parseChartInterpretationMode(row.interpretationMode);
  } catch {
    return false;
  }
  if (
    row.schemaVersion !== "chart-result.v2" ||
    row.provider !== "kerykeion" ||
    !/^sha256:[a-f0-9]{64}$/.test(row.inputFingerprint) ||
    !isJsonObject(row.inputSnapshot) ||
    !isJsonObject(row.settingsSnapshot) ||
    !Number.isInteger(row.attempts) ||
    row.attempts < 0 ||
    !Number.isInteger(row.maxAttempts) ||
    row.maxAttempts <= 0 ||
    row.attempts > row.maxAttempts ||
    !Number.isInteger(row.leaseGeneration) ||
    row.leaseGeneration < 0 ||
    (row.targetCalculationId === null) !== (row.expectedSourceChecksum === null) ||
    (row.expectedSourceChecksum !== null &&
      !/^sha256:[a-f0-9]{64}$/.test(row.expectedSourceChecksum)) ||
    row.resultCalculationId !== null ||
    row.resultChecksum !== null ||
    row.resultReproducibilityFingerprint !== null ||
    (row.status !== "queued" && row.status !== "processing") ||
    (row.method !== "natal" && interpretationMode !== "legacy_unclassified")
  ) {
    return false;
  }

  if (row.status === "queued") {
    const hasFailure = row.lastErrorCode !== null || row.lastErrorMessage !== null;
    if (
      row.lockedBy !== null ||
      row.lockedUntil !== null ||
      row.finishedAt !== null ||
      (hasFailure && (!row.lastErrorCode?.trim() || !row.lastErrorMessage?.trim()))
    ) {
      return false;
    }
  } else if (
    !row.lockedBy?.trim() ||
    row.lockedUntil === null ||
    row.leaseGeneration <= 0 ||
    row.startedAt === null ||
    row.finishedAt !== null ||
    row.lastErrorCode !== null ||
    row.lastErrorMessage !== null
  ) {
    return false;
  }

  try {
    toChartJobForProcessing(
      row.status === "processing"
        ? row
        : {
            ...row,
            status: "processing",
            lockedBy: "chart-worker:durable-validation",
            lockedUntil: new Date(0),
            leaseGeneration: Math.max(1, row.leaseGeneration + 1)
          }
    );
    return true;
  } catch {
    return false;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function terminalizeChartJob(
  transaction: ChartTransaction,
  jobId: string,
  now: Date,
  failure: { readonly code: string; readonly message: string }
): Promise<void> {
  await terminalizeChartJobs(transaction, [jobId], now, failure);
}

async function terminalizeChartJobs(
  transaction: ChartTransaction,
  jobIds: readonly string[],
  now: Date,
  failure: { readonly code: string; readonly message: string }
): Promise<void> {
  if (jobIds.length === 0) return;
  const finalized = await transaction
    .update(chartCalculationJobs)
    .set({
      status: "failed",
      lockedBy: null,
      lockedUntil: null,
      startedAt: sql`coalesce(${chartCalculationJobs.startedAt}, ${now})`,
      finishedAt: now,
      resultCalculationId: null,
      resultChecksum: null,
      resultReproducibilityFingerprint: null,
      lastErrorCode: failure.code,
      lastErrorMessage: failure.message,
      updatedAt: now
    })
    .where(inArray(chartCalculationJobs.id, jobIds))
    .returning({ id: chartCalculationJobs.id, ownerUserId: chartCalculationJobs.ownerUserId });
  await persistChartCalculationTerminalOutbox(
    transaction,
    finalized.map((job) => ({
      jobId: job.id,
      ownerUserId: job.ownerUserId
    })),
    "failed",
    now
  );
}

async function persistChartCalculationTerminalOutbox(
  transaction: ChartTransaction,
  jobs: readonly { readonly jobId: string; readonly ownerUserId: string }[],
  outcome: "succeeded" | "failed",
  occurredAt: Date
): Promise<void> {
  if (jobs.length === 0) return;
  await transaction
    .insert(outboxEvents)
    .values(
      jobs.map((job) => ({
        eventType: CHART_CALCULATION_TERMINAL_EVENT,
        aggregateId: job.jobId,
        payload: {
          jobId: job.jobId,
          ownerUserId: job.ownerUserId,
          outcome,
          occurredAt: occurredAt.toISOString()
        },
        status: "pending" as const,
        attempts: 0,
        availableAt: occurredAt,
        createdAt: occurredAt,
        updatedAt: occurredAt
      }))
    )
    .onConflictDoNothing({ target: [outboxEvents.eventType, outboxEvents.aggregateId] });
}

async function rearmChartCalculationOutbox(
  transaction: ChartTransaction,
  jobIds: readonly string[],
  availableAt: Date
): Promise<void> {
  if (jobIds.length === 0) return;
  await transaction
    .insert(outboxEvents)
    .values(
      jobIds.map((jobId) => ({
        eventType: CHART_CALCULATION_REQUESTED_EVENT,
        aggregateId: jobId,
        payload: { jobId },
        status: "pending",
        attempts: 0,
        availableAt,
        lockedAt: null,
        publishedAt: null,
        lastError: null,
        createdAt: availableAt,
        updatedAt: availableAt
      }))
    )
    .onConflictDoUpdate({
      target: [outboxEvents.eventType, outboxEvents.aggregateId],
      set: {
        payload: sql`excluded.payload`,
        status: "pending",
        attempts: 0,
        availableAt,
        lockedAt: null,
        publishedAt: null,
        lastError: null,
        updatedAt: availableAt
      }
    });
}

async function readDatabaseClock(database: ChartTransaction): Promise<Date> {
  const result = await database.execute(
    sql<{ dbNow: Date | string }>`select clock_timestamp() as "dbNow"`
  );
  return parseChartDatabaseTimestamp(result.rows[0]?.dbNow, "CHART_DATABASE_CLOCK_INVALID");
}

async function withChartWorkerTransaction<T>(
  database: ElevenHouseDatabase,
  operationTimeoutMs: number,
  operation: (transaction: ChartTransaction) => Promise<T>
): Promise<T> {
  const statementTimeout = `${normalizeWorkerOperationTimeoutMs(operationTimeoutMs)}ms`;
  const lockTimeout = `${Math.max(1, operationTimeoutMs - 1)}ms`;
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`
      select
        set_config('lock_timeout', ${lockTimeout}, true),
        set_config('statement_timeout', ${statementTimeout}, true)
    `);
    return operation(transaction);
  });
}

function normalizeWorkerOperationTimeoutMs(value: number): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > maximumWorkerOperationTimeoutMs) {
    throw new Error("CHART_JOB_STORAGE_OPERATION_TIMEOUT_INVALID");
  }
  return value;
}

function normalizeWorkerId(value: string): string {
  const workerId = value.trim();
  if (!workerId || workerId.length > 200) throw new Error("CHART_JOB_WORKER_ID_INVALID");
  return workerId;
}

function normalizeLeaseGeneration(value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error("CHART_JOB_LEASE_GENERATION_INVALID");
  return value;
}

function normalizeLeaseMs(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > maximumLeaseMs) {
    throw new Error("CHART_JOB_LEASE_DURATION_INVALID");
  }
  return value;
}

function normalizeFailureText(value: string, maxLength: number, errorCode: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(errorCode);
  return normalized;
}

function normalizeFailureDisposition(value: string): "retryable" | "permanent" {
  if (value !== "retryable" && value !== "permanent") {
    throw new Error("CHART_JOB_FAILURE_DISPOSITION_INVALID");
  }
  return value;
}

function normalizeRetryDelayMs(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximumRetryDelayMs) {
    throw new Error("CHART_JOB_RETRY_DELAY_INVALID");
  }
  return value;
}

function validateSweepLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit <= 0 || limit > maximumSweepLimit) {
    throw new Error("CHART_JOB_SWEEP_LIMIT_INVALID");
  }
}

async function lockChartJobIdentity(
  database: ChartTransaction,
  ownerUserId: string,
  inputFingerprint: string
): Promise<void> {
  await database.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${`${ownerUserId}:${inputFingerprint}`}, 0))
  `);
}

async function lockChartJobIdentityById(database: ChartTransaction, jobId: string): Promise<void> {
  const [identity] = await database
    .select({
      ownerUserId: chartCalculationJobs.ownerUserId,
      inputFingerprint: chartCalculationJobs.inputFingerprint
    })
    .from(chartCalculationJobs)
    .where(eq(chartCalculationJobs.id, jobId))
    .limit(1);
  if (identity) {
    await lockChartJobIdentity(database, identity.ownerUserId, identity.inputFingerprint);
  }
}

function buildChartResultSummary(result: ChartResult) {
  if (result.method === "transit")
    return {
      provider: result.provider.name,
      natalPointCount: result.result.natal.points.length,
      transitPointCount: result.result.transit.points.length,
      transitAspectCount: result.result.aspectsToNatal.length
    };
  if (result.method === "synastry")
    return {
      provider: result.provider.name,
      primaryPointCount: result.result.primary.points.length,
      partnerPointCount: result.result.partner.points.length,
      synastryAspectCount: result.result.aspectsBetween.length,
      houseOverlayCount: result.result.houseOverlays.length,
      relationshipScore: result.result.relationshipScore?.value ?? null
    };
  if (result.method === "solar_return")
    return {
      provider: result.provider.name,
      natalPointCount: result.result.natal.points.length,
      solarReturnPointCount: result.result.solarReturn.points.length,
      solarReturnAspectCount: result.result.aspectsToNatal.length,
      resolvedAt: result.solarReturnSnapshot.resolvedAt
    };
  if (result.method === "progression")
    return result.schemaVersion === "chart-result.v2"
      ? {
          provider: result.provider.name,
          natalPointCount: result.result.natal.points.length,
          progressedPointCount: result.result.progressed.points.length,
          progressionAspectCount: result.result.aspectsToNatal.length,
          targetDate: result.progressionSnapshot.targetDate,
          symbolicInstant: result.calculationBasis.symbolicInstant,
          elapsedLifeDays: result.calculationBasis.elapsedLifeDays,
          elapsedYears: result.calculationBasis.elapsedYears,
          yearLengthDays: result.calculationBasis.yearLengthDays,
          dayForYearRatio: result.calculationBasis.dayForYearRatio
        }
      : {
          provider: result.provider.name,
          natalPointCount: result.result.natal.points.length,
          progressedPointCount: result.result.progressed.points.length,
          progressionAspectCount: result.result.aspectsToNatal.length,
          targetDate: result.progressionSnapshot.targetDate,
          symbolicDate: result.progressionSnapshot.calculationBasis.symbolicDate,
          ageDays: result.progressionSnapshot.calculationBasis.ageDays
        };
  if (result.method === "horary")
    return {
      provider: result.provider.name,
      pointCount: result.result.points.length,
      houseCount: result.result.houses.length,
      aspectCount: result.result.aspects.length,
      question: result.questionSnapshot.question,
      category: result.questionSnapshot.category,
      date: result.questionSnapshot.date,
      time: result.questionSnapshot.time,
      timezone: result.questionSnapshot.timezone
    };
  if (result.method === "astrocartography")
    return {
      provider: result.provider.name,
      lineCount: result.result.lines.length,
      pointCount: new Set(result.result.lines.map((line) => line.point)).size,
      angleCount: new Set(result.result.lines.map((line) => line.angle)).size
    };
  return {
    provider: result.provider.name,
    pointCount: result.result.points.length,
    houseCount: result.result.houses.length,
    aspectCount: result.result.aspects.length
  };
}

function buildChartCalculationTitle(method: ChartCalculationJobRow["method"]): string {
  if (method === "transit") return "Transit chart";
  if (method === "synastry") return "Synastry chart";
  if (method === "composite") return "Composite chart";
  if (method === "solar_return") return "Solar return chart";
  if (method === "progression") return "Progression chart";
  if (method === "horary") return "Horary chart";
  if (method === "astrocartography") return "Astrocartography map";
  return "Natal chart";
}

class LeaseLostDuringCompletionError extends Error {}
