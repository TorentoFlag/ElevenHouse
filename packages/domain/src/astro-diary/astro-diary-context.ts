import {
  astroDiaryContextSnapshotSchema,
  type AstroDiaryContextSnapshot
} from "@elevenhouse/contracts";
import { Temporal } from "@js-temporal/polyfill";

export function createAstroDiaryContextRequest(input: {
  readonly contextId: string;
  readonly journalId: string;
  readonly itemId: string;
  readonly sourceItemRevision: number;
  readonly sourceItemDigest: `sha256:${string}`;
  readonly eventAt: string;
  readonly eventTimezone: string;
}): AstroDiaryContextSnapshot {
  return astroDiaryContextSnapshotSchema.parse({
    id: input.contextId,
    journalId: input.journalId,
    itemId: input.itemId,
    sourceItemRevision: input.sourceItemRevision,
    sourceItemDigest: input.sourceItemDigest,
    eventAt: Temporal.Instant.from(input.eventAt).toString(),
    eventTimezone: input.eventTimezone,
    status: "pending",
    version: 1,
    engineRevision: null,
    globalContextRef: null,
    birthProfileId: null,
    birthProfileRevision: null,
    personalChartRef: null,
    contextDigest: null,
    failureCode: null,
    calculatedAt: null
  });
}

export type AstroDiaryContextTransitionOutcome =
  | Readonly<{ outcome: "applied"; context: AstroDiaryContextSnapshot }>
  | Readonly<{ outcome: "source_stale"; context: AstroDiaryContextSnapshot }>
  | Readonly<{ outcome: "already_terminal" }>
  | Readonly<{ outcome: "version_conflict"; expectedVersion: number; currentVersion: number }>;

export function applyAstroDiaryContextSnapshot(
  context: AstroDiaryContextSnapshot,
  input: {
    readonly expectedVersion: number;
    readonly observedSourceItemRevision: number;
    readonly observedSourceItemDigest: `sha256:${string}`;
    readonly engineRevision: string;
    readonly globalContextRef: string;
    readonly personalEvidence: null | Readonly<{
      birthProfileId: string;
      birthProfileRevision: number;
      personalChartRef: string;
    }>;
    readonly contextDigest: `sha256:${string}`;
    readonly calculatedAt: string;
  }
): AstroDiaryContextTransitionOutcome {
  const conflict = versionConflict(context, input.expectedVersion);
  if (conflict) return conflict;
  if (context.status !== "pending") return { outcome: "already_terminal" };
  if (
    input.observedSourceItemRevision !== context.sourceItemRevision ||
    input.observedSourceItemDigest !== context.sourceItemDigest
  ) {
    return {
      outcome: "source_stale",
      context: astroDiaryContextSnapshotSchema.parse({
        ...context,
        status: "source_stale",
        version: context.version + 1,
        failureCode: "source_stale",
        calculatedAt: Temporal.Instant.from(input.calculatedAt).toString()
      })
    };
  }
  const personal = input.personalEvidence;
  return {
    outcome: "applied",
    context: astroDiaryContextSnapshotSchema.parse({
      ...context,
      status: personal ? "personal" : "global_only",
      version: context.version + 1,
      engineRevision: input.engineRevision,
      globalContextRef: input.globalContextRef,
      birthProfileId: personal?.birthProfileId ?? null,
      birthProfileRevision: personal?.birthProfileRevision ?? null,
      personalChartRef: personal?.personalChartRef ?? null,
      contextDigest: input.contextDigest,
      failureCode: null,
      calculatedAt: Temporal.Instant.from(input.calculatedAt).toString()
    })
  };
}

export function applyAstroDiaryContextFailure(
  context: AstroDiaryContextSnapshot,
  input: {
    readonly expectedVersion: number;
    readonly failureCode: string;
    readonly observedAt: string;
  }
): AstroDiaryContextTransitionOutcome {
  const conflict = versionConflict(context, input.expectedVersion);
  if (conflict) return conflict;
  if (context.status !== "pending") return { outcome: "already_terminal" };
  return {
    outcome: "applied",
    context: astroDiaryContextSnapshotSchema.parse({
      ...context,
      status: "failed",
      version: context.version + 1,
      failureCode: input.failureCode,
      calculatedAt: Temporal.Instant.from(input.observedAt).toString()
    })
  };
}

function versionConflict(
  context: AstroDiaryContextSnapshot,
  expectedVersion: number
): Extract<AstroDiaryContextTransitionOutcome, { outcome: "version_conflict" }> | null {
  return expectedVersion === context.version
    ? null
    : { outcome: "version_conflict", expectedVersion, currentVersion: context.version };
}
