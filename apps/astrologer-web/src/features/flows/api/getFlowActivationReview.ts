import {
  flowActivationReviewQuerySchema,
  flowActivationReviewResponseSchema,
  type FlowActivationReviewResponse
} from "@elevenhouse/contracts";

import { application } from "../../../Application";

export type GetFlowActivationReviewInput = {
  readonly flowId: string;
  readonly versionId: string;
};

export async function getFlowActivationReview(
  input: GetFlowActivationReviewInput
): Promise<FlowActivationReviewResponse> {
  const query = flowActivationReviewQuerySchema.parse({ versionId: input.versionId });
  const searchParams = new URLSearchParams({ versionId: query.versionId });
  return flowActivationReviewResponseSchema.parse(
    await application.http.get(
      `/flows/${encodeURIComponent(input.flowId)}/activation-review?${searchParams.toString()}`,
      { cache: "no-store" }
    )
  );
}
