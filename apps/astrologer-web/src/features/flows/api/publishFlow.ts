import {
  publishFlowDefinitionV2RequestSchema,
  publishFlowDefinitionResponseSchema,
  type PublishFlowDefinitionV2Request,
  type PublishFlowDefinitionResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type PublishFlowInput = {
  readonly flowId: string;
  readonly body: PublishFlowDefinitionV2Request;
  readonly idempotencyKey: string;
};

export async function publishFlow(
  input: PublishFlowInput
): Promise<PublishFlowDefinitionResponse> {
  const body = publishFlowDefinitionV2RequestSchema.parse(input.body);

  return publishFlowDefinitionResponseSchema.parse(
    await application.http.post(`/flows/${input.flowId}/publish`, body, {
      csrf: true,
      headers: {
        "idempotency-key": input.idempotencyKey
      }
    })
  );
}
