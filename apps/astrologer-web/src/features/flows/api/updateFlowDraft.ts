import {
  flowDefinitionV2Schema,
  updateFlowDefinitionDraftV2RequestSchema,
  type FlowDefinitionV2,
  type UpdateFlowDefinitionDraftV2Request
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type UpdateFlowDraftInput = {
  readonly flowId: string;
  readonly body: UpdateFlowDefinitionDraftV2Request;
  readonly idempotencyKey: string;
};

export async function updateFlowDraft(input: UpdateFlowDraftInput): Promise<FlowDefinitionV2> {
  const normalizedBody = updateFlowDefinitionDraftV2RequestSchema.parse(input.body);

  return flowDefinitionV2Schema.parse(
    await application.http.patch(`/flows/${input.flowId}/draft`, normalizedBody, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
