import {
  flowEnrollmentDetailResponseSchema,
  type FlowEnrollmentDetailResponse
} from "@elevenhouse/contracts";

import { application } from "../../../Application";

export async function getFlowEnrollment(flowId: string): Promise<FlowEnrollmentDetailResponse> {
  return flowEnrollmentDetailResponseSchema.parse(
    await application.http.get(`/flows/${encodeURIComponent(flowId)}/enrollment`, {
      cache: "no-store"
    })
  );
}
