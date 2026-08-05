import type { FlowRuntimeAvailability } from "@elevenhouse/contracts";

export const FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE =
  "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" as const;

export const FLOW_RUNTIME_AVAILABILITY = Object.freeze({
  mode: "definition_only",
  executionAvailable: false,
  reasonCode: FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE,
  historySemantics: "durable_execution"
} satisfies FlowRuntimeAvailability);

export class FlowRuntimeExecutionUnavailableError extends Error {
  readonly code = FLOW_RUNTIME_EXECUTION_UNAVAILABLE_CODE;

  constructor() {
    super("Flow execution is unavailable until the durable flow-graph.v2 runtime is enabled.");
    this.name = "FlowRuntimeExecutionUnavailableError";
  }
}

export function throwFlowRuntimeExecutionUnavailable(): never {
  throw new FlowRuntimeExecutionUnavailableError();
}
