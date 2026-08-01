import {
  simulateFlowRunRequestSchema,
  simulateFlowRunResponseSchema,
  type SimulateFlowRunRequest,
  type SimulateFlowRunResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type SimulateFlowRunInput = {
  readonly flowId: string;
  readonly body: SimulateFlowRunRequest;
};

export async function simulateFlowRun(input: SimulateFlowRunInput): Promise<SimulateFlowRunResponse> {
  const normalizedBody = simulateFlowRunRequestSchema.parse(input.body);

  return simulateFlowRunResponseSchema.parse(
    await application.http.post(`/flows/${input.flowId}/simulate`, normalizedBody, {
      csrf: true
    })
  );
}
