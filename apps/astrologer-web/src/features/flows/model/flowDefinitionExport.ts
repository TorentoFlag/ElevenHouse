import type { FlowDefinitionDetailV2 } from "@elevenhouse/contracts";

type LegacyFlowDefinitionDetail = Extract<
  FlowDefinitionDetailV2,
  { graphSchemaVersion: "flow-graph.v1" }
>;

export type LegacyFlowDefinitionExport = {
  readonly filename: string;
  readonly mimeType: "application/json;charset=utf-8";
  readonly contents: string;
};

export function buildLegacyFlowDefinitionExport(
  flow: LegacyFlowDefinitionDetail
): LegacyFlowDefinitionExport {
  return {
    filename: `flow-${flow.id}-legacy-v1.json`,
    mimeType: "application/json;charset=utf-8",
    contents: `${JSON.stringify(flow, null, 2)}\n`
  };
}
