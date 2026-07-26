import {
  flowRunSnapshotSchema,
  type FlowRunSnapshot,
  type FlowRunStatus
} from "@elevenhouse/contracts";

export type FlowRunSnapshotInput = Omit<FlowRunSnapshot, "schemaVersion">;

export type FlowRunTransitionInput = {
  from: FlowRunStatus;
  to: FlowRunStatus;
};

export type FlowRunTransitionResult =
  | {
      ok: true;
      status: FlowRunStatus;
    }
  | {
      ok: false;
      code: "terminal_run_cannot_transition" | "invalid_flow_run_transition";
      message: string;
    };

const terminalStatuses = new Set<FlowRunStatus>([
  "completed",
  "skipped",
  "failed_terminal",
  "suppressed",
  "expired",
  "canceled"
]);

const allowedTransitions: Record<FlowRunStatus, FlowRunStatus[]> = {
  pending: ["running", "skipped", "suppressed", "expired", "canceled", "failed_retryable"],
  running: [
    "waiting",
    "approval_required",
    "completed",
    "skipped",
    "suppressed",
    "failed_retryable",
    "failed_terminal",
    "expired",
    "canceled"
  ],
  waiting: [
    "running",
    "approval_required",
    "completed",
    "skipped",
    "suppressed",
    "failed_retryable",
    "failed_terminal",
    "expired",
    "canceled"
  ],
  approval_required: ["running", "completed", "failed_terminal", "canceled"],
  completed: [],
  skipped: [],
  failed_retryable: ["running", "failed_terminal", "canceled"],
  failed_terminal: [],
  suppressed: [],
  expired: [],
  canceled: []
};

export function createFlowRunSnapshot(input: FlowRunSnapshotInput): FlowRunSnapshot {
  return flowRunSnapshotSchema.parse({
    schemaVersion: "flow-run-snapshot.v1",
    ...input
  });
}

export function advanceFlowRunStatus(input: FlowRunTransitionInput): FlowRunTransitionResult {
  if (terminalStatuses.has(input.from)) {
    return {
      ok: false,
      code: "terminal_run_cannot_transition",
      message: `Terminal flow runs cannot transition to ${input.to}.`
    };
  }

  if (!allowedTransitions[input.from]?.includes(input.to)) {
    return {
      ok: false,
      code: "invalid_flow_run_transition",
      message: `Flow run cannot transition from ${input.from} to ${input.to}.`
    };
  }

  return {
    ok: true,
    status: input.to
  };
}
