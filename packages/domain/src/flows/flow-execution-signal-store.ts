export const FLOW_CHART_CALCULATION_TERMINAL_SIGNAL = "chart.calculation.terminal.v1" as const;

export type FlowExecutionSignalOutcome = "succeeded" | "failed";

export type FlowExecutionSignalIngestResult =
  | { readonly status: "consumed"; readonly runId: string; readonly traceSequence: bigint }
  | { readonly status: "stored" }
  | { readonly status: "replayed" };

export type FlowExecutionSignalStore = {
  readonly ingest: (input: {
    readonly sourceEventId: string;
    readonly ownerUserId: string;
    readonly signalType: typeof FLOW_CHART_CALCULATION_TERMINAL_SIGNAL;
    readonly correlationId: string;
    readonly outcome: FlowExecutionSignalOutcome;
    readonly occurredAt: string;
  }) => Promise<FlowExecutionSignalIngestResult>;
};
