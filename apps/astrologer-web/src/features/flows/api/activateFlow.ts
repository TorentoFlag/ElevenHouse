import { flowResponseSchema, type FlowResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function activateFlow(flowId: string): Promise<FlowResponse> {
  return flowResponseSchema.parse(
    await application.http.post(`/flows/${flowId}/activate`, undefined, {
      csrf: true
    })
  );
}
