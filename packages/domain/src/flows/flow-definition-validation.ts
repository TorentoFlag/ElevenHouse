import {
  flowActivationBlockerCodeValues,
  type FlowActivationBlockerCode,
  type FlowGraphRead,
  type ValidateFlowDefinitionResponseV2
} from "@elevenhouse/contracts";

import { compileFlowGraphV2, type FlowGraphV2CompileLimits } from "./flow-graph-v2-compiler";

export type ValidateFlowDefinitionInput = {
  readonly graph: FlowGraphRead;
  readonly activationBlockers: readonly FlowActivationBlockerCode[];
  readonly limits?: FlowGraphV2CompileLimits;
};

export function validateFlowDefinition(
  input: ValidateFlowDefinitionInput
): ValidateFlowDefinitionResponseV2 {
  const compiled = compileFlowGraphV2(input.graph, input.limits);
  const activationBlockers = uniqueBlockers([
    ...(compiled.publishable ? [] : (["FLOW_GRAPH_NOT_PUBLISHABLE"] as const)),
    ...input.activationBlockers
  ]);

  return {
    schemaVersion: "flow-definition-validation.v2",
    graphSchemaVersion: "flow-graph.v2",
    publishable: compiled.publishable,
    activatable: compiled.publishable && activationBlockers.length === 0,
    issues: [...compiled.issues],
    activationBlockers,
    normalizedGraph: compiled.normalizedGraph,
    capabilityManifest: compiled.capabilityManifest
  };
}

function uniqueBlockers(
  blockers: readonly FlowActivationBlockerCode[]
): FlowActivationBlockerCode[] {
  return flowActivationBlockerCodeValues.filter((blocker) => blockers.includes(blocker));
}
