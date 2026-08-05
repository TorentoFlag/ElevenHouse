import {
  FLOW_DEFINITION_DETAIL_V3_MEDIA_TYPE,
  flowDefinitionDetailV3Schema,
  type FlowDefinitionDetailV3
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function getFlowDefinition(flowId: string): Promise<FlowDefinitionDetailV3> {
  return flowDefinitionDetailV3Schema.parse(
    await application.http.get(`/flows/${encodeURIComponent(flowId)}`, {
      cache: "no-store",
      headers: { accept: FLOW_DEFINITION_DETAIL_V3_MEDIA_TYPE }
    })
  );
}
