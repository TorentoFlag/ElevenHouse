import {
  createFlowDefinitionV2RequestSchema,
  flowDefinitionV2Schema,
  type CreateFlowDefinitionV2RequestInput,
  type FlowDefinitionV2
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type CreateFlowInput = {
  readonly body: CreateFlowDefinitionV2RequestInput;
  readonly idempotencyKey: string;
};

export async function createFlow(input: CreateFlowInput): Promise<FlowDefinitionV2> {
  const normalizedBody = createFlowDefinitionV2RequestSchema.parse(input.body);

  return flowDefinitionV2Schema.parse(
    await application.http.post("/flows", normalizedBody, {
      csrf: true,
      headers: { "idempotency-key": input.idempotencyKey }
    })
  );
}
