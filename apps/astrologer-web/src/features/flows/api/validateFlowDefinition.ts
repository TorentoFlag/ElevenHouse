import {
  FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE,
  validateFlowDefinitionRequestSchema,
  validateFlowDefinitionResponseV2Schema,
  type FlowGraphRead,
  type ValidateFlowDefinitionResponseV2
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type ValidateFlowDefinitionInput = {
  readonly flowId: string;
  readonly graph: FlowGraphRead;
};

export async function validateFlowDefinition(
  input: ValidateFlowDefinitionInput
): Promise<ValidateFlowDefinitionResponseV2> {
  const body = validateFlowDefinitionRequestSchema.parse({ graph: input.graph });
  return validateFlowDefinitionResponseV2Schema.parse(
    await application.http.post(`/flows/${input.flowId}/validate`, body, {
      csrf: true,
      headers: {
        accept: FLOW_DEFINITION_VALIDATION_V2_MEDIA_TYPE
      }
    })
  );
}
