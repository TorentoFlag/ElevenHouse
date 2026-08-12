import {
  deleteFlowDefinitionResponseSchema,
  duplicateFlowDefinitionRequestSchema,
  flowDefinitionLifecycleTransitionRequestSchema,
  flowDefinitionV2Schema,
  type DeleteFlowDefinitionResponse,
  type DuplicateFlowDefinitionRequest,
  type FlowDefinitionLifecycleTransitionRequest,
  type FlowDefinitionV2
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type FlowDefinitionLifecycleInput = {
  readonly flowId: string;
  readonly body: FlowDefinitionLifecycleTransitionRequest;
};

export type DuplicateFlowDefinitionInput = {
  readonly flowId: string;
  readonly body: DuplicateFlowDefinitionRequest;
};

export async function archiveFlowDefinition(
  input: FlowDefinitionLifecycleInput
): Promise<FlowDefinitionV2> {
  const body = flowDefinitionLifecycleTransitionRequestSchema.parse(input.body);
  return flowDefinitionV2Schema.parse(
    await application.http.post(`/flows/${encodeURIComponent(input.flowId)}/archive`, body, {
      csrf: true
    })
  );
}

export async function restoreFlowDefinition(
  input: FlowDefinitionLifecycleInput
): Promise<FlowDefinitionV2> {
  const body = flowDefinitionLifecycleTransitionRequestSchema.parse(input.body);
  return flowDefinitionV2Schema.parse(
    await application.http.post(`/flows/${encodeURIComponent(input.flowId)}/restore`, body, {
      csrf: true
    })
  );
}

export async function duplicateFlowDefinition(
  input: DuplicateFlowDefinitionInput
): Promise<FlowDefinitionV2> {
  const body = duplicateFlowDefinitionRequestSchema.parse(input.body);
  return flowDefinitionV2Schema.parse(
    await application.http.post(`/flows/${encodeURIComponent(input.flowId)}/duplicate`, body, {
      csrf: true
    })
  );
}

export async function deleteFlowDefinition(
  input: FlowDefinitionLifecycleInput
): Promise<DeleteFlowDefinitionResponse> {
  const body = flowDefinitionLifecycleTransitionRequestSchema.parse(input.body);
  return deleteFlowDefinitionResponseSchema.parse(
    await application.http.post(`/flows/${encodeURIComponent(input.flowId)}/delete`, body, {
      csrf: true
    })
  );
}
