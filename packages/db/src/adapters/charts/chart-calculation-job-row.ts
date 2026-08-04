import {
  chartExecutionProfileSchema,
  chartMethodVersions,
  type ChartCalculationMethod,
  type ChartInterpretationMode,
  type ChartMethodVersion
} from "@elevenhouse/contracts";
import type {
  ChartCalculationJob,
  ChartCalculationParticipant,
  ChartJobForProcessing,
  ChartJobLease
} from "@elevenhouse/domain";
import { sql } from "drizzle-orm";
import { chartCalculationJobs } from "../../schema";

export type ChartCalculationJobRow = typeof chartCalculationJobs.$inferSelect;
export type ChartCalculationJobReturningRow = Omit<ChartCalculationJobRow, "lockedUntil"> & {
  readonly lockedUntil: Date | string | null;
};
const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function chartCalculationJobReturningColumns() {
  return sql`
    ${chartCalculationJobs.id} as "id",
    ${chartCalculationJobs.ownerUserId} as "ownerUserId",
    ${chartCalculationJobs.clientId} as "clientId",
    ${chartCalculationJobs.resultCalculationId} as "resultCalculationId",
    ${chartCalculationJobs.targetCalculationId} as "targetCalculationId",
    ${chartCalculationJobs.expectedSourceChecksum} as "expectedSourceChecksum",
    ${chartCalculationJobs.method} as "method",
    ${chartCalculationJobs.interpretationMode} as "interpretationMode",
    ${chartCalculationJobs.methodVersion} as "methodVersion",
    ${chartCalculationJobs.status} as "status",
    ${chartCalculationJobs.inputFingerprint} as "inputFingerprint",
    ${chartCalculationJobs.inputSnapshot} as "inputSnapshot",
    ${chartCalculationJobs.settingsSnapshot} as "settingsSnapshot",
    ${chartCalculationJobs.participantSnapshot} as "participantSnapshot",
    ${chartCalculationJobs.provider} as "provider",
    ${chartCalculationJobs.schemaVersion} as "schemaVersion",
    ${chartCalculationJobs.executionProfile} as "executionProfile",
    ${chartCalculationJobs.attempts} as "attempts",
    ${chartCalculationJobs.maxAttempts} as "maxAttempts",
    ${chartCalculationJobs.lockedBy} as "lockedBy",
    ${chartCalculationJobs.lockedUntil} as "lockedUntil",
    ${chartCalculationJobs.leaseGeneration} as "leaseGeneration",
    ${chartCalculationJobs.resultChecksum} as "resultChecksum",
    ${chartCalculationJobs.resultReproducibilityFingerprint} as "resultReproducibilityFingerprint",
    ${chartCalculationJobs.lastErrorCode} as "lastErrorCode",
    ${chartCalculationJobs.lastErrorMessage} as "lastErrorMessage",
    ${chartCalculationJobs.startedAt} as "startedAt",
    ${chartCalculationJobs.finishedAt} as "finishedAt",
    ${chartCalculationJobs.createdAt} as "createdAt",
    ${chartCalculationJobs.updatedAt} as "updatedAt"
  `;
}

export function toChartCalculationJob(row: ChartCalculationJobRow): ChartCalculationJob {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    clientId: row.clientId,
    interpretationMode: parseChartInterpretationMode(row.interpretationMode),
    resultCalculationId: row.resultCalculationId,
    targetCalculationId: row.targetCalculationId,
    expectedSourceChecksum: row.expectedSourceChecksum,
    method: row.method as ChartCalculationMethod,
    status: row.status as ChartCalculationJob["status"],
    inputFingerprint: row.inputFingerprint,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage
  };
}

export function toChartJobForProcessing(
  row: ChartCalculationJobReturningRow
): ChartJobForProcessing {
  if (
    row.status !== "processing" ||
    row.schemaVersion !== "chart-result.v2" ||
    !row.methodVersion ||
    !row.executionProfile ||
    !row.lockedBy ||
    !row.lockedUntil
  ) {
    throw new Error("CHART_JOB_PROCESSING_ROW_INVALID");
  }
  const method = row.method as ChartCalculationMethod;
  const methodVersion = row.methodVersion as ChartMethodVersion;
  if (chartMethodVersions[method] !== methodVersion) {
    throw new Error("CHART_METHOD_VERSION_MISMATCH");
  }
  const executionProfile = chartExecutionProfileSchema.parse(row.executionProfile);
  const participants = parseChartCalculationParticipants(
    row.participantSnapshot,
    method,
    row.clientId
  );
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    clientId: row.clientId,
    interpretationMode: parseChartInterpretationMode(row.interpretationMode),
    method,
    methodVersion,
    executionProfile,
    status: "processing",
    inputSnapshot: row.inputSnapshot,
    settingsSnapshot: row.settingsSnapshot,
    participants,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    targetCalculationId: row.targetCalculationId,
    expectedSourceChecksum: row.expectedSourceChecksum,
    lease: toChartJobLease(row)
  };
}

export function parseChartInterpretationMode(value: unknown): ChartInterpretationMode {
  if (value === null || value === undefined) return "legacy_unclassified";
  if (value === "adult_natal" || value === "child" || value === "legacy_unclassified") {
    return value;
  }
  throw new Error("CHART_JOB_INTERPRETATION_MODE_INVALID");
}

export function toChartJobLease(row: ChartCalculationJobReturningRow): ChartJobLease {
  if (!row.lockedBy || !row.lockedUntil) throw new Error("CHART_JOB_LEASE_INVALID");
  return {
    lockedBy: row.lockedBy,
    leaseGeneration: row.leaseGeneration,
    lockedUntil: parseChartDatabaseTimestamp(
      row.lockedUntil,
      "CHART_JOB_LEASE_INVALID"
    ).toISOString()
  };
}

export function parseChartDatabaseTimestamp(value: unknown, errorCode: string): Date {
  if (!(value instanceof Date) && typeof value !== "string") throw new Error(errorCode);
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(errorCode);
  return parsed;
}

export function parseChartCalculationParticipants(
  value: unknown,
  method: ChartCalculationMethod,
  clientId: string
): readonly ChartCalculationParticipant[] {
  if (!Array.isArray(value)) throw new Error("CHART_JOB_PARTICIPANTS_INVALID");
  const participants = value.map((participant) => {
    if (
      !participant ||
      typeof participant !== "object" ||
      Object.keys(participant).sort().join(",") !== "clientId,role"
    ) {
      throw new Error("CHART_JOB_PARTICIPANTS_INVALID");
    }
    const row = participant as Record<string, unknown>;
    if (
      (row.role !== "subject" && row.role !== "partner") ||
      typeof row.clientId !== "string" ||
      !canonicalUuidPattern.test(row.clientId)
    ) {
      throw new Error("CHART_JOB_PARTICIPANTS_INVALID");
    }
    return {
      role: row.role as ChartCalculationParticipant["role"],
      clientId: row.clientId
    };
  });
  const relationship = method === "synastry" || method === "composite";
  if (
    participants.length !== (relationship ? 2 : 1) ||
    participants[0]?.role !== "subject" ||
    participants[0].clientId !== clientId ||
    (relationship && (participants[1]?.role !== "partner" || participants[1].clientId === clientId))
  ) {
    throw new Error("CHART_JOB_PARTICIPANTS_INVALID");
  }
  return participants;
}
