import {
  flowActivationBlockerCodeValues,
  validateFlowDefinitionResponseV1Schema,
  type FlowActivationBlockerCode,
  type FlowGraphRead,
  type ValidateFlowDefinitionResponseV1,
  type ValidateFlowDefinitionResponseV2
} from "@elevenhouse/contracts";

import {
  compileFlowGraphV2,
  projectFlowCapabilityManifestV1,
  type FlowGraphV2CompileLimits
} from "./flow-graph-v2-compiler";

export type ValidateFlowDefinitionInput = {
  readonly graph: FlowGraphRead;
  readonly activationBlockers: readonly FlowActivationBlockerCode[];
  readonly limits?: FlowGraphV2CompileLimits;
};

export function validateFlowDefinition(
  input: ValidateFlowDefinitionInput
): ValidateFlowDefinitionResponseV2 {
  if (input.graph.schemaVersion === "flow-graph.v1") {
    const activationBlockers = uniqueBlockers([
      "FLOW_GRAPH_MIGRATION_REQUIRED",
      ...input.activationBlockers
    ]);
    return {
      schemaVersion: "flow-definition-validation.v2",
      graphSchemaVersion: "flow-graph.v1",
      publishable: false,
      activatable: false,
      issues: [
        {
          code: "migration_required",
          severity: "error",
          blocking: true,
          path: "schemaVersion",
          message: "Flow graph v1 requires explicit migration before publishing."
        }
      ],
      activationBlockers,
      normalizedGraph: null,
      capabilityManifest: null
    };
  }

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

export function projectFlowDefinitionValidationV1(
  current: ValidateFlowDefinitionResponseV2
): ValidateFlowDefinitionResponseV1 {
  return validateFlowDefinitionResponseV1Schema.parse({
    ...current,
    schemaVersion: "flow-definition-validation.v1",
    capabilityManifest:
      current.capabilityManifest === null
        ? null
        : projectFlowCapabilityManifestV1(current.capabilityManifest)
  });
}

function uniqueBlockers(
  blockers: readonly FlowActivationBlockerCode[]
): FlowActivationBlockerCode[] {
  return flowActivationBlockerCodeValues.filter((blocker) => blockers.includes(blocker));
}
