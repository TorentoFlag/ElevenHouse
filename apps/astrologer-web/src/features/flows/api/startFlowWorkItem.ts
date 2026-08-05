import {
  flowWorkItemMutationResponseSchema,
  startFlowWorkItemRequestSchema,
  type FlowWorkItemMutationResponse,
  type StartFlowWorkItemRequest
} from "@elevenhouse/contracts";

import { application } from "../../../Application";

export type StartFlowWorkItemInput = {
  readonly workItemId: string;
  readonly body: StartFlowWorkItemRequest;
  readonly idempotencyKey: string;
};

export async function startFlowWorkItem(
  input: StartFlowWorkItemInput
): Promise<FlowWorkItemMutationResponse> {
  const body = startFlowWorkItemRequestSchema.parse(input.body);
  return flowWorkItemMutationResponseSchema.parse(
    await application.http.post(
      `/flow-work-items/${encodeURIComponent(input.workItemId)}/start`,
      body,
      {
        csrf: true,
        headers: { "idempotency-key": input.idempotencyKey }
      }
    )
  );
}
