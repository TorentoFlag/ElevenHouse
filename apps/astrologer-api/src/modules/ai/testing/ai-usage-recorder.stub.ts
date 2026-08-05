import type { AiUsageRecorderPort } from "../ai-usage-recorder";
import { vi } from "vitest";

/** Test-only recorder for HTTP routes that replace the full generation service. */
export function createAiUsageRecorderStub(): AiUsageRecorderPort {
  return {
    start: vi.fn(async (record) => record.attemptId),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    reconcileStale: vi.fn(async () => [])
  };
}
