import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  storedChartCalculationPayloadSchema,
  type StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import {
  CHART_CALCULATION_REQUESTED_EVENT,
  type ChartCalculationCommandStore,
  ChartCalculationJob,
  ChartCalculationJobStore,
  ChartJobForProcessing,
  ChartJobProcessingStore,
  CreateOrReuseChartJobInput,
  CreateOrReuseChartJobResult,
  CreateOrReuseNatalJobResult
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { calculationRecords, chartCalculationJobs, outboxEvents } from "../../schema";

type ChartCalculationJobRow = typeof chartCalculationJobs.$inferSelect;
type ChartTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
export type ChartDrizzleDatabase = ElevenHouseDatabase | ChartTransaction;

export function createDrizzleChartCalculationJobStore(
  database: ChartDrizzleDatabase
): ChartCalculationJobStore {
  return {
    createOrReuseChartJob: (input) => createOrReuseChartJob(database, input),
    createOrReuseNatalJob: (input) =>
      createOrReuseChartJob(database, { ...input, method: "natal" }),
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
  database: ChartDrizzleDatabase
): ChartJobProcessingStore {
  return {
    findByJobId: (jobId) => findChartJobById(database, jobId),
    claimForProcessing: (input) => claimChartJobForProcessing(database, input),
    complete: (input) =>
      completeChartJob(database, {
        ...input,
        result: storedChartCalculationPayloadSchema.parse(input.result)
      }),
    fail: (input) => failChartJob(database, input)
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
        .onConflictDoNothing({
          target: [outboxEvents.eventType, outboxEvents.aggregateId]
        });
    }
    return result;
  });
}

async function createOrReuseChartJob(
  database: ChartDrizzleDatabase,
  input: CreateOrReuseChartJobInput
): Promise<CreateOrReuseChartJobResult> {
  const existing = await findExistingOrActive(database, input.ownerUserId, input.inputFingerprint);
  if (existing) return existing;

  const [inserted] = await database
    .insert(chartCalculationJobs)
    .values({
      ownerUserId: input.ownerUserId,
      clientId: input.clientId,
      method: input.method,
      status: "queued",
      inputFingerprint: input.inputFingerprint,
      inputSnapshot: input.inputSnapshot,
      settingsSnapshot: input.settingsSnapshot
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return { kind: "active_job", jobId: inserted.id };

  const raced = await findExistingOrActive(database, input.ownerUserId, input.inputFingerprint);
  if (raced) return raced;

  throw new Error("CHART_JOB_CREATE_CONFLICT");
}

async function findExistingOrActive(
  database: ChartDrizzleDatabase,
  ownerUserId: string,
  inputFingerprint: string
): Promise<CreateOrReuseNatalJobResult | null> {
  const [succeeded] = await database
    .select()
    .from(chartCalculationJobs)
    .where(
      and(
        eq(chartCalculationJobs.ownerUserId, ownerUserId),
        eq(chartCalculationJobs.inputFingerprint, inputFingerprint),
        eq(chartCalculationJobs.status, "succeeded"),
        isNotNull(chartCalculationJobs.resultCalculationId)
      )
    )
    .limit(1);

  if (succeeded?.resultCalculationId) {
    return { kind: "existing_result", calculationId: succeeded.resultCalculationId };
  }

  const [active] = await database
    .select()
    .from(chartCalculationJobs)
    .where(
      and(
        eq(chartCalculationJobs.ownerUserId, ownerUserId),
        eq(chartCalculationJobs.inputFingerprint, inputFingerprint),
        inArray(chartCalculationJobs.status, ["queued", "processing"])
      )
    )
    .limit(1);

  return active ? { kind: "active_job", jobId: active.id } : null;
}

async function getOwnerScopedJob(
  database: ChartDrizzleDatabase,
  input: { readonly ownerUserId: string; readonly jobId: string }
): Promise<ChartCalculationJob | null> {
  const [row] = await database
    .select()
    .from(chartCalculationJobs)
    .where(
      and(eq(chartCalculationJobs.ownerUserId, input.ownerUserId), eq(chartCalculationJobs.id, input.jobId))
    )
    .limit(1);

  return row ? toChartCalculationJob(row) : null;
}

async function getOwnerScopedResult(
  database: ChartDrizzleDatabase,
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

function toChartCalculationJob(row: ChartCalculationJobRow): ChartCalculationJob {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    clientId: row.clientId,
    resultCalculationId: row.resultCalculationId,
    method: row.method as ChartCalculationJob["method"],
    status: row.status as ChartCalculationJob["status"],
    inputFingerprint: row.inputFingerprint,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage
  };
}

function toChartJobForProcessing(row: ChartCalculationJobRow): ChartJobForProcessing {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    clientId: row.clientId,
    method: row.method as ChartJobForProcessing["method"],
    status: row.status as ChartJobForProcessing["status"],
    inputSnapshot: row.inputSnapshot,
    settingsSnapshot: row.settingsSnapshot
  };
}

async function findChartJobById(
  database: ChartDrizzleDatabase,
  jobId: string
): Promise<ChartJobForProcessing | null> {
  const [row] = await database
    .select()
    .from(chartCalculationJobs)
    .where(eq(chartCalculationJobs.id, jobId))
    .limit(1);
  return row ? toChartJobForProcessing(row) : null;
}

async function claimChartJobForProcessing(
  database: ChartDrizzleDatabase,
  input: { readonly jobId: string; readonly now: string }
): Promise<ChartJobForProcessing | null> {
  const [row] = await database
    .update(chartCalculationJobs)
    .set({
      status: "processing",
      attempts: sql`${chartCalculationJobs.attempts} + 1`,
      startedAt: new Date(input.now),
      updatedAt: new Date(input.now)
    })
    .where(
      and(
        eq(chartCalculationJobs.id, input.jobId),
        inArray(chartCalculationJobs.status, ["queued", "processing"])
      )
    )
    .returning();
  return row ? toChartJobForProcessing(row) : null;
}

async function completeChartJob(
  database: ChartDrizzleDatabase,
  input: {
    readonly jobId: string;
    readonly result: StoredChartCalculationPayload;
    readonly resultChecksum: string;
    readonly now: string;
  }
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const [job] = await transaction
      .select()
      .from(chartCalculationJobs)
      .where(eq(chartCalculationJobs.id, input.jobId))
      .limit(1);
    if (!job) return false;
    if (job.status === "succeeded" && job.resultCalculationId) return true;

    const [calculation] = await transaction
      .insert(calculationRecords)
      .values({
        id: randomUUID(),
        ownerUserId: job.ownerUserId,
        module: "chart",
        mode: "individual",
        methodCode: job.method,
        title: job.method === "transit" ? "Transit chart" : "Natal chart",
        status: "calculated",
        requestFingerprint: job.inputFingerprint,
        inputData: { inputSnapshot: job.inputSnapshot, settings: job.settingsSnapshot },
        resultData: input.result,
        resultSummary: buildChartResultSummary(input.result),
        resultChecksum: normalizeChecksum(input.resultChecksum),
        createdAt: new Date(input.now),
        updatedAt: new Date(input.now)
      })
      .onConflictDoUpdate({
        target: [
          calculationRecords.ownerUserId,
          calculationRecords.module,
          calculationRecords.mode,
          calculationRecords.methodCode,
          calculationRecords.requestFingerprint
        ],
        set: {
          resultData: input.result,
          resultSummary: buildChartResultSummary(input.result),
          resultChecksum: normalizeChecksum(input.resultChecksum),
          updatedAt: new Date(input.now)
        }
      })
      .returning();
    if (!calculation) return false;

    const [updated] = await transaction
      .update(chartCalculationJobs)
      .set({
        status: "succeeded",
        resultCalculationId: calculation.id,
        finishedAt: new Date(input.now),
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date(input.now)
      })
      .where(eq(chartCalculationJobs.id, input.jobId))
      .returning();

    return Boolean(updated);
  });
}

function buildChartResultSummary(result: StoredChartCalculationPayload) {
  if (result.method === "transit") {
    return {
      provider: result.provider.name,
      natalPointCount: result.result.natal.points.length,
      transitPointCount: result.result.transit.points.length,
      transitAspectCount: result.result.aspectsToNatal.length
    };
  }
  return {
    provider: result.provider.name,
    pointCount: result.result.points.length,
    houseCount: result.result.houses.length,
    aspectCount: result.result.aspects.length
  };
}

async function failChartJob(
  database: ChartDrizzleDatabase,
  input: {
    readonly jobId: string;
    readonly code: string;
    readonly reason: string;
    readonly now: string;
  }
): Promise<boolean> {
  const [updated] = await database
    .update(chartCalculationJobs)
    .set({
      status: "failed",
      lastErrorCode: input.code,
      lastErrorMessage: input.reason,
      finishedAt: new Date(input.now),
      updatedAt: new Date(input.now)
    })
    .where(eq(chartCalculationJobs.id, input.jobId))
    .returning();
  return Boolean(updated);
}

function normalizeChecksum(value: string): string {
  if (/^sha256:[a-f0-9]{64}$/.test(value)) return value;
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
