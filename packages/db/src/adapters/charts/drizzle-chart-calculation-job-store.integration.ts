import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chartMethodVersions,
  chartResultSchema,
  type ChartExecutionProfile,
  type ChartSettings,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import {
  buildChartCalculationRequestFingerprint,
  buildChartJobRequestFingerprint,
  buildChartResultReproducibilityFingerprint,
  ChartCalculationCompletionError,
  ChartCalculationReplacementError,
  ChartStoredResultIntegrityError,
  CHART_CALCULATION_REQUESTED_EVENT,
  approveCalculationInterpretation,
  createCalculation,
  linkCalculationToClient,
  publishCalculationToClient,
  saveCalculationInterpretation,
  sha256CanonicalJson,
  type CanonicalJson,
  type ChartJobForProcessing,
  type CreateOrReuseChartJobInput,
  type CreateOrReuseNatalJobInput
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleCalculationStore } from "../calculations";
import {
  calculationParticipants,
  calculationRecords,
  chartCalculationJobs,
  outboxEvents
} from "../../schema";
import {
  createDrizzleChartCalculationCommandStore,
  createDrizzleChartCalculationJobStore,
  createDrizzleChartWorkerJobStore
} from "./drizzle-chart-calculation-job-store";
import { reconcileChartCalculationJobsIfPrerequisitesExist } from "../../../scripts/chart-calculation-jobs-reconciliation";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const isolatedDatabaseName = `elevenhouse_chart_jobs_${process.pid}_${randomUUID()
  .replaceAll("-", "")
  .slice(0, 8)}`;
const isolatedDatabaseUrl = withDatabaseName(databaseUrl, isolatedDatabaseName);
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const executionProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};

type ClientContext = {
  readonly ownerUserId: string;
  readonly subjectClientId: string;
  readonly partnerClientId: string;
};

describe("chart calculation job Drizzle/PostgreSQL integration", () => {
  const adminClient = new Client({ connectionString: databaseUrl });
  const runtime = createPostgresRuntime({ DATABASE_URL: isolatedDatabaseUrl });

  beforeAll(async () => {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${isolatedDatabaseName}"`);
    await runtime.pool.query(readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8"));
    const reconciliationClient = new Client({ connectionString: isolatedDatabaseUrl });
    await reconciliationClient.connect();
    await reconciliationClient.query("begin");
    try {
      await reconcileChartCalculationJobsIfPrerequisitesExist(reconciliationClient);
      await augmentIsolatedSchemaForCurrentSources(reconciliationClient);
      await reconciliationClient.query("commit");
    } catch (error) {
      await reconciliationClient.query("rollback");
      throw error;
    } finally {
      await reconciliationClient.end();
    }
  }, 30_000);

  afterAll(async () => {
    try {
      await runtime.close();
    } finally {
      try {
        await adminClient.query(`DROP DATABASE IF EXISTS "${isolatedDatabaseName}" WITH (FORCE)`);
      } finally {
        await adminClient.end();
      }
    }
  }, 30_000);

  it("creates one v2 job/outbox and exposes persisted queue retry authority", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const commandStore = createDrizzleChartCalculationCommandStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);

    const first = await commandStore.createOrReuseNatalJobAndRequestCalculation({
      ...input,
      now: "2026-08-03T08:00:00.000Z"
    });
    const second = await jobStore.createOrReuseNatalJob(input);
    expect(first.kind).toBe("active_job");
    expect(second).toEqual(first);
    if (first.kind !== "active_job") throw new Error("Expected active job");

    await expect(workerStore.getQueueDispatch(first.jobId)).resolves.toEqual({
      jobId: first.jobId,
      attempts: 0,
      maxAttempts: 3
    });
    await expect(
      runtime.database.query.outboxEvents.findFirst({
        where: eq(outboxEvents.aggregateId, first.jobId)
      })
    ).resolves.toMatchObject({
      eventType: CHART_CALCULATION_REQUESTED_EVENT,
      payload: { jobId: first.jobId },
      status: "pending"
    });
  });

  it("persists adult and child product authority as distinct business identities", async () => {
    const context = await createClientContext();
    const adultInput = natalInput(context, { interpretationMode: "adult_natal" });
    const childInput = natalInput(context, { interpretationMode: "child" });
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);

    const adult = await jobStore.createOrReuseNatalJob(adultInput);
    const child = await jobStore.createOrReuseNatalJob(childInput);
    if (adult.kind !== "active_job" || child.kind !== "active_job") {
      throw new Error("Expected distinct active jobs");
    }

    expect(child.jobId).not.toBe(adult.jobId);
    await expect(requireJobRow(adult.jobId)).resolves.toMatchObject({
      interpretationMode: "adult_natal"
    });
    await expect(requireJobRow(child.jobId)).resolves.toMatchObject({
      interpretationMode: "child"
    });
    await expect(claim(workerStore, child.jobId, "chart-worker-child")).resolves.toMatchObject({
      interpretationMode: "child"
    });
  });

  it("reuses one active job across equivalent execution-profile flag order", async () => {
    const context = await createClientContext();
    const input = natalInput(context, { interpretationMode: "child" });
    const store = createDrizzleChartCalculationJobStore(runtime.database);

    const first = await store.createOrReuseNatalJob(input);
    const second = await store.createOrReuseNatalJob({
      ...input,
      executionProfile: {
        ...input.executionProfile,
        expectedEphemerisFlags: ["FLG_SPEED", "FLG_MOSEPH"]
      }
    });

    expect(second).toEqual(first);
    if (first.kind !== "active_job") throw new Error("Expected active job");
    await expect(requireJobRow(first.jobId)).resolves.toMatchObject({
      executionProfile: {
        ...executionProfile,
        expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"]
      }
    });
  });

  it("allows one parallel claim and a live duplicate consumes no attempt", async () => {
    const context = await createClientContext();
    const created = await createActiveNatalJob(context);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const before = Date.now();

    const claims = await Promise.all([
      workerStore.claimForProcessing({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseMs: 60_000
      }),
      workerStore.claimForProcessing({
        jobId: created.jobId,
        workerId: "chart-worker-b",
        leaseMs: 60_000
      })
    ]);
    const claimed = claims.filter((outcome) => outcome.kind === "claimed");
    const rejected = claims.filter((outcome) => outcome.kind === "not_claimable");

    expect(claimed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      kind: "claimed",
      job: { attempts: 1, maxAttempts: 3, lease: { leaseGeneration: 1 } }
    });
    const winner = claimed[0];
    if (winner?.kind !== "claimed") throw new Error("Expected claimed job");
    expect(Date.parse(winner.job.lease.lockedUntil)).toBeGreaterThanOrEqual(before);
    await expect(
      runtime.database.query.chartCalculationJobs.findFirst({
        where: eq(chartCalculationJobs.id, created.jobId)
      })
    ).resolves.toMatchObject({ attempts: 1, leaseGeneration: 1 });
  });

  it("reclaims an expired lease with a higher generation and stable startedAt", async () => {
    const context = await createClientContext();
    const created = await createActiveNatalJob(context);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const first = await claim(workerStore, created.jobId, "chart-worker-a");
    const firstRow = await requireJobRow(created.jobId);
    await expireLease(created.jobId);

    const second = await claim(workerStore, created.jobId, "chart-worker-b");
    const secondRow = await requireJobRow(created.jobId);
    expect(second.lease.leaseGeneration).toBe(first.lease.leaseGeneration + 1);
    expect(second.attempts).toBe(2);
    expect(secondRow.startedAt?.toISOString()).toBe(firstRow.startedAt?.toISOString());
  });

  it("extends only a live current fence and returns the exact DB-issued lease", async () => {
    const context = await createClientContext();
    const created = await createActiveNatalJob(context);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
    const before = await databaseClock();

    const extended = await workerStore.extendLease({
      jobId: created.jobId,
      workerId: "chart-worker-a",
      leaseGeneration: claimed.lease.leaseGeneration,
      leaseMs: 120_000
    });
    expect(extended).toMatchObject({
      lockedBy: "chart-worker-a",
      leaseGeneration: claimed.lease.leaseGeneration
    });
    expect(Date.parse(extended?.lockedUntil ?? "")).toBeGreaterThanOrEqual(
      before.getTime() + 119_000
    );
    const persisted = await requireJobRow(created.jobId);
    expect(extended?.lockedUntil).toBe(persisted.lockedUntil?.toISOString());
    await expect(
      workerStore.extendLease({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: claimed.lease.leaseGeneration + 1,
        leaseMs: 120_000
      })
    ).resolves.toBeNull();
  });

  it("captures claim, extension and failure clocks only after PostgreSQL row-lock waits", async () => {
    const claimContext = await createClientContext();
    const claimJob = await createActiveNatalJob(claimContext);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const delayedClaim = await runBehindChartJobRowLock(
      claimJob.jobId,
      () =>
        workerStore.claimForProcessing({
          jobId: claimJob.jobId,
          workerId: "chart-worker-claim",
          leaseMs: 500
        }),
      700
    );
    if (delayedClaim.result.kind !== "claimed") throw new Error("Expected delayed claim");
    expect(Date.parse(delayedClaim.result.job.lease.lockedUntil)).toBeGreaterThanOrEqual(
      delayedClaim.precommitDbNow.getTime() + 450
    );

    const extendContext = await createClientContext();
    const extendJob = await createActiveNatalJob(extendContext);
    const extendClaim = await claim(workerStore, extendJob.jobId, "chart-worker-extend");
    const delayedExtension = await runBehindChartJobRowLock(
      extendJob.jobId,
      () =>
        workerStore.extendLease({
          jobId: extendJob.jobId,
          workerId: "chart-worker-extend",
          leaseGeneration: extendClaim.lease.leaseGeneration,
          leaseMs: 500
        }),
      700
    );
    expect(Date.parse(delayedExtension.result?.lockedUntil ?? "")).toBeGreaterThanOrEqual(
      delayedExtension.precommitDbNow.getTime() + 450
    );

    const failureContext = await createClientContext();
    const failureJob = await createActiveNatalJob(failureContext);
    const failureClaim = await claim(workerStore, failureJob.jobId, "chart-worker-failure", 2_000);
    const delayedFailure = await runBehindChartJobRowLock(
      failureJob.jobId,
      () =>
        workerStore.recordAttemptFailure({
          jobId: failureJob.jobId,
          workerId: "chart-worker-failure",
          leaseGeneration: failureClaim.lease.leaseGeneration,
          code: "provider_unavailable",
          reason: "lock wait exceeded the lease",
          disposition: "permanent",
          retryDelayMs: 1_000
        }),
      2_200
    );
    expect(delayedFailure.result).toBeNull();
    await expect(requireJobRow(failureJob.jobId)).resolves.toMatchObject({
      status: "processing",
      lockedBy: "chart-worker-failure",
      lastErrorCode: null,
      lastErrorMessage: null
    });
  });

  it("cancels timed-out claim, heartbeat and completion before a row lock can release", async () => {
    const timedStore = createDrizzleChartWorkerJobStore(runtime.database, {
      operationTimeoutMs: 1_000
    });
    const ordinaryStore = createDrizzleChartWorkerJobStore(runtime.database);

    const claimContext = await createClientContext();
    const claimJob = await createActiveNatalJob(claimContext);
    const claimAttempt = await runTimedOperationBehindChartJobRowLock(claimJob.jobId, () =>
      timedStore.claimForProcessing({
        jobId: claimJob.jobId,
        workerId: "chart-worker-timeout-claim",
        leaseMs: 60_000
      })
    );

    const heartbeatContext = await createClientContext();
    const heartbeatJob = await createActiveNatalJob(heartbeatContext);
    const heartbeatClaim = await claim(
      ordinaryStore,
      heartbeatJob.jobId,
      "chart-worker-timeout-heartbeat"
    );
    const heartbeatBefore = await requireJobRow(heartbeatJob.jobId);
    const heartbeatAttempt = await runTimedOperationBehindChartJobRowLock(heartbeatJob.jobId, () =>
      timedStore.extendLease({
        jobId: heartbeatJob.jobId,
        workerId: "chart-worker-timeout-heartbeat",
        leaseGeneration: heartbeatClaim.lease.leaseGeneration,
        leaseMs: 120_000
      })
    );

    const completionContext = await createClientContext();
    const completionInput = natalInput(completionContext);
    const completionJob = await createActiveNatalJob(completionContext, completionInput);
    const completionClaim = await claim(
      ordinaryStore,
      completionJob.jobId,
      "chart-worker-timeout-complete"
    );
    const completionResult = natalResult(completionInput.inputSnapshot);
    const completionAttempt = await runTimedOperationBehindChartJobRowLock(
      completionJob.jobId,
      () =>
        timedStore.complete({
          jobId: completionJob.jobId,
          workerId: "chart-worker-timeout-complete",
          leaseGeneration: completionClaim.lease.leaseGeneration,
          result: completionResult,
          resultChecksum: sha256CanonicalJson(completionResult as CanonicalJson)
        })
    );

    for (const attempt of [claimAttempt, heartbeatAttempt, completionAttempt]) {
      expect(attempt.beforeUnlock).toMatchObject({ kind: "rejected" });
      expect(attempt.settled).toMatchObject({ kind: "rejected" });
      if (attempt.beforeUnlock.kind !== "rejected") {
        throw new Error("Expected PostgreSQL to cancel the blocked chart-job operation");
      }
      expect(["55P03", "57014"]).toContain(readPostgresErrorCode(attempt.beforeUnlock.error));
    }
    await expect(requireJobRow(claimJob.jobId)).resolves.toMatchObject({
      status: "queued",
      attempts: 0,
      leaseGeneration: 0,
      lockedBy: null,
      lockedUntil: null
    });
    await expect(requireJobRow(heartbeatJob.jobId)).resolves.toMatchObject({
      status: "processing",
      lockedUntil: heartbeatBefore.lockedUntil,
      updatedAt: heartbeatBefore.updatedAt
    });
    await expect(requireJobRow(completionJob.jobId)).resolves.toMatchObject({
      status: "processing",
      resultCalculationId: null,
      resultChecksum: null,
      resultReproducibilityFingerprint: null
    });
    await expect(ownerCalculations(completionContext.ownerUserId)).resolves.toEqual([]);
  }, 15_000);

  it("rejects stale completion and attempt failure without side effects", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const created = await createActiveNatalJob(context, input);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const first = await claim(workerStore, created.jobId, "chart-worker-a");
    await expireLease(created.jobId);
    await claim(workerStore, created.jobId, "chart-worker-b");
    const result = natalResult(input.inputSnapshot);

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: first.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      })
    ).resolves.toBe(false);
    await expect(
      workerStore.recordAttemptFailure({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: first.lease.leaseGeneration,
        code: "provider_unavailable",
        reason: "temporary provider outage",
        disposition: "retryable",
        retryDelayMs: 1_000
      })
    ).resolves.toBeNull();
    await expect(ownerCalculations(context.ownerUserId)).resolves.toEqual([]);
  });

  it("rolls back result writes when the lease expires behind a participant lock", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const created = await createActiveNatalJob(context, input);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-a", 2_000);
    const result = natalResult(input.inputSnapshot);
    const blocker = await runtime.pool.connect();
    let transactionOpen = false;
    try {
      await blocker.query("begin");
      transactionOpen = true;
      const blockerPid = await readBackendPid(blocker);
      await blocker.query(
        `select client_user_id
         from client_astrologer_relationships
         where astrologer_user_id = $1 and client_user_id = $2
         for update`,
        [context.ownerUserId, context.subjectClientId]
      );
      const pending = workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      });
      await waitForBlockedQuery(blockerPid, "client_astrologer_relationships");
      await new Promise((resolve) => setTimeout(resolve, 2_200));
      await blocker.query("commit");
      transactionOpen = false;

      await expect(pending).resolves.toBe(false);
    } finally {
      if (transactionOpen) await blocker.query("rollback");
      blocker.release();
    }
    await expect(ownerCalculations(context.ownerUserId)).resolves.toEqual([]);
    await expect(requireJobRow(created.jobId)).resolves.toMatchObject({
      status: "processing",
      resultCalculationId: null,
      resultReproducibilityFingerprint: null
    });
    const persistedParticipants = await runtime.pool.query(
      `select p.id
       from calculation_participants p
       inner join calculation_records c on c.id = p.calculation_id
       where c.owner_user_id = $1`,
      [context.ownerUserId]
    );
    expect(persistedParticipants.rows).toEqual([]);
  });

  it("schedules retryable outbox delivery from PostgreSQL time and caps durable attempts", async () => {
    const context = await createClientContext();
    const created = await createActiveNatalJobAndRequest(
      context,
      natalInput(context, { maxAttempts: 2 })
    );
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    await markChartOutboxPublished(created.jobId);
    const first = await claim(workerStore, created.jobId, "chart-worker-a");
    const oldDeadline = first.lease.lockedUntil;

    await expect(
      workerStore.recordAttemptFailure({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: first.lease.leaseGeneration,
        code: "provider_unavailable",
        reason: "temporary provider outage",
        disposition: "retryable",
        retryDelayMs: 60_000
      })
    ).resolves.toEqual({ kind: "requeued", attempts: 1, maxAttempts: 2 });
    const rearmed = await requireChartOutboxRow(created.jobId);
    const requeued = await requireJobRow(created.jobId);
    expect(rearmed).toMatchObject({
      payload: { jobId: created.jobId },
      status: "pending",
      attempts: 0,
      lockedAt: null,
      publishedAt: null,
      lastError: null
    });
    expect(rearmed.availableAt.getTime() - requeued.updatedAt.getTime()).toBe(60_000);
    const second = await claim(workerStore, created.jobId, "chart-worker-b");
    expect(Date.now()).toBeLessThan(Date.parse(oldDeadline));
    expect(second.attempts).toBe(2);
    await expect(
      workerStore.recordAttemptFailure({
        jobId: created.jobId,
        workerId: "chart-worker-b",
        leaseGeneration: second.lease.leaseGeneration,
        code: "provider_unavailable",
        reason: "still unavailable",
        disposition: "retryable",
        retryDelayMs: 60_000
      })
    ).resolves.toEqual({ kind: "failed", attempts: 2, maxAttempts: 2 });
  });

  it("terminalizes permanent failure and rejects oversize or blank failure authority", async () => {
    const context = await createClientContext();
    const created = await createActiveNatalJob(context);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
    const base = {
      jobId: created.jobId,
      workerId: "chart-worker-a",
      leaseGeneration: claimed.lease.leaseGeneration,
      disposition: "permanent" as const,
      retryDelayMs: 1_000
    };

    await expect(
      workerStore.recordAttemptFailure({ ...base, code: " ", reason: "fatal" })
    ).rejects.toThrow("CHART_JOB_FAILURE_CODE_INVALID");
    await expect(
      workerStore.recordAttemptFailure({ ...base, code: "fatal", reason: "x".repeat(501) })
    ).rejects.toThrow("CHART_JOB_FAILURE_REASON_INVALID");
    await expect(
      workerStore.recordAttemptFailure({
        ...base,
        code: "fatal",
        reason: "invalid disposition",
        disposition: "transient" as never
      })
    ).rejects.toThrow("CHART_JOB_FAILURE_DISPOSITION_INVALID");
    await expect(requireJobRow(created.jobId)).resolves.toMatchObject({
      status: "processing",
      lockedBy: "chart-worker-a",
      leaseGeneration: claimed.lease.leaseGeneration,
      lastErrorCode: null,
      lastErrorMessage: null
    });
    await expect(
      workerStore.recordAttemptFailure({
        ...base,
        code: "invalid_provider_result",
        reason: "Provider result is permanently invalid"
      })
    ).resolves.toEqual({ kind: "failed", attempts: 1, maxAttempts: 3 });
  });

  it("atomically recovers expired work, re-arms delivery, and terminalizes exhausted work", async () => {
    const firstContext = await createClientContext();
    const secondContext = await createClientContext();
    const thirdContext = await createClientContext();
    const fourthContext = await createClientContext();
    const first = await createActiveNatalJobAndRequest(
      firstContext,
      natalInput(firstContext, { maxAttempts: 1 })
    );
    const second = await createActiveNatalJobAndRequest(
      secondContext,
      natalInput(secondContext, { maxAttempts: 2 })
    );
    const third = await createActiveNatalJobAndRequest(
      thirdContext,
      natalInput(thirdContext, { maxAttempts: 1 })
    );
    const fourth = await createActiveNatalJobAndRequest(
      fourthContext,
      natalInput(fourthContext, { maxAttempts: 2 })
    );
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    await claim(workerStore, first.jobId, "chart-worker-a", 1);
    await claim(workerStore, second.jobId, "chart-worker-b", 1);
    await claim(workerStore, third.jobId, "chart-worker-c", 1);
    await claim(workerStore, fourth.jobId, "chart-worker-d", 1);
    await markChartOutboxPublished(second.jobId);
    await markChartOutboxPublished(third.jobId);
    await markChartOutboxPublished(fourth.jobId);
    await expireLeaseAt(first.jobId, "2000-01-01T00:00:00.000Z");
    await expireLeaseAt(second.jobId, "2000-01-02T00:00:00.000Z");
    await expireLeaseAt(third.jobId, "2000-01-03T00:00:00.000Z");
    await expireLeaseAt(fourth.jobId, "2000-01-04T00:00:00.000Z");

    await expect(
      workerStore.claimForProcessing({
        jobId: first.jobId,
        workerId: "chart-worker-delivery",
        leaseMs: 60_000
      })
    ).resolves.toEqual({ kind: "exhausted", jobId: first.jobId, attempts: 1, maxAttempts: 1 });
    await expect(workerStore.recoverExpired({ limit: 2 })).resolves.toEqual({
      requeuedJobIds: [second.jobId],
      failedJobIds: [third.jobId]
    });
    await expect(requireJobRow(second.jobId)).resolves.toMatchObject({
      status: "queued",
      lockedBy: null,
      lockedUntil: null,
      attempts: 1
    });
    await expect(requireChartOutboxRow(second.jobId)).resolves.toMatchObject({
      status: "pending",
      attempts: 0,
      lockedAt: null,
      publishedAt: null,
      lastError: null
    });
    await expect(requireJobRow(third.jobId)).resolves.toMatchObject({
      status: "failed",
      lastErrorCode: "retry_exhausted"
    });
    await expect(requireJobRow(fourth.jobId)).resolves.toMatchObject({
      status: "processing",
      lockedBy: "chart-worker-d",
      attempts: 1
    });
    await expect(workerStore.recoverExpired({ limit: 0 })).rejects.toThrow(
      "CHART_JOB_SWEEP_LIMIT_INVALID"
    );
  });

  it("exposes typed delivery state for every durable lifecycle state", async () => {
    const context = await createClientContext();
    const created = await createActiveNatalJob(context);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);

    await expect(workerStore.getDeliveryState(created.jobId)).resolves.toEqual({
      kind: "queued",
      attempts: 0,
      maxAttempts: 3
    });
    const claimed = await claim(workerStore, created.jobId, "chart-worker-state");
    await expect(workerStore.getDeliveryState(created.jobId)).resolves.toEqual({
      kind: "processing",
      attempts: 1,
      maxAttempts: 3
    });
    await workerStore.recordAttemptFailure({
      jobId: created.jobId,
      workerId: "chart-worker-state",
      leaseGeneration: claimed.lease.leaseGeneration,
      code: "invalid_provider_result",
      reason: "Provider result is permanently invalid",
      disposition: "permanent",
      retryDelayMs: 1_000
    });
    await expect(workerStore.getDeliveryState(created.jobId)).resolves.toEqual({
      kind: "failed",
      attempts: 1,
      maxAttempts: 3
    });
    await expect(workerStore.getDeliveryState(randomUUID())).resolves.toBeNull();
  });

  it("rearms a queued job whose previously published Bull delivery disappeared", async () => {
    const context = await createClientContext();
    const created = await createActiveNatalJobAndRequest(context);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    await markChartOutboxPublished(created.jobId);

    await expect(workerStore.recoverPendingDeliveries({ limit: 10 })).resolves.toEqual({
      rearmedJobIds: [created.jobId]
    });
    await expect(requireChartOutboxRow(created.jobId)).resolves.toMatchObject({
      status: "pending",
      attempts: 0,
      lockedAt: null,
      publishedAt: null,
      lastError: null
    });
  });

  it("fails closed when a queued legacy row reaches a v2 delivery", async () => {
    const context = await createClientContext();
    const created = await createActiveNatalJob(context);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    await runtime.pool.query(
      `update chart_calculation_jobs
       set schema_version = 'chart-result.v1', method_version = null, execution_profile = null
       where id = $1`,
      [created.jobId]
    );

    await expect(workerStore.getQueueDispatch(created.jobId)).resolves.toBeNull();
    await expect(
      workerStore.claimForProcessing({
        jobId: created.jobId,
        workerId: "chart-worker-invalid",
        leaseMs: 60_000
      })
    ).resolves.toEqual({ kind: "not_claimable" });
    await expect(requireJobRow(created.jobId)).resolves.toMatchObject({
      status: "failed",
      attempts: 0,
      lastErrorCode: "chart_job_durable_state_invalid",
      lastErrorMessage: "Chart calculation durable state is invalid"
    });
  });

  it("fails closed instead of requeueing an expired corrupt processing row", async () => {
    const context = await createClientContext();
    const created = await createActiveNatalJobAndRequest(context);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    await claim(workerStore, created.jobId, "chart-worker-invalid");
    await markChartOutboxPublished(created.jobId);
    await runtime.pool.query(
      `update chart_calculation_jobs
       set schema_version = 'chart-result.v1', method_version = null, execution_profile = null,
           locked_until = '1999-01-01T00:00:00.000Z'::timestamptz
       where id = $1`,
      [created.jobId]
    );

    await expect(workerStore.recoverExpired({ limit: 1 })).resolves.toEqual({
      requeuedJobIds: [],
      failedJobIds: [created.jobId]
    });
    await expect(requireJobRow(created.jobId)).resolves.toMatchObject({
      status: "failed",
      lastErrorCode: "chart_job_durable_state_invalid",
      lastErrorMessage: "Chart calculation durable state is invalid"
    });
    await expect(requireChartOutboxRow(created.jobId)).resolves.toMatchObject({
      status: "published"
    });
  });

  it.each(["checksum", "reproducibility", "profile"] as const)(
    "rejects mismatched %s evidence without result writes",
    async (mismatch) => {
      const context = await createClientContext();
      const input = natalInput(context);
      const created = await createActiveNatalJob(context, input);
      const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
      const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
      let result = natalResult(input.inputSnapshot);
      if (mismatch === "reproducibility") {
        result = { ...result, reproducibilityFingerprint: digest("0") };
      }
      if (mismatch === "profile") {
        result = chartResultSchema.parse({
          ...result,
          provider: {
            ...result.provider,
            ephemeris: "swiss-ephemeris",
            ephemerisFlags: ["FLG_SWIEPH", "FLG_SPEED"],
            ephemerisDataRevision: digest("a")
          },
          reproducibilityFingerprint: digest("0")
        }) as ReproducibleChartResult;
        result = {
          ...result,
          reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(result)
        };
      }
      const checksum =
        mismatch === "checksum" ? digest("f") : sha256CanonicalJson(result as CanonicalJson);

      await expect(
        workerStore.complete({
          jobId: created.jobId,
          workerId: "chart-worker-a",
          leaseGeneration: claimed.lease.leaseGeneration,
          result,
          resultChecksum: checksum
        })
      ).rejects.toThrow();
      await expect(ownerCalculations(context.ownerUserId)).resolves.toEqual([]);
    }
  );

  it("persists canonical success with DB-issued lifecycle time and rejects late failure", async () => {
    const context = await createClientContext();
    const input = natalInput(context, { interpretationMode: "child" });
    const created = await createActiveNatalJob(context, input);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
    const result = natalResult(input.inputSnapshot);
    const checksum = sha256CanonicalJson(result as CanonicalJson);

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: checksum
      })
    ).resolves.toBe(true);
    const job = await requireJobRow(created.jobId);
    expect(job).toMatchObject({
      status: "succeeded",
      resultReproducibilityFingerprint: result.reproducibilityFingerprint
    });
    expect(job.finishedAt?.getTime()).toBeGreaterThan(job.startedAt?.getTime() ?? 0);
    const calculations = await ownerCalculations(context.ownerUserId);
    expect(calculations).toHaveLength(1);
    expect(calculations[0]).toMatchObject({
      resultChecksum: checksum,
      mode: "individual",
      interpretationMode: "child"
    });
    await expect(
      workerStore.recordAttemptFailure({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: claimed.lease.leaseGeneration,
        code: "late_failure",
        reason: "late delivery",
        disposition: "permanent",
        retryDelayMs: 1_000
      })
    ).resolves.toBeNull();
  });

  it("preserves historical job checksums and keeps recalculation commands out of calculation identity", async () => {
    const context = await createClientContext();
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const initialInput = natalInput(context);
    const initial = await createActiveNatalJob(context, initialInput);
    const initialClaim = await claim(workerStore, initial.jobId, "chart-worker-initial");
    const initialResult = natalResult(
      initialInput.inputSnapshot,
      initialInput.settingsSnapshot as ReturnType<typeof settings>
    );
    const initialChecksum = sha256CanonicalJson(initialResult as CanonicalJson);
    await workerStore.complete({
      jobId: initial.jobId,
      workerId: "chart-worker-initial",
      leaseGeneration: initialClaim.lease.leaseGeneration,
      result: initialResult,
      resultChecksum: initialChecksum
    });
    const initialJob = await requireJobRow(initial.jobId);
    const targetCalculationId =
      initialJob.resultCalculationId ?? raise("Expected initial calculation id");
    expect(initialJob.resultChecksum).toBe(initialChecksum);

    const replacementSettings = { ...settings(), houseSystem: "whole_sign" as const };
    const replacementInput = replacementNatalInput(context, targetCalculationId, initialChecksum, {
      settingsSnapshot: replacementSettings
    });
    const replacement = await createActiveNatalJob(context, replacementInput);
    const replacementClaim = await claim(
      workerStore,
      replacement.jobId,
      "chart-worker-replacement"
    );
    const replacementResult = natalResult(replacementInput.inputSnapshot, replacementSettings);
    const replacementChecksum = sha256CanonicalJson(replacementResult as CanonicalJson);
    await workerStore.complete({
      jobId: replacement.jobId,
      workerId: "chart-worker-replacement",
      leaseGeneration: replacementClaim.lease.leaseGeneration,
      result: replacementResult,
      resultChecksum: replacementChecksum
    });

    await expect(requireJobRow(initial.jobId)).resolves.toMatchObject({
      status: "succeeded",
      resultCalculationId: targetCalculationId,
      resultChecksum: initialChecksum
    });
    await expect(requireJobRow(replacement.jobId)).resolves.toMatchObject({
      status: "succeeded",
      targetCalculationId,
      resultCalculationId: targetCalculationId,
      expectedSourceChecksum: initialChecksum,
      resultChecksum: replacementChecksum
    });
    const replacementCalculationFingerprint = calculationRequestFingerprint(replacementInput);
    await expect(
      runtime.database.query.calculationRecords.findFirst({
        where: eq(calculationRecords.id, targetCalculationId)
      })
    ).resolves.toMatchObject({
      requestFingerprint: replacementCalculationFingerprint,
      resultChecksum: replacementChecksum,
      interpretationMode: "adult_natal"
    });
    expect(replacementCalculationFingerprint).not.toBe(replacementInput.inputFingerprint);

    const repeatedOriginal = await jobStore.createOrReuseNatalJob(initialInput);
    expect(repeatedOriginal).toMatchObject({ kind: "active_job" });
    if (repeatedOriginal.kind !== "active_job") throw new Error("Expected original input requeue");
    const repeatClaim = await claim(workerStore, repeatedOriginal.jobId, "chart-worker-original");
    await workerStore.complete({
      jobId: repeatedOriginal.jobId,
      workerId: "chart-worker-original",
      leaseGeneration: repeatClaim.lease.leaseGeneration,
      result: initialResult,
      resultChecksum: initialChecksum
    });
    const repeatedJob = await requireJobRow(repeatedOriginal.jobId);
    const repeatedCalculationId =
      repeatedJob.resultCalculationId ?? raise("Expected repeated original calculation id");
    expect(repeatedCalculationId).not.toBe(targetCalculationId);
    await expect(jobStore.createOrReuseNatalJob(initialInput)).resolves.toMatchObject({
      kind: "existing_result",
      calculationId: repeatedCalculationId
    });

    const changedSettings = { ...settings(), orbMultiplier: 1.25 };
    const changedInput = natalInput(context, { settingsSnapshot: changedSettings });
    const changed = await jobStore.createOrReuseNatalJob(changedInput);
    expect(changed).toMatchObject({ kind: "active_job" });
    if (changed.kind !== "active_job") throw new Error("Expected changed settings job");
    const changedClaim = await claim(workerStore, changed.jobId, "chart-worker-changed");
    const changedResult = natalResult(changedInput.inputSnapshot, changedSettings);
    const changedChecksum = sha256CanonicalJson(changedResult as CanonicalJson);
    await workerStore.complete({
      jobId: changed.jobId,
      workerId: "chart-worker-changed",
      leaseGeneration: changedClaim.lease.leaseGeneration,
      result: changedResult,
      resultChecksum: changedChecksum
    });
    const changedJob = await requireJobRow(changed.jobId);
    await expect(jobStore.createOrReuseNatalJob(changedInput)).resolves.toMatchObject({
      kind: "existing_result",
      calculationId: changedJob.resultCalculationId
    });
    await expect(ownerCalculations(context.ownerUserId)).resolves.toHaveLength(3);
  });

  it("does not treat an unrelated historical checksum as explicitly superseded", async () => {
    const context = await createClientContext();
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const initialInput = natalInput(context);
    const initial = await createActiveNatalJob(context, initialInput);
    const initialClaim = await claim(workerStore, initial.jobId, "chart-worker-chain-source");
    const initialResult = natalResult(initialInput.inputSnapshot);
    const initialChecksum = sha256CanonicalJson(initialResult as CanonicalJson);
    await workerStore.complete({
      jobId: initial.jobId,
      workerId: "chart-worker-chain-source",
      leaseGeneration: initialClaim.lease.leaseGeneration,
      result: initialResult,
      resultChecksum: initialChecksum
    });
    const targetCalculationId =
      (await requireJobRow(initial.jobId)).resultCalculationId ??
      raise("Expected initial calculation id");

    const replacementSettings = { ...settings(), houseSystem: "whole_sign" as const };
    const replacementInput = replacementNatalInput(context, targetCalculationId, initialChecksum, {
      settingsSnapshot: replacementSettings
    });
    const replacement = await createActiveNatalJob(context, replacementInput);
    const replacementClaim = await claim(
      workerStore,
      replacement.jobId,
      "chart-worker-chain-terminal"
    );
    const replacementResult = natalResult(replacementInput.inputSnapshot, replacementSettings);
    await workerStore.complete({
      jobId: replacement.jobId,
      workerId: "chart-worker-chain-terminal",
      leaseGeneration: replacementClaim.lease.leaseGeneration,
      result: replacementResult,
      resultChecksum: sha256CanonicalJson(replacementResult as CanonicalJson)
    });

    const unrelatedChecksum = digest("f");
    await runtime.database.insert(chartCalculationJobs).values({
      ownerUserId: context.ownerUserId,
      clientId: context.subjectClientId,
      resultCalculationId: targetCalculationId,
      method: "natal",
      methodVersion: initialInput.methodVersion,
      status: "succeeded",
      inputFingerprint: initialInput.inputFingerprint,
      inputSnapshot: initialInput.inputSnapshot,
      settingsSnapshot: initialInput.settingsSnapshot,
      participantSnapshot: initialInput.participants,
      schemaVersion: "chart-result.v2",
      executionProfile: initialInput.executionProfile,
      attempts: 1,
      maxAttempts: 3,
      leaseGeneration: 1,
      resultChecksum: unrelatedChecksum,
      resultReproducibilityFingerprint: initialResult.reproducibilityFingerprint,
      startedAt: new Date("2026-08-03T18:00:00.000Z"),
      finishedAt: new Date("2026-08-03T18:01:00.000Z")
    });

    const branchChecksum = digest("e");
    const firstCycleInput = replacementNatalInput(context, targetCalculationId, unrelatedChecksum, {
      settingsSnapshot: { ...settings(), orbMultiplier: 1.5 }
    });
    const secondCycleInput = replacementNatalInput(context, targetCalculationId, branchChecksum, {
      settingsSnapshot: { ...settings(), orbMultiplier: 1.75 }
    });
    const deadBranchInput = replacementNatalInput(context, targetCalculationId, unrelatedChecksum, {
      settingsSnapshot: { ...settings(), orbMultiplier: 2 }
    });
    await runtime.database.insert(chartCalculationJobs).values([
      {
        ownerUserId: context.ownerUserId,
        clientId: context.subjectClientId,
        resultCalculationId: targetCalculationId,
        method: "natal",
        methodVersion: firstCycleInput.methodVersion,
        status: "succeeded",
        inputFingerprint: firstCycleInput.inputFingerprint,
        inputSnapshot: firstCycleInput.inputSnapshot,
        settingsSnapshot: firstCycleInput.settingsSnapshot,
        participantSnapshot: firstCycleInput.participants,
        schemaVersion: "chart-result.v2",
        executionProfile: firstCycleInput.executionProfile,
        attempts: 1,
        maxAttempts: 3,
        leaseGeneration: 1,
        targetCalculationId,
        expectedSourceChecksum: unrelatedChecksum,
        resultChecksum: branchChecksum,
        resultReproducibilityFingerprint: initialResult.reproducibilityFingerprint,
        startedAt: new Date("2026-08-03T18:02:00.000Z"),
        finishedAt: new Date("2026-08-03T18:03:00.000Z")
      },
      {
        ownerUserId: context.ownerUserId,
        clientId: context.subjectClientId,
        resultCalculationId: targetCalculationId,
        method: "natal",
        methodVersion: secondCycleInput.methodVersion,
        status: "succeeded",
        inputFingerprint: secondCycleInput.inputFingerprint,
        inputSnapshot: secondCycleInput.inputSnapshot,
        settingsSnapshot: secondCycleInput.settingsSnapshot,
        participantSnapshot: secondCycleInput.participants,
        schemaVersion: "chart-result.v2",
        executionProfile: secondCycleInput.executionProfile,
        attempts: 1,
        maxAttempts: 3,
        leaseGeneration: 1,
        targetCalculationId,
        expectedSourceChecksum: branchChecksum,
        resultChecksum: unrelatedChecksum,
        resultReproducibilityFingerprint: initialResult.reproducibilityFingerprint,
        startedAt: new Date("2026-08-03T18:04:00.000Z"),
        finishedAt: new Date("2026-08-03T18:05:00.000Z")
      },
      {
        ownerUserId: context.ownerUserId,
        clientId: context.subjectClientId,
        resultCalculationId: targetCalculationId,
        method: "natal",
        methodVersion: deadBranchInput.methodVersion,
        status: "succeeded",
        inputFingerprint: deadBranchInput.inputFingerprint,
        inputSnapshot: deadBranchInput.inputSnapshot,
        settingsSnapshot: deadBranchInput.settingsSnapshot,
        participantSnapshot: deadBranchInput.participants,
        schemaVersion: "chart-result.v2",
        executionProfile: deadBranchInput.executionProfile,
        attempts: 1,
        maxAttempts: 3,
        leaseGeneration: 1,
        targetCalculationId,
        expectedSourceChecksum: unrelatedChecksum,
        resultChecksum: digest("d"),
        resultReproducibilityFingerprint: initialResult.reproducibilityFingerprint,
        startedAt: new Date("2026-08-03T18:02:30.000Z"),
        finishedAt: new Date("2026-08-03T18:03:30.000Z")
      }
    ]);

    await expect(jobStore.createOrReuseNatalJob(initialInput)).rejects.toBeInstanceOf(
      ChartStoredResultIntegrityError
    );
  });

  it("accepts an explicitly linked multi-hop replacement chain", async () => {
    const context = await createClientContext();
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const initialInput = natalInput(context);
    const initial = await createActiveNatalJob(context, initialInput);
    const initialClaim = await claim(workerStore, initial.jobId, "chart-worker-multi-hop-source");
    const initialResult = natalResult(initialInput.inputSnapshot);
    const initialChecksum = sha256CanonicalJson(initialResult as CanonicalJson);
    await workerStore.complete({
      jobId: initial.jobId,
      workerId: "chart-worker-multi-hop-source",
      leaseGeneration: initialClaim.lease.leaseGeneration,
      result: initialResult,
      resultChecksum: initialChecksum
    });
    const targetCalculationId =
      (await requireJobRow(initial.jobId)).resultCalculationId ??
      raise("Expected initial calculation id");

    const firstReplacementSettings = { ...settings(), houseSystem: "whole_sign" as const };
    const firstReplacementInput = replacementNatalInput(
      context,
      targetCalculationId,
      initialChecksum,
      { settingsSnapshot: firstReplacementSettings }
    );
    const firstReplacement = await createActiveNatalJob(context, firstReplacementInput);
    const firstReplacementClaim = await claim(
      workerStore,
      firstReplacement.jobId,
      "chart-worker-multi-hop-first"
    );
    const firstReplacementResult = natalResult(
      firstReplacementInput.inputSnapshot,
      firstReplacementSettings
    );
    const firstReplacementChecksum = sha256CanonicalJson(firstReplacementResult as CanonicalJson);
    await workerStore.complete({
      jobId: firstReplacement.jobId,
      workerId: "chart-worker-multi-hop-first",
      leaseGeneration: firstReplacementClaim.lease.leaseGeneration,
      result: firstReplacementResult,
      resultChecksum: firstReplacementChecksum
    });

    const secondReplacementSettings = {
      ...settings(),
      houseSystem: "whole_sign" as const,
      orbMultiplier: 1.25
    };
    const secondReplacementInput = replacementNatalInput(
      context,
      targetCalculationId,
      firstReplacementChecksum,
      { settingsSnapshot: secondReplacementSettings }
    );
    const secondReplacement = await createActiveNatalJob(context, secondReplacementInput);
    const secondReplacementClaim = await claim(
      workerStore,
      secondReplacement.jobId,
      "chart-worker-multi-hop-terminal"
    );
    const secondReplacementResult = natalResult(
      secondReplacementInput.inputSnapshot,
      secondReplacementSettings
    );
    const secondReplacementChecksum = sha256CanonicalJson(secondReplacementResult as CanonicalJson);
    await workerStore.complete({
      jobId: secondReplacement.jobId,
      workerId: "chart-worker-multi-hop-terminal",
      leaseGeneration: secondReplacementClaim.lease.leaseGeneration,
      result: secondReplacementResult,
      resultChecksum: secondReplacementChecksum
    });

    await expect(requireJobRow(firstReplacement.jobId)).resolves.toMatchObject({
      expectedSourceChecksum: initialChecksum,
      resultChecksum: firstReplacementChecksum
    });
    await expect(requireJobRow(secondReplacement.jobId)).resolves.toMatchObject({
      expectedSourceChecksum: firstReplacementChecksum,
      resultChecksum: secondReplacementChecksum
    });
    await expect(jobStore.createOrReuseNatalJob(initialInput)).resolves.toMatchObject({
      kind: "active_job"
    });
  });

  it("backfills a predecessor succeeded-job checksum only from canonical stored evidence", async () => {
    const predecessorDatabaseName = `${isolatedDatabaseName}_predecessor`;
    const predecessorDatabaseUrl = withDatabaseName(databaseUrl, predecessorDatabaseName);
    const predecessorRuntime = createPostgresRuntime({ DATABASE_URL: predecessorDatabaseUrl });
    const predecessorClient = new Client({ connectionString: predecessorDatabaseUrl });
    try {
      await adminClient.query(`CREATE DATABASE "${predecessorDatabaseName}"`);
      await predecessorRuntime.pool.query(
        readFileSync("packages/db/drizzle/0000_sticky_rictor.sql", "utf8")
      );
      await predecessorClient.connect();
      await augmentIsolatedSchemaForCurrentSources(predecessorClient);

      const context = {
        ownerUserId: randomUUID(),
        subjectClientId: randomUUID(),
        partnerClientId: randomUUID()
      } satisfies ClientContext;
      await predecessorRuntime.pool.query(
        `insert into users (id, status) values ($1, 'active'), ($2, 'active')`,
        [context.ownerUserId, context.subjectClientId]
      );
      await predecessorRuntime.pool.query(
        `insert into client_profiles (user_id, display_name_snapshot)
         values ($1, 'Predecessor chart subject')`,
        [context.subjectClientId]
      );
      await predecessorRuntime.pool.query(
        `insert into client_astrologer_relationships (
           client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at
         ) values ($1, $2, 'manual', 'active', clock_timestamp(), clock_timestamp())`,
        [context.subjectClientId, context.ownerUserId]
      );

      const input = natalInput(context);
      const jobStore = createDrizzleChartCalculationJobStore(predecessorRuntime.database);
      const workerStore = createDrizzleChartWorkerJobStore(predecessorRuntime.database);
      const created = await jobStore.createOrReuseNatalJob(input);
      if (created.kind !== "active_job") throw new Error("Expected predecessor active job");
      const claimed = await claim(workerStore, created.jobId, "chart-worker-predecessor");
      const result = natalResult(input.inputSnapshot);
      const checksum = sha256CanonicalJson(result as CanonicalJson);
      await workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-predecessor",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: checksum
      });
      const succeeded = await predecessorRuntime.database.query.chartCalculationJobs.findFirst({
        where: eq(chartCalculationJobs.id, created.jobId)
      });
      const calculationId =
        succeeded?.resultCalculationId ?? raise("Expected predecessor calculation id");
      await predecessorRuntime.pool.query(
        "update calculation_records set request_fingerprint = $2 where id = $1",
        [calculationId, input.inputFingerprint]
      );

      await downgradeChartJobsToResultChecksumPredecessor(predecessorClient);
      await predecessorClient.query("begin");
      try {
        await reconcileChartCalculationJobsIfPrerequisitesExist(predecessorClient);
        await predecessorClient.query("commit");
      } catch (error) {
        await predecessorClient.query("rollback");
        throw error;
      }

      await expect(
        predecessorClient.query<{ result_checksum: string | null }>(
          "select result_checksum from chart_calculation_jobs where id = $1",
          [created.jobId]
        )
      ).resolves.toMatchObject({ rows: [{ result_checksum: checksum }] });
      await expect(
        predecessorClient.query(
          "update chart_calculation_jobs set result_checksum = $2 where id = $1",
          [created.jobId, digest("f")]
        )
      ).rejects.toMatchObject({
        code: "55000",
        constraint: "chart_calculation_jobs_result_checksum_immutable"
      });
    } finally {
      await predecessorClient.end().catch(() => undefined);
      await predecessorRuntime.close();
      await adminClient.query(`DROP DATABASE IF EXISTS "${predecessorDatabaseName}" WITH (FORCE)`);
    }
  }, 30_000);

  it("rejects mutation of a succeeded job result checksum", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const created = await createActiveNatalJob(context, input);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-immutable");
    const result = natalResult(input.inputSnapshot);
    await workerStore.complete({
      jobId: created.jobId,
      workerId: "chart-worker-immutable",
      leaseGeneration: claimed.lease.leaseGeneration,
      result,
      resultChecksum: sha256CanonicalJson(result as CanonicalJson)
    });
    const succeeded = await requireJobRow(created.jobId);
    expect(succeeded).toMatchObject({
      status: "succeeded",
      resultChecksum: sha256CanonicalJson(result as CanonicalJson)
    });
    const forgedChecksum = succeeded.resultChecksum === digest("f") ? digest("e") : digest("f");
    const directClient = await runtime.pool.connect();
    try {
      await expect(
        directClient.query(
          `select status, result_checksum as "resultChecksum"
             from chart_calculation_jobs
            where id = $1`,
          [created.jobId]
        )
      ).resolves.toMatchObject({
        rows: [{ status: "succeeded", resultChecksum: succeeded.resultChecksum }]
      });
      await expect(directClient.query("show session_replication_role")).resolves.toMatchObject({
        rows: [{ session_replication_role: "origin" }]
      });
      await expect(
        directClient.query(
          `select trigger_record.tgenabled as enabled,
                  pg_get_triggerdef(trigger_record.oid, false) as definition
             from pg_trigger as trigger_record
            where trigger_record.tgrelid = 'chart_calculation_jobs'::regclass
              and trigger_record.tgname = 'chart_calculation_jobs_result_checksum_immutable'
              and not trigger_record.tgisinternal`
        )
      ).resolves.toMatchObject({
        rows: [
          {
            enabled: "O",
            definition: expect.stringContaining("BEFORE UPDATE OF result_checksum")
          }
        ]
      });
      await expect(
        directClient.query("update chart_calculation_jobs set result_checksum = $2 where id = $1", [
          created.jobId,
          forgedChecksum
        ])
      ).rejects.toMatchObject({
        code: "55000",
        constraint: "chart_calculation_jobs_result_checksum_immutable"
      });
    } finally {
      directClient.release();
    }
  });

  it.each([
    "checksum",
    "calculation_metadata",
    "input_data",
    "participant_deleted",
    "participant_mismatched"
  ] as const)(
    "fails closed on corrupt active v2 %s without queuing doomed work",
    async (corruption) => {
      const context = await createClientContext();
      const input = natalInput(context);
      const created = await createActiveNatalJob(context, input);
      const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
      const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
      const result = natalResult(input.inputSnapshot);
      await workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      });
      const succeeded = await requireJobRow(created.jobId);
      const calculationId = succeeded.resultCalculationId ?? raise("Expected calculation id");
      if (corruption === "checksum") {
        await runtime.database
          .update(calculationRecords)
          .set({ resultChecksum: digest("f") })
          .where(eq(calculationRecords.id, calculationId));
      } else if (corruption === "calculation_metadata") {
        await runtime.database
          .update(calculationRecords)
          .set({ module: "matrix", interpretationMode: null })
          .where(eq(calculationRecords.id, calculationId));
      } else if (corruption === "input_data") {
        await runtime.database
          .update(calculationRecords)
          .set({
            inputData: { inputSnapshot: { corrupt: true }, settings: input.settingsSnapshot }
          })
          .where(eq(calculationRecords.id, calculationId));
      } else if (corruption === "participant_deleted") {
        await runtime.database
          .delete(calculationParticipants)
          .where(eq(calculationParticipants.calculationId, calculationId));
      } else {
        await runtime.database
          .update(calculationParticipants)
          .set({ role: "partner" })
          .where(eq(calculationParticipants.calculationId, calculationId));
      }

      const commandStore = createDrizzleChartCalculationCommandStore(runtime.database);
      await expect(
        commandStore.createOrReuseNatalJobAndRequestCalculation({
          ...input,
          now: "2026-08-03T08:00:00.000Z"
        })
      ).rejects.toMatchObject({ code: "CHART_STORED_RESULT_INTEGRITY_INVALID" });
      await expect(ownerJobs(context.ownerUserId)).resolves.toMatchObject([
        { id: created.jobId, status: "succeeded" }
      ]);
      const outbox = await runtime.pool.query(
        `select id from outbox_events where aggregate_id = $1 and event_type = $2`,
        [created.jobId, CHART_CALCULATION_REQUESTED_EVENT]
      );
      expect(outbox.rows).toEqual([]);
    }
  );

  it("persists ordered subject and partner in compatibility mode", async () => {
    const context = await createClientContext();
    const input = compositeInput(context);
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const created = await jobStore.createOrReuseChartJob(input);
    if (created.kind !== "active_job") throw new Error("Expected active job");
    const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
    const result = compositeResult(input);

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      })
    ).resolves.toBe(true);
    const job = await requireJobRow(created.jobId);
    const calculationId = job.resultCalculationId ?? raise("Expected calculation id");
    await expect(
      runtime.database.query.calculationRecords.findFirst({
        where: eq(calculationRecords.id, calculationId)
      })
    ).resolves.toMatchObject({ mode: "compatibility", methodCode: "composite" });
    await expect(
      runtime.database
        .select()
        .from(calculationParticipants)
        .where(eq(calculationParticipants.calculationId, calculationId))
        .orderBy(calculationParticipants.order)
    ).resolves.toMatchObject([
      {
        role: "subject",
        clientId: context.subjectClientId,
        displayName: "Chart Subject",
        order: 0
      },
      { role: "partner", clientId: context.partnerClientId, displayName: "Chart Partner", order: 1 }
    ]);
  });

  it("replaces the exact legacy relationship target through fenced worker completion", async () => {
    const context = await createClientContext();
    const targetCalculationId = randomUUID();
    const sourceChecksum = digest("4");
    const legacySource = legacyCompositeSource(context);
    await runtime.database.insert(calculationRecords).values({
      id: targetCalculationId,
      ownerUserId: context.ownerUserId,
      module: "chart",
      mode: "individual",
      methodCode: "composite",
      title: "Legacy composite",
      status: "calculated",
      requestFingerprint: digest("3"),
      inputData: legacySource.inputData,
      resultData: legacySource.resultData,
      resultSummary: { legacy: true },
      resultChecksum: sourceChecksum
    });
    await runtime.database.insert(calculationParticipants).values({
      calculationId: targetCalculationId,
      role: "subject",
      source: "crm_client",
      clientId: context.subjectClientId,
      displayName: "Saved legacy subject",
      order: 0
    });
    const input = replacementCompositeInput(context, targetCalculationId, sourceChecksum);
    const created = await createDrizzleChartCalculationJobStore(
      runtime.database
    ).createOrReuseChartJob(input);
    if (created.kind !== "active_job") throw new Error("Expected active replacement job");
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-replacement");
    await runtime.pool.query(
      `update client_profiles
       set display_name_snapshot = case user_id when $1 then 'Current subject' else 'Current partner' end,
           updated_at = clock_timestamp()
       where user_id in ($1, $2)`,
      [context.subjectClientId, context.partnerClientId]
    );
    const result = compositeResult(input);

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-replacement",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      })
    ).resolves.toBe(true);

    await expect(requireJobRow(created.jobId)).resolves.toMatchObject({
      status: "succeeded",
      targetCalculationId,
      resultCalculationId: targetCalculationId
    });
    await expect(
      runtime.database.query.calculationRecords.findFirst({
        where: eq(calculationRecords.id, targetCalculationId)
      })
    ).resolves.toMatchObject({
      id: targetCalculationId,
      mode: "compatibility",
      methodCode: "composite",
      requestFingerprint: calculationRequestFingerprint(input),
      resultChecksum: sha256CanonicalJson(result as CanonicalJson),
      resultData: { schemaVersion: "chart-result.v2", method: "composite" }
    });
    await expect(
      runtime.database
        .select()
        .from(calculationParticipants)
        .where(eq(calculationParticipants.calculationId, targetCalculationId))
        .orderBy(calculationParticipants.order)
    ).resolves.toMatchObject([
      { role: "subject", clientId: context.subjectClientId, displayName: "Current subject" },
      { role: "partner", clientId: context.partnerClientId, displayName: "Current partner" }
    ]);
  });

  it.each([
    ["source_changed", "CHART_REPLACEMENT_SOURCE_CHANGED"],
    ["exact_key_conflict", "CHART_REPLACEMENT_EXACT_KEY_CONFLICT"]
  ] as const)(
    "fails replacement deterministically on %s without target mutation",
    async (kind, code) => {
      const context = await createClientContext();
      const targetCalculationId = randomUUID();
      const sourceResult = legacyNatalResult(primarySnapshot());
      const sourceChecksum = sha256CanonicalJson(sourceResult as CanonicalJson);
      await runtime.database.insert(calculationRecords).values({
        id: targetCalculationId,
        ownerUserId: context.ownerUserId,
        module: "chart",
        mode: "individual",
        methodCode: "natal",
        title: "Protected legacy natal",
        status: "calculated",
        requestFingerprint: digest("5"),
        inputData: { inputSnapshot: primarySnapshot(), settings: settings() },
        resultData: sourceResult,
        resultSummary: { legacy: true },
        resultChecksum: sourceChecksum
      });
      await runtime.database.insert(calculationParticipants).values({
        calculationId: targetCalculationId,
        role: "subject",
        source: "crm_client",
        clientId: context.subjectClientId,
        displayName: "Protected subject",
        order: 0
      });
      const input = replacementNatalInput(context, targetCalculationId, sourceChecksum);
      const created = await createDrizzleChartCalculationJobStore(
        runtime.database
      ).createOrReuseNatalJob(input);
      if (created.kind !== "active_job") throw new Error("Expected active replacement job");
      const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
      const claimed = await claim(workerStore, created.jobId, `chart-worker-${kind}`);
      if (kind === "source_changed") {
        await runtime.database
          .update(calculationRecords)
          .set({ resultChecksum: digest("6") })
          .where(eq(calculationRecords.id, targetCalculationId));
      } else {
        await runtime.database.insert(calculationRecords).values({
          ownerUserId: context.ownerUserId,
          module: "chart",
          mode: "individual",
          methodCode: "natal",
          title: "Exact-key collision",
          status: "calculated",
          requestFingerprint: calculationRequestFingerprint(input),
          inputData: {},
          resultData: {},
          resultSummary: {},
          resultChecksum: digest("7")
        });
      }
      const result = natalResult(input.inputSnapshot);

      const failure = await workerStore
        .complete({
          jobId: created.jobId,
          workerId: `chart-worker-${kind}`,
          leaseGeneration: claimed.lease.leaseGeneration,
          result,
          resultChecksum: sha256CanonicalJson(result as CanonicalJson)
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ChartCalculationReplacementError);
      expect(failure).toMatchObject({ code });

      await expect(requireJobRow(created.jobId)).resolves.toMatchObject({
        status: "processing",
        resultCalculationId: null
      });
      await expect(
        runtime.database.query.calculationRecords.findFirst({
          where: eq(calculationRecords.id, targetCalculationId)
        })
      ).resolves.toMatchObject({
        requestFingerprint: digest("5"),
        resultData: { schemaVersion: "chart-result.v1" },
        resultChecksum: kind === "source_changed" ? digest("6") : sourceChecksum
      });
    }
  );

  it("rolls back replacement side effects when its lease expires behind the target lock", async () => {
    const context = await createClientContext();
    const targetCalculationId = randomUUID();
    const sourceResult = legacyNatalResult(primarySnapshot());
    const sourceChecksum = sha256CanonicalJson(sourceResult as CanonicalJson);
    await runtime.database.insert(calculationRecords).values({
      id: targetCalculationId,
      ownerUserId: context.ownerUserId,
      module: "chart",
      mode: "individual",
      methodCode: "natal",
      title: "Lease-protected natal",
      status: "calculated",
      requestFingerprint: digest("8"),
      inputData: { inputSnapshot: primarySnapshot(), settings: settings() },
      resultData: sourceResult,
      resultSummary: { legacy: true },
      resultChecksum: sourceChecksum
    });
    await runtime.database.insert(calculationParticipants).values({
      calculationId: targetCalculationId,
      role: "subject",
      source: "crm_client",
      clientId: context.subjectClientId,
      displayName: "Lease-protected subject",
      order: 0
    });
    const input = replacementNatalInput(context, targetCalculationId, sourceChecksum);
    const created = await createDrizzleChartCalculationJobStore(
      runtime.database
    ).createOrReuseNatalJob(input);
    if (created.kind !== "active_job") throw new Error("Expected active replacement job");
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-replacement", 2_000);
    const result = natalResult(input.inputSnapshot);
    const blocker = await runtime.pool.connect();
    let transactionOpen = false;
    try {
      await blocker.query("begin");
      transactionOpen = true;
      const blockerPid = await readBackendPid(blocker);
      await blocker.query("select id from calculation_records where id = $1 for update", [
        targetCalculationId
      ]);
      const pending = workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-replacement",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      });
      await waitForBlockedQuery(blockerPid, "calculation_records");
      await new Promise((resolve) => setTimeout(resolve, 2_200));
      await blocker.query("commit");
      transactionOpen = false;

      await expect(pending).resolves.toBe(false);
    } finally {
      if (transactionOpen) await blocker.query("rollback");
      blocker.release();
    }
    await expect(requireJobRow(created.jobId)).resolves.toMatchObject({
      status: "processing",
      resultCalculationId: null
    });
    await expect(
      runtime.database.query.calculationRecords.findFirst({
        where: eq(calculationRecords.id, targetCalculationId)
      })
    ).resolves.toMatchObject({
      requestFingerprint: digest("8"),
      resultData: { schemaVersion: "chart-result.v1" },
      resultChecksum: sourceChecksum
    });
  });

  it("rejects a cross-owner direct creation without a job or outbox write", async () => {
    const first = await createClientContext();
    const second = await createClientContext();
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const foreign = natalInput({ ...first, subjectClientId: second.subjectClientId });

    await expect(jobStore.createOrReuseNatalJob(foreign)).rejects.toMatchObject({
      code: "CHART_PARTICIPANT_RELATIONSHIP_INACTIVE"
    });
    await expect(ownerJobs(first.ownerUserId)).resolves.toEqual([]);
    const ownerOutbox = await runtime.pool.query(
      `select e.id
       from outbox_events e
       inner join chart_calculation_jobs j on j.id = e.aggregate_id
       where j.owner_user_id = $1 and e.event_type = $2`,
      [first.ownerUserId, CHART_CALCULATION_REQUESTED_EVENT]
    );
    expect(ownerOutbox.rows).toEqual([]);
  });

  it("rejects a raw succeeded-job relink to another owner's calculation", async () => {
    const first = await createClientContext();
    const second = await createClientContext();
    const input = natalInput(first);
    const created = await createActiveNatalJob(first, input);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
    const result = natalResult(input.inputSnapshot);
    await workerStore.complete({
      jobId: created.jobId,
      workerId: "chart-worker-a",
      leaseGeneration: claimed.lease.leaseGeneration,
      result,
      resultChecksum: sha256CanonicalJson(result as CanonicalJson)
    });
    const original = await requireJobRow(created.jobId);
    const [foreignCalculation] = await runtime.database
      .insert(calculationRecords)
      .values({
        ownerUserId: second.ownerUserId,
        module: "chart",
        mode: "individual",
        methodCode: "natal",
        title: "Foreign natal chart",
        status: "calculated",
        requestFingerprint: digest("c"),
        inputData: {},
        resultData: {},
        resultSummary: {},
        resultChecksum: digest("d")
      })
      .returning();
    if (!foreignCalculation) throw new Error("Expected foreign calculation");

    await expect(
      runtime.pool.query(
        "update chart_calculation_jobs set result_calculation_id = $1 where id = $2",
        [foreignCalculation.id, created.jobId]
      )
    ).rejects.toThrow();
    await expect(requireJobRow(created.jobId)).resolves.toMatchObject({
      ownerUserId: first.ownerUserId,
      resultCalculationId: original.resultCalculationId
    });
  });

  it("fails completion after relationship revocation without result writes", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const created = await createActiveNatalJob(context, input);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
    await runtime.pool.query(
      `update client_astrologer_relationships
       set status = 'archived', archived_at = clock_timestamp(), updated_at = clock_timestamp()
       where client_user_id = $1 and astrologer_user_id = $2`,
      [context.subjectClientId, context.ownerUserId]
    );
    const result = natalResult(input.inputSnapshot);

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      })
    ).rejects.toMatchObject({
      name: "ChartCalculationCompletionError",
      code: "CHART_PARTICIPANT_PROFILE_INVALID"
    } satisfies Partial<ChartCalculationCompletionError>);
    await expect(ownerCalculations(context.ownerUserId)).resolves.toEqual([]);
  });

  it("rejects a missing participant display name without identifier fallback", async () => {
    const context = await createClientContext({ subjectDisplayName: null });
    const input = natalInput(context);
    const created = await createActiveNatalJob(context, input);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
    const result = natalResult(input.inputSnapshot);

    await expect(
      workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      })
    ).rejects.toMatchObject({
      name: "ChartCalculationCompletionError",
      code: "CHART_PARTICIPANT_PROFILE_INVALID"
    } satisfies Partial<ChartCalculationCompletionError>);
    await expect(ownerCalculations(context.ownerUserId)).resolves.toEqual([]);
  });

  it("creates a fresh job and calculation after the old result is archived", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const first = await createActiveNatalJob(context, input);
    const firstClaim = await claim(workerStore, first.jobId, "chart-worker-a");
    const result = natalResult(input.inputSnapshot);
    const checksum = sha256CanonicalJson(result as CanonicalJson);
    await workerStore.complete({
      jobId: first.jobId,
      workerId: "chart-worker-a",
      leaseGeneration: firstClaim.lease.leaseGeneration,
      result,
      resultChecksum: checksum
    });
    const firstRow = await requireJobRow(first.jobId);
    const firstCalculationId = firstRow.resultCalculationId ?? raise("Expected first result");
    await runtime.pool.query(
      "update calculation_records set status = 'archived', updated_at = clock_timestamp() where id = $1",
      [firstCalculationId]
    );

    const second = await jobStore.createOrReuseNatalJob(input);
    expect(second).toMatchObject({ kind: "active_job" });
    if (second.kind !== "active_job") throw new Error("Expected fresh active job");
    expect(second.jobId).not.toBe(first.jobId);
    const secondClaim = await claim(workerStore, second.jobId, "chart-worker-b");
    await workerStore.complete({
      jobId: second.jobId,
      workerId: "chart-worker-b",
      leaseGeneration: secondClaim.lease.leaseGeneration,
      result,
      resultChecksum: checksum
    });
    const secondRow = await requireJobRow(second.jobId);
    expect(secondRow.resultCalculationId).not.toBe(firstCalculationId);
  });

  it("keeps v1 success readable but non-reusable and non-processable", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const legacyResult = legacyNatalResult(input.inputSnapshot);
    const calculationId = randomUUID();
    const jobId = randomUUID();
    await runtime.pool.query(
      `insert into calculation_records (
         id, owner_user_id, module, mode, method_code, title, status, request_fingerprint,
         input_data, result_data, result_summary, result_checksum, created_at, updated_at
       ) values ($1, $2, 'chart', 'individual', 'natal', 'Legacy natal', 'calculated', $3,
         '{}'::jsonb, $4::jsonb, '{}'::jsonb, $5, clock_timestamp(), clock_timestamp())`,
      [
        calculationId,
        context.ownerUserId,
        input.inputFingerprint,
        JSON.stringify(legacyResult),
        sha256CanonicalJson(legacyResult as CanonicalJson)
      ]
    );
    await runtime.pool.query(
      `insert into chart_calculation_jobs (
         id, owner_user_id, client_id, result_calculation_id, method, status,
         input_fingerprint, input_snapshot, settings_snapshot, participant_snapshot,
         provider, schema_version, attempts, max_attempts, lease_generation,
         started_at, finished_at, created_at, updated_at
       ) values ($1, $2, $3, $4, 'natal', 'succeeded', $5, $6::jsonb, $7::jsonb, $8::jsonb,
         'kerykeion', 'chart-result.v1', 1, 3, 0,
         clock_timestamp(), clock_timestamp(), clock_timestamp(), clock_timestamp())`,
      [
        jobId,
        context.ownerUserId,
        context.subjectClientId,
        calculationId,
        input.inputFingerprint,
        JSON.stringify(input.inputSnapshot),
        JSON.stringify(input.settingsSnapshot),
        JSON.stringify(input.participants)
      ]
    );
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);

    await expect(
      jobStore.getOwnerScopedJob({ ownerUserId: context.ownerUserId, jobId })
    ).resolves.toMatchObject({ id: jobId, status: "succeeded" });
    await expect(
      jobStore.getOwnerScopedResult({ ownerUserId: context.ownerUserId, calculationId })
    ).resolves.toMatchObject({ schemaVersion: "chart-result.v1" });
    await expect(workerStore.getDeliveryState(jobId)).resolves.toEqual({
      kind: "succeeded",
      attempts: 1,
      maxAttempts: 3
    });
    await expect(jobStore.createOrReuseNatalJob(input)).resolves.toMatchObject({
      kind: "active_job"
    });
  });

  it("serializes completion and duplicate creation without a redundant queued job", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const created = await createActiveNatalJob(context, input);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-a");
    const result = natalResult(input.inputSnapshot);

    const [completed, duplicate] = await Promise.all([
      workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-a",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      }),
      jobStore.createOrReuseNatalJob(input)
    ]);
    expect(completed).toBe(true);
    expect(
      duplicate.kind === "existing_result" ||
        (duplicate.kind === "active_job" && duplicate.jobId === created.jobId)
    ).toBe(true);
    await expect(ownerJobs(context.ownerUserId)).resolves.toHaveLength(1);
  });

  it("serializes chart completion with the generic calculation writer and never leaks 23505", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const calculationStore = createDrizzleCalculationStore(runtime.database);
    const created = await createActiveNatalJob(context, input);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-cross-writer");
    const result = natalResult(input.inputSnapshot);
    const checksum = sha256CanonicalJson(result as CanonicalJson);

    const [completion, genericCreate] = await Promise.allSettled([
      workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-cross-writer",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: checksum
      }),
      createCalculation({
        store: calculationStore,
        ownerUserId: context.ownerUserId,
        module: "chart",
        mode: "individual",
        methodCode: "natal",
        title: "Concurrent generic chart",
        participants: [
          {
            role: "subject",
            source: "crm_client",
            clientId: context.subjectClientId,
            displayName: "Concurrent subject"
          }
        ],
        linkClientIds: [],
        requestFingerprint: calculationRequestFingerprint(input),
        inputData: { inputSnapshot: input.inputSnapshot, settings: input.settingsSnapshot },
        resultData: result,
        resultSummary: { method: "natal" },
        resultChecksum: checksum,
        idGenerator: randomUUID,
        now: new Date("2026-08-03T14:30:00.000Z")
      })
    ]);

    expect(genericCreate.status).toBe("fulfilled");
    if (completion.status === "rejected") {
      expect(completion.reason).toBeInstanceOf(ChartCalculationReplacementError);
      expect(completion.reason).toMatchObject({ code: "CHART_REPLACEMENT_EXACT_KEY_CONFLICT" });
    } else {
      expect(completion.value).toBe(true);
    }
    const exactRows = await runtime.pool.query<{ id: string }>(
      `select id from calculation_records
       where owner_user_id = $1 and module = 'chart' and mode = 'individual'
         and method_code = 'natal' and request_fingerprint = $2 and status <> 'archived'`,
      [context.ownerUserId, calculationRequestFingerprint(input)]
    );
    expect(exactRows.rows).toHaveLength(1);
  });

  it("reuses intact succeeded results after authentic linked and published transitions", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const jobStore = createDrizzleChartCalculationJobStore(runtime.database);
    const workerStore = createDrizzleChartWorkerJobStore(runtime.database);
    const calculationStore = createDrizzleCalculationStore(runtime.database);
    const created = await createActiveNatalJob(context, input);
    const claimed = await claim(workerStore, created.jobId, "chart-worker-reuse-status");
    const result = natalResult(input.inputSnapshot);
    await expect(
      workerStore.complete({
        jobId: created.jobId,
        workerId: "chart-worker-reuse-status",
        leaseGeneration: claimed.lease.leaseGeneration,
        result,
        resultChecksum: sha256CanonicalJson(result as CanonicalJson)
      })
    ).resolves.toBe(true);
    const succeeded = await jobStore.getOwnerScopedJob({
      ownerUserId: context.ownerUserId,
      jobId: created.jobId
    });
    const calculationId = succeeded?.resultCalculationId ?? raise("Expected calculation id");

    const linked = await linkCalculationToClient({
      store: calculationStore,
      ownerUserId: context.ownerUserId,
      calculationId,
      clientId: context.subjectClientId,
      expectedChartExecutionProfile: executionProfile,
      now: new Date("2026-08-03T14:40:00.000Z")
    });
    expect(linked.status).toBe("linked");
    await expect(jobStore.createOrReuseNatalJob(input)).resolves.toMatchObject({
      kind: "existing_result",
      calculationId,
      result: { schemaVersion: "chart-result.v2", method: "natal" }
    });

    const draft = await saveCalculationInterpretation({
      store: calculationStore,
      ownerUserId: context.ownerUserId,
      calculationId,
      expectedResultChecksum: linked.resultChecksum,
      source: "manual",
      text: "Approved current chart interpretation",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: randomUUID,
      now: new Date("2026-08-03T14:41:00.000Z")
    });
    const interpretationId = draft.interpretations[0]?.id ?? raise("Expected interpretation id");
    await approveCalculationInterpretation({
      store: calculationStore,
      ownerUserId: context.ownerUserId,
      calculationId,
      interpretationId,
      now: new Date("2026-08-03T14:42:00.000Z")
    });
    const published = await publishCalculationToClient({
      store: calculationStore,
      ownerUserId: context.ownerUserId,
      calculationId,
      clientId: context.subjectClientId,
      expectedResultChecksum: linked.resultChecksum,
      expectedChartExecutionProfile: executionProfile,
      now: new Date("2026-08-03T14:43:00.000Z")
    });
    expect(published.status).toBe("published");
    await expect(jobStore.createOrReuseNatalJob(input)).resolves.toMatchObject({
      kind: "existing_result",
      calculationId,
      result: { schemaVersion: "chart-result.v2", method: "natal" }
    });
  });

  it("lets PostgreSQL reject invalid participant, profile, provenance and lifecycle state", async () => {
    const context = await createClientContext();
    const input = natalInput(context);
    const insertQueued = (overrides: {
      readonly method?: "natal" | "synastry";
      readonly methodVersion?: string | null;
      readonly participant?: unknown;
      readonly profile?: unknown;
      readonly sourceChecksum?: string | null;
      readonly generation?: number;
      readonly lastErrorCode?: string | null;
      readonly lastErrorMessage?: string | null;
    }) =>
      runtime.pool.query(
        `insert into chart_calculation_jobs (
           owner_user_id, client_id, method, method_version, status, input_fingerprint,
           input_snapshot, settings_snapshot, participant_snapshot, provider, schema_version,
           execution_profile, target_calculation_id, expected_source_checksum, lease_generation,
           last_error_code, last_error_message
         ) values ($1, $2, $3, $4, 'queued', $5, $6::jsonb, $7::jsonb, $8::jsonb,
           'kerykeion', 'chart-result.v2', $9::jsonb, null, $10, $11, $12, $13)`,
        [
          context.ownerUserId,
          context.subjectClientId,
          overrides.method ?? "natal",
          overrides.methodVersion === undefined
            ? chartMethodVersions[overrides.method ?? "natal"]
            : overrides.methodVersion,
          input.inputFingerprint,
          JSON.stringify(input.inputSnapshot),
          JSON.stringify(input.settingsSnapshot),
          JSON.stringify(overrides.participant ?? input.participants),
          JSON.stringify(overrides.profile ?? input.executionProfile),
          overrides.sourceChecksum ?? null,
          overrides.generation ?? 0,
          overrides.lastErrorCode ?? null,
          overrides.lastErrorMessage ?? null
        ]
      );

    await expect(
      insertQueued({ participant: [{ role: "partner", clientId: context.subjectClientId }] })
    ).rejects.toThrow();
    await expect(insertQueued({ profile: { ...executionProfile, extra: true } })).rejects.toThrow();
    await expect(insertQueued({ sourceChecksum: "not-a-checksum" })).rejects.toThrow();
    await expect(insertQueued({ generation: -1 })).rejects.toThrow();
    await expect(
      insertQueued({ lastErrorCode: "retryable_error", lastErrorMessage: null })
    ).rejects.toThrow();
    await expect(insertQueued({ methodVersion: null })).rejects.toThrow();
    await expect(
      insertQueued({
        method: "synastry",
        participant: [
          { role: "subject", clientId: context.subjectClientId },
          { role: "partner", clientId: null }
        ]
      })
    ).rejects.toThrow();
    await expect(
      insertQueued({ profile: { ...executionProfile, provider: null } })
    ).rejects.toThrow();
    const insertProcessing = (
      lockedBy: string | null,
      lastErrorCode: string | null = null,
      lastErrorMessage: string | null = null
    ) =>
      runtime.pool.query(
        `insert into chart_calculation_jobs (
           owner_user_id, client_id, method, method_version, status, input_fingerprint,
           input_snapshot, settings_snapshot, participant_snapshot, provider, schema_version,
           execution_profile, attempts, max_attempts, locked_by, locked_until,
           lease_generation, started_at, last_error_code, last_error_message
         ) values ($1, $2, 'natal', $3, 'processing', $4, $5::jsonb, $6::jsonb,
           $7::jsonb, 'kerykeion', 'chart-result.v2', $8::jsonb, 1, 3, $9,
           clock_timestamp() + interval '1 minute', 1, clock_timestamp(), $10, $11)`,
        [
          context.ownerUserId,
          context.subjectClientId,
          chartMethodVersions.natal,
          input.inputFingerprint,
          JSON.stringify(input.inputSnapshot),
          JSON.stringify(input.settingsSnapshot),
          JSON.stringify(input.participants),
          JSON.stringify(input.executionProfile),
          lockedBy,
          lastErrorCode,
          lastErrorMessage
        ]
      );
    await expect(insertProcessing(null)).rejects.toThrow();
    await expect(
      insertProcessing("chart-worker-a", "stale_error", "must be cleared while processing")
    ).rejects.toThrow();
    await expect(
      runtime.pool.query(
        `insert into chart_calculation_jobs (
           owner_user_id, client_id, method, method_version, status, input_fingerprint,
           input_snapshot, settings_snapshot, participant_snapshot, provider, schema_version,
           execution_profile, attempts, max_attempts, lease_generation, started_at, finished_at,
           last_error_code, last_error_message
         ) values ($1, $2, 'natal', $3, 'failed', $4, $5::jsonb, $6::jsonb,
           $7::jsonb, 'kerykeion', 'chart-result.v2', $8::jsonb, 1, 3, 1,
           clock_timestamp(), clock_timestamp(), null, null)`,
        [
          context.ownerUserId,
          context.subjectClientId,
          chartMethodVersions.natal,
          input.inputFingerprint,
          JSON.stringify(input.inputSnapshot),
          JSON.stringify(input.settingsSnapshot),
          JSON.stringify(input.participants),
          JSON.stringify(input.executionProfile)
        ]
      )
    ).rejects.toThrow();
  });

  async function createClientContext(
    options: { readonly subjectDisplayName?: string | null } = {}
  ): Promise<ClientContext> {
    const ownerUserId = await createUser();
    const subjectClientId = await createUser();
    const partnerClientId = await createUser();
    const subjectDisplayName =
      options.subjectDisplayName === undefined ? "Chart Subject" : options.subjectDisplayName;
    await runtime.pool.query(
      `insert into client_profiles (user_id, display_name_snapshot, created_at, updated_at)
       values ($1, $2, clock_timestamp(), clock_timestamp()),
              ($3, 'Chart Partner', clock_timestamp(), clock_timestamp())`,
      [subjectClientId, subjectDisplayName, partnerClientId]
    );
    await runtime.pool.query(
      `insert into client_astrologer_relationships (
         client_user_id, astrologer_user_id, source, status, first_linked_at, last_linked_at,
         created_at, updated_at
       ) values
         ($1, $3, 'manual', 'active', clock_timestamp(), clock_timestamp(), clock_timestamp(), clock_timestamp()),
         ($2, $3, 'manual', 'active', clock_timestamp(), clock_timestamp(), clock_timestamp(), clock_timestamp())`,
      [subjectClientId, partnerClientId, ownerUserId]
    );
    return { ownerUserId, subjectClientId, partnerClientId };
  }

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user insert");
  }

  async function createActiveNatalJob(
    context: ClientContext,
    input: CreateOrReuseNatalJobInput = natalInput(context)
  ) {
    const created = await createDrizzleChartCalculationJobStore(
      runtime.database
    ).createOrReuseNatalJob(input);
    if (created.kind !== "active_job") throw new Error("Expected active job");
    return created;
  }

  async function createActiveNatalJobAndRequest(
    context: ClientContext,
    input: CreateOrReuseNatalJobInput = natalInput(context)
  ) {
    const created = await createDrizzleChartCalculationCommandStore(
      runtime.database
    ).createOrReuseNatalJobAndRequestCalculation({
      ...input,
      now: new Date().toISOString()
    });
    if (created.kind !== "active_job") throw new Error("Expected active job");
    return created;
  }

  async function markChartOutboxPublished(jobId: string): Promise<void> {
    const now = await databaseClock();
    await runtime.database
      .update(outboxEvents)
      .set({
        status: "published",
        attempts: 4,
        availableAt: now,
        lockedAt: null,
        publishedAt: now,
        lastError: "previous delivery failure",
        updatedAt: now
      })
      .where(eq(outboxEvents.aggregateId, jobId));
  }

  async function requireChartOutboxRow(jobId: string) {
    return (
      (await runtime.database.query.outboxEvents.findFirst({
        where: eq(outboxEvents.aggregateId, jobId)
      })) ?? raise("Expected chart outbox event")
    );
  }

  async function requireJobRow(jobId: string) {
    return (
      (await runtime.database.query.chartCalculationJobs.findFirst({
        where: eq(chartCalculationJobs.id, jobId)
      })) ?? raise("Expected chart job")
    );
  }

  async function databaseClock(): Promise<Date> {
    const result = await runtime.pool.query<{ db_now: Date }>("select clock_timestamp() as db_now");
    return result.rows[0]?.db_now ?? raise("Expected database clock");
  }

  async function expireLease(jobId: string): Promise<void> {
    await runtime.pool.query(
      "update chart_calculation_jobs set locked_until = clock_timestamp() - interval '1 second' where id = $1",
      [jobId]
    );
  }

  async function expireLeaseAt(jobId: string, lockedUntil: string): Promise<void> {
    await runtime.pool.query("update chart_calculation_jobs set locked_until = $2 where id = $1", [
      jobId,
      lockedUntil
    ]);
  }

  async function runBehindChartJobRowLock<T>(
    jobId: string,
    operation: () => Promise<T>,
    holdAfterBlockedMs: number
  ): Promise<{ readonly result: T; readonly precommitDbNow: Date }> {
    const blocker = await runtime.pool.connect();
    let transactionOpen = false;
    try {
      await blocker.query("begin");
      transactionOpen = true;
      const blockerPid = await readBackendPid(blocker);
      await blocker.query("select id from chart_calculation_jobs where id = $1 for update", [
        jobId
      ]);
      const pending = operation();
      await waitForBlockedQuery(blockerPid, "chart_calculation_jobs");
      await new Promise((resolve) => setTimeout(resolve, holdAfterBlockedMs));
      const precommitDbNow = await readDatabaseClockFromClient(blocker);
      await blocker.query("commit");
      transactionOpen = false;
      return { result: await pending, precommitDbNow };
    } finally {
      if (transactionOpen) await blocker.query("rollback");
      blocker.release();
    }
  }

  async function runTimedOperationBehindChartJobRowLock<T>(
    jobId: string,
    operation: () => Promise<T>
  ): Promise<{
    readonly beforeUnlock:
      | { readonly kind: "resolved"; readonly value: T }
      | { readonly kind: "rejected"; readonly error: unknown }
      | { readonly kind: "watchdog_timeout" };
    readonly settled:
      | { readonly kind: "resolved"; readonly value: T }
      | { readonly kind: "rejected"; readonly error: unknown };
  }> {
    const blocker = await runtime.pool.connect();
    let transactionOpen = false;
    try {
      await blocker.query("begin");
      transactionOpen = true;
      const blockerPid = await readBackendPid(blocker);
      await blocker.query("select id from chart_calculation_jobs where id = $1 for update", [
        jobId
      ]);
      const settled = operation().then(
        (value) => ({ kind: "resolved" as const, value }),
        (error: unknown) => ({ kind: "rejected" as const, error })
      );
      await waitForBlockedQuery(blockerPid, "chart_calculation_jobs");
      const beforeUnlock = await Promise.race([
        settled,
        new Promise<{ readonly kind: "watchdog_timeout" }>((resolve) => {
          const timer = setTimeout(() => resolve({ kind: "watchdog_timeout" }), 3_000);
          timer.unref();
        })
      ]);
      await blocker.query("rollback");
      transactionOpen = false;
      return { beforeUnlock, settled: await settled };
    } finally {
      if (transactionOpen) await blocker.query("rollback");
      blocker.release();
    }
  }

  async function waitForBlockedQuery(blockerPid: number, relationName: string): Promise<void> {
    if (!/^[a-z_]+$/.test(relationName)) throw new Error("Invalid relation name");
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const result = await runtime.pool.query(
        `select 1
         from pg_stat_activity
         where datname = current_database()
           and pid <> $1
           and state = 'active'
           and wait_event_type = 'Lock'
           and query like $2
         limit 1`,
        [blockerPid, `%${relationName}%`]
      );
      if (result.rowCount === 1) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected chart-job operation to wait on the row lock");
  }

  async function readBackendPid(client: {
    query: <T extends Record<string, unknown>>(text: string) => Promise<{ rows: T[] }>;
  }): Promise<number> {
    const result = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
    return result.rows[0]?.pid ?? raise("Expected PostgreSQL backend PID");
  }

  async function readDatabaseClockFromClient(client: {
    query: <T extends Record<string, unknown>>(text: string) => Promise<{ rows: T[] }>;
  }): Promise<Date> {
    const result = await client.query<{ db_now: Date }>("select clock_timestamp() as db_now");
    return result.rows[0]?.db_now ?? raise("Expected database clock");
  }

  function ownerCalculations(ownerUserId: string) {
    return runtime.database
      .select()
      .from(calculationRecords)
      .where(eq(calculationRecords.ownerUserId, ownerUserId));
  }

  function ownerJobs(ownerUserId: string) {
    return runtime.database
      .select()
      .from(chartCalculationJobs)
      .where(eq(chartCalculationJobs.ownerUserId, ownerUserId));
  }
});

function natalInput(
  context: ClientContext,
  options: {
    readonly maxAttempts?: number;
    readonly interpretationMode?: "adult_natal" | "child";
    readonly inputSnapshot?: ReturnType<typeof primarySnapshot>;
    readonly settingsSnapshot?: ChartSettings;
  } = {}
): CreateOrReuseNatalJobInput {
  const inputSnapshot = options.inputSnapshot ?? primarySnapshot();
  const settingsSnapshot = options.settingsSnapshot ?? settings();
  const participants = [{ role: "subject" as const, clientId: context.subjectClientId }];
  const methodVersion = chartMethodVersions.natal;
  const interpretationMode = options.interpretationMode ?? "adult_natal";
  return {
    ownerUserId: context.ownerUserId,
    clientId: context.subjectClientId,
    methodVersion,
    interpretationMode,
    executionProfile,
    participants,
    maxAttempts: options.maxAttempts ?? 3,
    targetCalculationId: null,
    expectedSourceChecksum: null,
    inputSnapshot,
    settingsSnapshot,
    inputFingerprint: buildChartJobRequestFingerprint({
      ownerUserId: context.ownerUserId,
      method: "natal",
      methodVersion,
      executionProfile,
      interpretationMode,
      settings: settingsSnapshot,
      inputSnapshot,
      participants,
      targetCalculationId: null,
      expectedSourceChecksum: null
    })
  };
}

function compositeInput(context: ClientContext): CreateOrReuseChartJobInput {
  const inputSnapshot = {
    inputSnapshot: primarySnapshot(),
    partnerInputSnapshot: partnerSnapshot()
  };
  const settingsSnapshot = settings();
  const participants = [
    { role: "subject" as const, clientId: context.subjectClientId },
    { role: "partner" as const, clientId: context.partnerClientId }
  ];
  const methodVersion = chartMethodVersions.composite;
  return {
    method: "composite",
    methodVersion,
    executionProfile,
    interpretationMode: "legacy_unclassified",
    ownerUserId: context.ownerUserId,
    clientId: context.subjectClientId,
    participants,
    maxAttempts: 3,
    targetCalculationId: null,
    expectedSourceChecksum: null,
    inputSnapshot,
    settingsSnapshot,
    inputFingerprint: buildChartJobRequestFingerprint({
      ownerUserId: context.ownerUserId,
      method: "composite",
      methodVersion,
      executionProfile,
      interpretationMode: "legacy_unclassified",
      settings: settingsSnapshot,
      inputSnapshot,
      participants
    })
  };
}

function replacementNatalInput(
  context: ClientContext,
  targetCalculationId: string,
  expectedSourceChecksum: string,
  options: {
    readonly inputSnapshot?: ReturnType<typeof primarySnapshot>;
    readonly settingsSnapshot?: ChartSettings;
  } = {}
): CreateOrReuseNatalJobInput {
  const initial = natalInput(context, options);
  return {
    ...initial,
    targetCalculationId,
    expectedSourceChecksum,
    inputFingerprint: buildChartJobRequestFingerprint({
      ownerUserId: initial.ownerUserId,
      method: "natal",
      methodVersion: initial.methodVersion,
      executionProfile: initial.executionProfile,
      interpretationMode: initial.interpretationMode,
      settings: initial.settingsSnapshot as CanonicalJson,
      inputSnapshot: initial.inputSnapshot as CanonicalJson,
      participants: initial.participants,
      targetCalculationId,
      expectedSourceChecksum
    })
  };
}

function replacementCompositeInput(
  context: ClientContext,
  targetCalculationId: string,
  expectedSourceChecksum: string
): CreateOrReuseChartJobInput {
  const initial = compositeInput(context);
  return {
    ...initial,
    targetCalculationId,
    expectedSourceChecksum,
    inputFingerprint: buildChartJobRequestFingerprint({
      ownerUserId: initial.ownerUserId,
      method: initial.method,
      methodVersion: initial.methodVersion,
      executionProfile: initial.executionProfile,
      interpretationMode: initial.interpretationMode,
      settings: initial.settingsSnapshot as CanonicalJson,
      inputSnapshot: initial.inputSnapshot as CanonicalJson,
      participants: initial.participants,
      targetCalculationId,
      expectedSourceChecksum
    })
  };
}

function calculationRequestFingerprint(
  input: CreateOrReuseChartJobInput | CreateOrReuseNatalJobInput
): `sha256:${string}` {
  return buildChartCalculationRequestFingerprint({
    ownerUserId: input.ownerUserId,
    method: "method" in input ? input.method : "natal",
    methodVersion: input.methodVersion,
    executionProfile: input.executionProfile,
    interpretationMode: input.interpretationMode,
    settings: input.settingsSnapshot as CanonicalJson,
    inputSnapshot: input.inputSnapshot as CanonicalJson,
    participants: input.participants
  });
}

async function claim(
  store: ReturnType<typeof createDrizzleChartWorkerJobStore>,
  jobId: string,
  workerId: string,
  leaseMs = 60_000
): Promise<ChartJobForProcessing> {
  const outcome = await store.claimForProcessing({ jobId, workerId, leaseMs });
  if (outcome.kind !== "claimed") throw new Error(`Expected claim, received ${outcome.kind}`);
  return outcome.job;
}

function natalResult(
  inputSnapshot: unknown,
  settingsSnapshot: ChartSettings = settings()
): ReproducibleChartResult {
  const result = chartResultSchema.parse({
    schemaVersion: "chart-result.v2",
    method: "natal",
    methodVersion: chartMethodVersions.natal,
    provider: providerMetadata(),
    reproducibilityFingerprint: digest("0"),
    settings: settingsSnapshot,
    inputSnapshot,
    result: renderResult()
  });
  if (result.schemaVersion !== "chart-result.v2") throw new Error("Expected v2 result");
  return {
    ...result,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(result)
  } as ReproducibleChartResult;
}

function compositeResult(input: CreateOrReuseChartJobInput): ReproducibleChartResult {
  const snapshots = input.inputSnapshot as {
    inputSnapshot: unknown;
    partnerInputSnapshot: unknown;
  };
  const result = chartResultSchema.parse({
    schemaVersion: "chart-result.v2",
    method: "composite",
    methodVersion: chartMethodVersions.composite,
    provider: providerMetadata(),
    reproducibilityFingerprint: digest("0"),
    settings: settings(),
    inputSnapshot: snapshots.inputSnapshot,
    partnerInputSnapshot: snapshots.partnerInputSnapshot,
    result: renderResult()
  });
  if (result.schemaVersion !== "chart-result.v2") throw new Error("Expected v2 result");
  return {
    ...result,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(result)
  } as ReproducibleChartResult;
}

function legacyCompositeSource(context: ClientContext) {
  const inputSnapshot = primarySnapshot();
  const partnerInputSnapshot = partnerSnapshot();
  const relationshipSnapshot = {
    primaryClientId: context.subjectClientId,
    partnerClientId: context.partnerClientId
  };
  return {
    inputData: {
      inputSnapshot: { inputSnapshot, partnerInputSnapshot, relationshipSnapshot },
      settings: settings()
    },
    resultData: chartResultSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "composite",
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: settings(),
      inputSnapshot,
      partnerInputSnapshot,
      relationshipSnapshot,
      result: renderResult()
    })
  };
}

function legacyNatalResult(inputSnapshot: unknown) {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: settings(),
    inputSnapshot,
    result: renderResult()
  };
}

function providerMetadata() {
  return {
    name: "kerykeion",
    version: "5.12.9",
    ephemeris: "moshier",
    pyswissephVersion: "2.10.3.2",
    ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
    ephemerisDataRevision: null
  };
}

function settings() {
  return {
    zodiac: "tropical" as const,
    houseSystem: "placidus" as const,
    nodeType: "true" as const,
    aspectPreset: "major" as const,
    orbMultiplier: 1
  };
}

function primarySnapshot() {
  return {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    birthTimePrecision: "exact" as const
  };
}

function partnerSnapshot() {
  return {
    birthDate: "1992-08-11",
    birthTime: "22:15",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173,
    birthTimePrecision: "exact" as const
  };
}

function renderResult() {
  return {
    points: completePoints(),
    houses: completeHouses(),
    aspects: [],
    distributions: {
      elements: { fire: 3, earth: 3, air: 2, water: 2 },
      modalities: { cardinal: 4, fixed: 3, mutable: 3 },
      polarity: { masculine: 5, feminine: 5 }
    },
    warnings: []
  };
}

function completePoints() {
  return [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "ascendant",
    "midheaven",
    "north_node",
    "south_node"
  ].map((id, index) => ({
    id,
    label: id,
    longitude: index * 20,
    sign: "aries",
    signDegree: index % 29,
    house: index < 12 ? index + 1 : null,
    retrograde: false
  }));
}

function completeHouses() {
  return Array.from({ length: 12 }, (_, index) => ({
    number: index + 1,
    longitude: index * 30,
    sign: "aries",
    signDegree: 0
  }));
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error("Invalid integration database name");
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function downgradeChartJobsToResultChecksumPredecessor(client: Client): Promise<void> {
  await client.query(`
    DROP TRIGGER chart_calculation_jobs_result_checksum_immutable ON chart_calculation_jobs;
    DROP FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation();
    ALTER TABLE chart_calculation_jobs
      DROP CONSTRAINT chart_calculation_jobs_result_checksum_check,
      DROP CONSTRAINT chart_calculation_jobs_lease_state_check,
      DROP COLUMN result_checksum,
      DROP COLUMN interpretation_mode,
      ADD CONSTRAINT chart_calculation_jobs_lease_state_check CHECK (coalesce((
        (
          status = 'queued'
          AND locked_by IS NULL
          AND locked_until IS NULL
          AND finished_at IS NULL
          AND result_calculation_id IS NULL
          AND result_reproducibility_fingerprint IS NULL
          AND (
            (last_error_code IS NULL AND last_error_message IS NULL)
            OR (
              length(trim(last_error_code)) > 0
              AND length(trim(last_error_message)) > 0
            )
          )
        )
        OR (
          status = 'processing'
          AND length(trim(locked_by)) > 0
          AND locked_until IS NOT NULL
          AND lease_generation > 0
          AND started_at IS NOT NULL
          AND finished_at IS NULL
          AND result_calculation_id IS NULL
          AND result_reproducibility_fingerprint IS NULL
          AND last_error_code IS NULL
          AND last_error_message IS NULL
        )
        OR (
          status = 'succeeded'
          AND locked_by IS NULL
          AND locked_until IS NULL
          AND started_at IS NOT NULL
          AND finished_at IS NOT NULL
          AND result_calculation_id IS NOT NULL
          AND (
            schema_version = 'chart-result.v1'
            OR result_reproducibility_fingerprint IS NOT NULL
          )
          AND last_error_code IS NULL
          AND last_error_message IS NULL
        )
        OR (
          status = 'failed'
          AND locked_by IS NULL
          AND locked_until IS NULL
          AND started_at IS NOT NULL
          AND finished_at IS NOT NULL
          AND result_calculation_id IS NULL
          AND result_reproducibility_fingerprint IS NULL
          AND length(trim(last_error_code)) > 0
          AND length(trim(last_error_message)) > 0
        )
      ), false));
  `);
}

async function augmentIsolatedSchemaForCurrentSources(client: Client): Promise<void> {
  await client.query(`
    alter table calculation_records
      add column if not exists interpretation_mode text;
    alter table chart_calculation_jobs
      add column if not exists interpretation_mode text;
    alter table calculation_client_links
      add column if not exists published_interpretation_id uuid,
      add column if not exists published_result_checksum text;
  `);
}

function raise(message: string): never {
  throw new Error(message);
}

function readPostgresErrorCode(error: unknown): string | null {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (current === null || typeof current !== "object") return null;
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }
  return null;
}
