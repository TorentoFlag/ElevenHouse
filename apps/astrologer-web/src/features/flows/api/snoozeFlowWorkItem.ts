import {
  flowWorkItemMutationResponseSchema,
  snoozeFlowWorkItemRequestSchema,
  type FlowWorkItemMutationResponse,
  type SnoozeFlowWorkItemRequest
} from "@elevenhouse/contracts";

import { application } from "../../../Application";

export type SnoozeFlowWorkItemInput = {
  readonly workItemId: string;
  readonly body: SnoozeFlowWorkItemRequest;
  readonly idempotencyKey: string;
};

export async function snoozeFlowWorkItem(
  input: SnoozeFlowWorkItemInput
): Promise<FlowWorkItemMutationResponse> {
  const body = snoozeFlowWorkItemRequestSchema.parse(input.body);
  return flowWorkItemMutationResponseSchema.parse(
    await application.http.post(
      `/flow-work-items/${encodeURIComponent(input.workItemId)}/snooze`,
      body,
      {
        csrf: true,
        headers: { "idempotency-key": input.idempotencyKey }
      }
    )
  );
}
