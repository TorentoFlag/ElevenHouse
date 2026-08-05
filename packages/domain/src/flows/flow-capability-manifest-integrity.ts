import type { FlowCapabilityManifest, FlowGraphV2 } from "@elevenhouse/contracts";

import { stableJson, type CanonicalJson } from "../calculations/canonical-json";
import { compileFlowGraphV2 } from "./flow-graph-v2-compiler";

export type FlowCapabilityManifestIntegrityResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: "graph_not_publishable" | "manifest_mismatch" };

export function verifyFlowCapabilityManifestForGraph(input: {
  readonly graph: FlowGraphV2;
  readonly capabilityManifest: FlowCapabilityManifest;
}): FlowCapabilityManifestIntegrityResult {
  const compiled = compileFlowGraphV2(input.graph);
  if (!compiled.publishable || !compiled.capabilityManifest) {
    return { valid: false, reason: "graph_not_publishable" };
  }

  return stableJson(compiled.capabilityManifest as unknown as CanonicalJson) ===
    stableJson(input.capabilityManifest as unknown as CanonicalJson)
    ? { valid: true }
    : { valid: false, reason: "manifest_mismatch" };
}
