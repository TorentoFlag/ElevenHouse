import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { chartAiDraftCommandTtlMs, type ChartAiDraftCommandStore } from "@elevenhouse/domain";
import { ChartAiDraftCommandReconciliationService } from "./chart-ai-draft-command-reconciliation.service";

describe("ChartAiDraftCommandReconciliationService", () => {
  it("periodically terminalizes a bounded batch and exposes backlog pressure", async () => {
    const reconcileExpiredProcessing = vi.fn<
      ChartAiDraftCommandStore["reconcileExpiredProcessing"]
    >(async () => 100);
    const log = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const service = new ChartAiDraftCommandReconciliationService({
      reconcileExpiredProcessing
    });

    await expect(service.runOnce()).resolves.toBe(100);
    expect(reconcileExpiredProcessing).toHaveBeenCalledWith({
      retentionMs: chartAiDraftCommandTtlMs,
      limit: 100
    });
    expect(JSON.stringify(log.mock.calls)).toContain("chart_ai_draft_reconciliation_backlog");
    log.mockRestore();
  });

  it("coalesces overlapping runs and logs no raw storage failure", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sensitive = "private chart SQL diagnostics";
    const reconcileExpiredProcessing = vi.fn<
      ChartAiDraftCommandStore["reconcileExpiredProcessing"]
    >(async () => {
      await pending;
      throw new Error(sensitive);
    });
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const service = new ChartAiDraftCommandReconciliationService({
      reconcileExpiredProcessing
    });

    const first = service.runOnce();
    const second = service.runOnce();
    release?.();
    await expect(first).rejects.toThrow(sensitive);
    await expect(second).rejects.toThrow(sensitive);
    expect(reconcileExpiredProcessing).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).toContain("chart_ai_draft_reconciliation_failed");
    expect(JSON.stringify(error.mock.calls)).not.toContain(sensitive);
    error.mockRestore();
  });
});
