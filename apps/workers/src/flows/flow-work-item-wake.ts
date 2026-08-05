import type { FlowWorkItemWakeStore, FlowWorkItemWakeSweepResult } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";

const MAX_FLOW_WORK_ITEM_WAKE_BATCH_SIZE = 100;

export async function wakeDueFlowWorkItems(input: {
  readonly store: FlowWorkItemWakeStore;
  readonly limit: number;
  readonly logger?: Logger;
}): Promise<FlowWorkItemWakeSweepResult> {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_FLOW_WORK_ITEM_WAKE_BATCH_SIZE
  ) {
    throw new Error("FLOW_WORK_ITEM_WAKE_LIMIT_INVALID");
  }

  let result: FlowWorkItemWakeSweepResult;
  try {
    result = await input.store.wakeDue({ limit: input.limit });
  } catch (error) {
    input.logger?.error("flow work item wake sweep failed", {
      errorCode: "flow_work_item_wake_sweep_failed",
      limit: input.limit
    });
    throw error;
  }
  const telemetry = {
    limit: input.limit,
    asOf: result.asOf,
    wokenCount: result.wokenCount,
    staleCount: result.staleCount,
    integrityFailureCount: result.integrityFailureCount,
    hasMore: result.hasMore
  };
  input.logger?.info("flow work item wake sweep completed", telemetry);
  if (result.integrityFailureCount > 0) {
    input.logger?.error("flow work item wake sweep detected integrity failures", {
      errorCode: "flow_work_item_wake_integrity_failures",
      ...telemetry
    });
  }
  return result;
}
