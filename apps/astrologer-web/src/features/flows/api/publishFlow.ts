import {
  publishFlowDefinitionV2RequestSchema,
  publishFlowDefinitionV2ResponseSchema,
  type PublishFlowDefinitionV2Request,
  type PublishFlowDefinitionV2Response
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type PublishFlowInput = {
  readonly flowId: string;
  readonly body: PublishFlowDefinitionV2Request;
  readonly idempotencyKey: string;
};

export async function publishFlow(
  input: PublishFlowInput
): Promise<PublishFlowDefinitionV2Response> {
  const body = publishFlowDefinitionV2RequestSchema.parse(input.body);

  return publishFlowDefinitionV2ResponseSchema.parse(
    await application.http.post(`/flows/${input.flowId}/publish`, body, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
