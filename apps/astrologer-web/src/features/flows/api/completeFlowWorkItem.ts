import {
  completeFlowWorkItemRequestSchema,
  flowWorkItemMutationResponseSchema,
  type CompleteFlowWorkItemRequest,
  type FlowWorkItemMutationResponse
} from "@elevenhouse/contracts";

import { application } from "../../../Application";

export type CompleteFlowWorkItemInput = {
  readonly workItemId: string;
  readonly body: CompleteFlowWorkItemRequest;
  readonly idempotencyKey: string;
};

export async function completeFlowWorkItem(
  input: CompleteFlowWorkItemInput
): Promise<FlowWorkItemMutationResponse> {
  const body = completeFlowWorkItemRequestSchema.parse(input.body);
  return flowWorkItemMutationResponseSchema.parse(
    await application.http.post(
      `/flow-work-items/${encodeURIComponent(input.workItemId)}/complete`,
      body,
      {
        csrf: true,
        headers: { "idempotency-key": input.idempotencyKey }
      }
    )
  );
}
