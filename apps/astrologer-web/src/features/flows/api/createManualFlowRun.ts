import {
  createManualClientFlowRunRequestSchema,
  createManualClientFlowRunResponseSchema,
  type CreateManualClientFlowRunRequest,
  type CreateManualClientFlowRunResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type CreateManualFlowRunInput = {
  readonly flowId: string;
  readonly body: CreateManualClientFlowRunRequest;
  readonly idempotencyKey: string;
};

export async function createManualFlowRun(
  input: CreateManualFlowRunInput
): Promise<CreateManualClientFlowRunResponse> {
  const normalizedBody = createManualClientFlowRunRequestSchema.parse(input.body);

  return createManualClientFlowRunResponseSchema.parse(
    await application.http.post(`/flows/${input.flowId}/manual-runs`, normalizedBody, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
