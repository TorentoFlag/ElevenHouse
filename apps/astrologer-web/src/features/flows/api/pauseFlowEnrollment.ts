import {
  pauseFlowEnrollmentRequestSchema,
  pauseFlowEnrollmentResponseSchema,
  type PauseFlowEnrollmentRequest,
  type PauseFlowEnrollmentResponse
} from "@elevenhouse/contracts";

import { application } from "../../../Application";

export type PauseFlowEnrollmentInput = {
  readonly flowId: string;
  readonly body: PauseFlowEnrollmentRequest;
  readonly idempotencyKey: string;
};

export async function pauseFlowEnrollment(
  input: PauseFlowEnrollmentInput
): Promise<PauseFlowEnrollmentResponse> {
  const body = pauseFlowEnrollmentRequestSchema.parse(input.body);
  return pauseFlowEnrollmentResponseSchema.parse(
    await application.http.post(
      `/flows/${encodeURIComponent(input.flowId)}/pause-enrollment`,
      body,
      {
        csrf: true,
        headers: { "idempotency-key": input.idempotencyKey }
      }
    )
  );
}
