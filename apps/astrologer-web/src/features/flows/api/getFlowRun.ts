import { getFlowRunResponseSchema, type GetFlowRunResponse } from "@elevenhouse/contracts";

import { application } from "../../../Application";

export async function getFlowRun(runId: string): Promise<GetFlowRunResponse> {
  return getFlowRunResponseSchema.parse(
    await application.http.get(`/flow-runs/${encodeURIComponent(runId)}`)
  );
}
