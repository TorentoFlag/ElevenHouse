import {
  activateFlowVersionRequestSchema,
  activateFlowVersionResponseSchema,
  type ActivateFlowVersionRequest,
  type ActivateFlowVersionResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type ActivateFlowInput = {
  readonly flowId: string;
  readonly body: ActivateFlowVersionRequest;
  readonly idempotencyKey: string;
};

export async function activateFlow(input: ActivateFlowInput): Promise<ActivateFlowVersionResponse> {
  const body = activateFlowVersionRequestSchema.parse(input.body);
  return activateFlowVersionResponseSchema.parse(
    await application.http.post(`/flows/${encodeURIComponent(input.flowId)}/activate`, body, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
