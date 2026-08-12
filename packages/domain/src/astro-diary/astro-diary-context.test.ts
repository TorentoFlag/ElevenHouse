import { describe, expect, it } from "vitest";
import {
  applyAstroDiaryContextFailure,
  applyAstroDiaryContextSnapshot,
  createAstroDiaryContextRequest
} from "./astro-diary-context";

const id = (value: number): string =>
  `80000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const pending = () =>
  createAstroDiaryContextRequest({
    contextId: id(1),
    journalId: id(2),
    itemId: id(3),
    sourceItemRevision: 1,
    sourceItemDigest: `sha256:${"a".repeat(64)}`,
    eventAt: "2026-08-12T09:00:00Z",
    eventTimezone: "Europe/Moscow"
  });

describe("AstroDiary astrology context", () => {
  it("creates a pending immutable source request", () => {
    expect(pending()).toMatchObject({
      status: "pending",
      version: 1,
      engineRevision: null,
      contextDigest: null
    });
  });

  it("applies a global-only snapshot without inventing personal evidence", () => {
    expect(
      applyAstroDiaryContextSnapshot(pending(), {
        expectedVersion: 1,
        observedSourceItemRevision: 1,
        observedSourceItemDigest: `sha256:${"a".repeat(64)}`,
        engineRevision: "chart-engine@2026-08-12",
        globalContextRef: id(4),
        personalEvidence: null,
        contextDigest: `sha256:${"b".repeat(64)}`,
        calculatedAt: "2026-08-12T09:00:10Z"
      })
    ).toMatchObject({
      outcome: "applied",
      context: {
        status: "global_only",
        birthProfileId: null,
        personalChartRef: null,
        version: 2
      }
    });
  });

  it("applies exact personal source revisions", () => {
    expect(
      applyAstroDiaryContextSnapshot(pending(), {
        expectedVersion: 1,
        observedSourceItemRevision: 1,
        observedSourceItemDigest: `sha256:${"a".repeat(64)}`,
        engineRevision: "chart-engine@2026-08-12",
        globalContextRef: id(4),
        personalEvidence: {
          birthProfileId: id(5),
          birthProfileRevision: 7,
          personalChartRef: id(6)
        },
        contextDigest: `sha256:${"b".repeat(64)}`,
        calculatedAt: "2026-08-12T09:00:10Z"
      })
    ).toMatchObject({
      outcome: "applied",
      context: { status: "personal", birthProfileRevision: 7 }
    });
  });

  it("marks stale source instead of overwriting the projection", () => {
    expect(
      applyAstroDiaryContextSnapshot(pending(), {
        expectedVersion: 1,
        observedSourceItemRevision: 2,
        observedSourceItemDigest: `sha256:${"c".repeat(64)}`,
        engineRevision: "chart-engine@2026-08-12",
        globalContextRef: id(4),
        personalEvidence: null,
        contextDigest: `sha256:${"b".repeat(64)}`,
        calculatedAt: "2026-08-12T09:00:10Z"
      })
    ).toMatchObject({ outcome: "source_stale", context: { status: "source_stale" } });
  });

  it("persists typed failure without fabricated context", () => {
    expect(
      applyAstroDiaryContextFailure(pending(), {
        expectedVersion: 1,
        failureCode: "engine_unavailable",
        observedAt: "2026-08-12T09:00:10Z"
      })
    ).toMatchObject({
      outcome: "applied",
      context: { status: "failed", failureCode: "engine_unavailable", globalContextRef: null }
    });
  });
});
