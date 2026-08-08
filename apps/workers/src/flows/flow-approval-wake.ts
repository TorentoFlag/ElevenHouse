import type { FlowApprovalWakeStore, FlowApprovalWakeSweepResult } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";

export async function wakeDueFlowApprovals(input: {
  readonly store: FlowApprovalWakeStore;
  readonly limit: number;
  readonly logger?: Pick<Logger, "info" | "warn">;
}): Promise<FlowApprovalWakeSweepResult> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    throw new TypeError("Flow approval wake limit must be an integer between 1 and 100");
  }
  const result = await input.store.wakeDue({ limit: input.limit });
  if (result.integrityFailureCount > 0) {
    input.logger?.warn("flow approval wake found integrity failures", {
      errorCode: "flow_approval_wake_integrity_failure",
      integrityFailureCount: result.integrityFailureCount,
      expiredCount: result.expiredCount,
      wokenCount: result.wokenCount
    });
  }
  return result;
}
