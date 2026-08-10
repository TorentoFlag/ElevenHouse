import { flowDefinitionDetailSchema, type FlowDefinitionDetail } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getFlowDefinition(flowId: string): Promise<FlowDefinitionDetail> {
  return flowDefinitionDetailSchema.parse(
    await application.http.get(`/flows/${encodeURIComponent(flowId)}`, { cache: "no-store" })
  );
}
