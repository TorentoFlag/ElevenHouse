import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { AiUsageAttempt } from "@elevenhouse/domain";
import { AiUsageReconciliationService } from "./ai-usage-reconciliation.service";
import type { AiUsageRecorderPort } from "./ai-usage-recorder";

const staleAttempt: AiUsageAttempt = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "indeterminate",
  feature: "chart.interpretationDraft",
  promptId: "chart.interpretationDraft",
  promptVersion: 3,
  provider: "openai",
  ownerSafetyId: `eh_${"a".repeat(61)}`,
  consentRecordIds: [],
  processingAuthorityVersion: null,
  resourceType: null,
  resourceId: null,
  sourceChecksum: null,
  model: null,
  finishReason: null,
  safeErrorCode: "AI_USAGE_OUTCOME_INDETERMINATE",
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  durationMs: 300_000,
  startedAt: "2026-08-03T11:55:00.000Z",
  completedAt: "2026-08-03T12:00:00.000Z"
};

describe("AiUsageReconciliationService", () => {
  it("reconciles only attempts older than the provider timeout safety window", async () => {
    const reconcileStale = vi.fn<AiUsageRecorderPort["reconcileStale"]>(async () => [
      staleAttempt
    ]);
    const service = new AiUsageReconciliationService(
      { reconcileStale },
      createConfigService(90_000)
    );

    await expect(service.runOnce(new Date("2026-08-03T12:00:00.000Z"))).resolves.toBe(1);
    expect(reconcileStale).toHaveBeenCalledWith({
      startedBefore: new Date("2026-08-03T11:55:00.000Z"),
      reconciledAt: new Date("2026-08-03T12:00:00.000Z"),
      limit: 100
    });
  });

  it("coalesces overlapping runs and emits only a safe failure code", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sensitive = "client@example.test SQL select * from secrets";
    const reconcileStale = vi.fn<AiUsageRecorderPort["reconcileStale"]>(async () => {
      await pending;
      throw new Error(sensitive);
    });
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const service = new AiUsageReconciliationService(
      { reconcileStale },
      createConfigService(90_000)
    );

    const first = service.runOnce(new Date("2026-08-03T12:00:00.000Z"));
    const second = service.runOnce(new Date("2026-08-03T12:00:01.000Z"));
    release?.();
    await expect(first).rejects.toThrow(sensitive);
    await expect(second).rejects.toThrow(sensitive);
    expect(reconcileStale).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(sensitive);
    expect(JSON.stringify(errorLog.mock.calls)).toContain("ai_usage_reconciliation_failed");
    errorLog.mockRestore();
  });
});

function createConfigService(timeoutMs: number): ConfigService {
  return new ConfigService({ astrologerApi: { ai: { timeoutMs } } });
}
