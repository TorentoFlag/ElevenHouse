import {
  flowEnrollmentDetailResponseSchema,
  type FlowEnrollmentDetailResponse
} from "@elevenhouse/contracts";

import { FlowEnrollmentAuthorityIntegrityError } from "./flow-enrollment-control";

export type FlowEnrollmentQueryStore = {
  readonly getByOwner: (input: {
    readonly ownerUserId: string;
    readonly flowId: string;
  }) => Promise<FlowEnrollmentDetailResponse | null>;
};

export async function getFlowEnrollmentDetail(input: {
  readonly store: FlowEnrollmentQueryStore;
  readonly ownerUserId: string;
  readonly flowId: string;
}): Promise<FlowEnrollmentDetailResponse | null> {
  const detail = await input.store.getByOwner({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
  if (detail === null) return null;

  try {
    return flowEnrollmentDetailResponseSchema.parse(detail);
  } catch (error) {
    if (error instanceof FlowEnrollmentAuthorityIntegrityError) throw error;
    throw new FlowEnrollmentAuthorityIntegrityError({ cause: error });
  }
}
