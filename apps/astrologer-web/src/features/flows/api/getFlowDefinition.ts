import { flowDefinitionDetailV2Schema, type FlowDefinitionDetailV2 } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getFlowDefinition(flowId: string): Promise<FlowDefinitionDetailV2> {
  return flowDefinitionDetailV2Schema.parse(
    await application.http.get(`/flows/${encodeURIComponent(flowId)}`)
  );
}
