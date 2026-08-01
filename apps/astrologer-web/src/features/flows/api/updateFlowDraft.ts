import {
  flowResponseSchema,
  updateFlowDraftRequestSchema,
  type FlowResponse,
  type UpdateFlowDraftRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type UpdateFlowDraftInput = {
  readonly flowId: string;
  readonly body: UpdateFlowDraftRequest;
};

export async function updateFlowDraft(input: UpdateFlowDraftInput): Promise<FlowResponse> {
  const normalizedBody = updateFlowDraftRequestSchema.parse(input.body);

  return flowResponseSchema.parse(
    await application.http.patch(`/flows/${input.flowId}/draft`, normalizedBody, {
      csrf: true
    })
  );
}
