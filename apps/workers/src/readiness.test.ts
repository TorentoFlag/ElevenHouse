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
          matrixPdfQueue: vi.fn(async () => undefined),
          matrixPdfWorker: vi.fn(async () => undefined)
        }
      })
    ).resolves.toEqual({
      service: "workers",
      status: "ready",
      timestamp: "2026-06-09T00:00:00.000Z",
      dependencies: {
        postgres: { status: "ready" },
        matrixPdfQueue: { status: "ready" },
        matrixPdfWorker: { status: "ready" }
      }
    });
  });

  it("reports an unavailable dependency without hiding the others", async () => {
    await expect(
      createWorkerReadiness({
        service: "workers",
        checks: {
          postgres: vi.fn(async () => undefined),
          matrixPdfQueue: vi.fn(async () => {
            throw new Error("redis unavailable");
          }),
          matrixPdfWorker: vi.fn(async () => undefined)
        }
      })
    ).resolves.toMatchObject({
      status: "unready",
      dependencies: {
        postgres: { status: "ready" },
        matrixPdfQueue: { status: "unready", error: "redis unavailable" },
        matrixPdfWorker: { status: "ready" }
      }
    });
  });
});
