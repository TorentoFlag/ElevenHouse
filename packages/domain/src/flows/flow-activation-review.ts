import {
  flowActivationReviewQuerySchema,
  flowActivationReviewResponseSchema,
  type FlowActivationReviewQueryInput,
  type FlowActivationReviewResponse
} from "@elevenhouse/contracts";

import { FlowEnrollmentAuthorityIntegrityError } from "./flow-enrollment-control";

export type FlowActivationReviewStore = {
  readonly getByOwner: (input: {
    readonly ownerUserId: string;
    readonly flowId: string;
    readonly versionId: string;
  }) => Promise<FlowActivationReviewResponse | null>;
};

export async function reviewFlowActivation(input: {
  readonly store: FlowActivationReviewStore;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly query: FlowActivationReviewQueryInput;
}): Promise<FlowActivationReviewResponse | null> {
  const query = flowActivationReviewQuerySchema.parse(input.query);
  const review = await input.store.getByOwner({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    versionId: query.versionId
  });
  if (review === null) return null;
  try {
    return flowActivationReviewResponseSchema.parse(review);
  } catch (error) {
    if (error instanceof FlowEnrollmentAuthorityIntegrityError) throw error;
    throw new FlowEnrollmentAuthorityIntegrityError({ cause: error });
  }
}
