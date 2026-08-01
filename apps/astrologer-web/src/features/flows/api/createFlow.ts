import {
  createFlowRequestSchema,
  flowResponseSchema,
  type CreateFlowRequest,
  type FlowResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function createFlow(body: CreateFlowRequest): Promise<FlowResponse> {
  const normalizedBody = createFlowRequestSchema.parse(body);

  return flowResponseSchema.parse(await application.http.post("/flows", normalizedBody, {
    csrf: true
  }));
}
