import type { FlowExecutionWorkerStore } from "@elevenhouse/domain";
import type { Logger } from "@elevenhouse/observability";

const MAX_FLOW_EXECUTION_RECOVERY_BATCH_SIZE = 100;

export type RecoverExpiredFlowExecutionsResult = {
  readonly status: "idle" | "recovered";
  readonly recoveredCount: number;
  readonly retryScheduledCount: number;
  readonly failedTerminalCount: number;
  readonly quarantinedCount: number;
};

export async function recoverExpiredFlowExecutions(input: {
  readonly store: Pick<FlowExecutionWorkerStore, "recoverExpired">;
  readonly limit: number;
  readonly logger?: Logger;
}): Promise<RecoverExpiredFlowExecutionsResult> {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_FLOW_EXECUTION_RECOVERY_BATCH_SIZE
  ) {
    throw new Error(
      `Flow execution recovery limit must be between 1 and ${MAX_FLOW_EXECUTION_RECOVERY_BATCH_SIZE}`
    );
  }

  const recovery = await input.store.recoverExpired({ limit: input.limit });
  if (recovery.recoveredCount === 0) return { status: "idle", ...recovery };

  input.logger?.warn("expired flow execution leases recovered", recovery);
  return { status: "recovered", ...recovery };
}
