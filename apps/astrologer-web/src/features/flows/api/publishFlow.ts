import {
  FLOW_PUBLICATION_V3_MEDIA_TYPE,
  publishFlowDefinitionV2RequestSchema,
  publishFlowDefinitionV3ResponseSchema,
  type PublishFlowDefinitionV2Request,
  type PublishFlowDefinitionV3Response
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type PublishFlowInput = {
  readonly flowId: string;
  readonly body: PublishFlowDefinitionV2Request;
  readonly idempotencyKey: string;
};

export async function publishFlow(
  input: PublishFlowInput
): Promise<PublishFlowDefinitionV3Response> {
  const body = publishFlowDefinitionV2RequestSchema.parse(input.body);

  return publishFlowDefinitionV3ResponseSchema.parse(
    await application.http.post(`/flows/${input.flowId}/publish`, body, {
      csrf: true,
      headers: {
        accept: FLOW_PUBLICATION_V3_MEDIA_TYPE,
        "idempotency-key": input.idempotencyKey
      }
    })
  );
}
