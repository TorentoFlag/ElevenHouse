import {
  decideFlowApprovalRequestSchema,
  decideFlowApprovalResponseSchema,
  type DecideFlowApprovalRequest,
  type DecideFlowApprovalResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export type DecideFlowApprovalInput = {
  readonly approvalId: string;
  readonly body: DecideFlowApprovalRequest;
};

export async function decideFlowApproval(
  input: DecideFlowApprovalInput
): Promise<DecideFlowApprovalResponse> {
  const normalizedBody = decideFlowApprovalRequestSchema.parse(input.body);

  return decideFlowApprovalResponseSchema.parse(
    await application.http.post(
      `/flow-approvals/${input.approvalId}/decision`,
      normalizedBody,
      { csrf: true }
    )
  );
}
