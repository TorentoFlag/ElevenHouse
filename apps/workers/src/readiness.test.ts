import { describe, expect, it, vi } from "vitest";
import { createWorkerReadiness } from "./readiness";

describe("workers readiness", () => {
  it("reports every runtime dependency", async () => {
    await expect(
      createWorkerReadiness({
        service: "workers",
        now: new Date("2026-06-09T00:00:00.000Z"),
        checks: {
          postgres: vi.fn(async () => undefined),
          calculationPdfQueue: vi.fn(async () => undefined),
          calculationPdfWorker: vi.fn(async () => undefined),
          privateObjectStorage: vi.fn(async () => undefined),
          flowExecutionRuntime: vi.fn(async () => undefined),
          flowWorkerControl: vi.fn(async () => undefined)
        }
      })
    ).resolves.toEqual({
      service: "workers",
      status: "ready",
      timestamp: "2026-06-09T00:00:00.000Z",
      dependencies: {
        postgres: { status: "ready" },
        calculationPdfQueue: { status: "ready" },
        calculationPdfWorker: { status: "ready" },
        privateObjectStorage: { status: "ready" },
        flowExecutionRuntime: { status: "ready" },
        flowWorkerControl: { status: "ready" }
      }
    });
  });

  it("reports an unavailable dependency without hiding the others", async () => {
    await expect(
      createWorkerReadiness({
        service: "workers",
        checks: {
          postgres: vi.fn(async () => undefined),
          calculationPdfQueue: vi.fn(async () => {
            throw new Error("redis unavailable");
          }),
          calculationPdfWorker: vi.fn(async () => undefined),
          privateObjectStorage: vi.fn(async () => undefined),
          flowExecutionRuntime: vi.fn(async () => {
            throw new Error("flow_execution_recovery_stale");
          }),
          flowWorkerControl: vi.fn(async () => {
            throw new Error("flow_worker_readiness_heartbeat_failed");
          })
        }
      })
    ).resolves.toMatchObject({
      status: "unready",
      dependencies: {
        postgres: { status: "ready" },
        calculationPdfQueue: { status: "unready", error: "redis unavailable" },
        calculationPdfWorker: { status: "ready" },
        privateObjectStorage: { status: "ready" },
        flowExecutionRuntime: {
          status: "unready",
          error: "flow_execution_recovery_stale"
        },
        flowWorkerControl: {
          status: "unready",
          error: "flow_worker_readiness_heartbeat_failed"
        }
      }
    });
  });
});
