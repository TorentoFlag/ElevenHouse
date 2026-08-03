import {
  createNextFlowDraftV2RequestSchema,
  flowDefinitionV2Schema,
  type CreateNextFlowDraftV2Request,
  type FlowDefinitionV2
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type CreateNextFlowDraftInput = {
  readonly flowId: string;
  readonly body: CreateNextFlowDraftV2Request;
  readonly idempotencyKey: string;
};

export async function createNextFlowDraft(
  input: CreateNextFlowDraftInput
): Promise<FlowDefinitionV2> {
  const body = createNextFlowDraftV2RequestSchema.parse(input.body);

  return flowDefinitionV2Schema.parse(
    await application.http.post(`/flows/${input.flowId}/next-draft`, body, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
