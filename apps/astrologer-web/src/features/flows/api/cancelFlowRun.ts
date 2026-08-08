import { cancelFlowRunResponseSchema, type CancelFlowRunResponse } from "@elevenhouse/contracts";

import { application } from "../../../Application";

export type CancelFlowRunInput = {
  readonly runId: string;
  readonly idempotencyKey: string;
};

export async function cancelFlowRun(input: CancelFlowRunInput): Promise<CancelFlowRunResponse> {
  return cancelFlowRunResponseSchema.parse(
    await application.http.post(`/flow-runs/${encodeURIComponent(input.runId)}/cancel`, {}, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
