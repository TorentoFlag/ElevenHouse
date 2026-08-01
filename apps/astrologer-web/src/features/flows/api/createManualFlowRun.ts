import {
  manualFlowRunResponseSchema,
  simulateFlowRunRequestSchema,
  type ManualFlowRunResponse,
  type SimulateFlowRunRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type CreateManualFlowRunInput = {
  readonly flowId: string;
  readonly body: SimulateFlowRunRequest;
};

export async function createManualFlowRun(
  input: CreateManualFlowRunInput
): Promise<ManualFlowRunResponse> {
  const normalizedBody = simulateFlowRunRequestSchema.parse(input.body);

  return manualFlowRunResponseSchema.parse(
    await application.http.post(`/flows/${input.flowId}/manual-runs`, normalizedBody, {
      csrf: true
    })
  );
}
