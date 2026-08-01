import {
  publishFlowResponseSchema,
  type PublishFlowResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function publishFlow(flowId: string): Promise<PublishFlowResponse> {
  return publishFlowResponseSchema.parse(
    await application.http.post(`/flows/${flowId}/publish`, undefined, {
      csrf: true
    })
  );
}
