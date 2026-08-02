import {
  validateFlowDefinitionRequestSchema,
  validateFlowDefinitionResponseSchema,
  type FlowGraphRead,
  type ValidateFlowDefinitionResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type ValidateFlowDefinitionInput = {
  readonly flowId: string;
  readonly graph: FlowGraphRead;
};

export async function validateFlowDefinition(
  input: ValidateFlowDefinitionInput
): Promise<ValidateFlowDefinitionResponse> {
  const body = validateFlowDefinitionRequestSchema.parse({ graph: input.graph });
  return validateFlowDefinitionResponseSchema.parse(
    await application.http.post(`/flows/${input.flowId}/validate`, body, {
      csrf: true
    })
  );
}
