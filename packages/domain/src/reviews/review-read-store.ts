import type {
  ClientReviewDetail,
  ReviewAdminDetail,
  ReviewPublicListQuery,
  ReviewPublicListResponse
} from "@elevenhouse/contracts";

export type ReviewReadStore = {
  readonly listPublicReviews: (
    query: ReviewPublicListQuery
  ) => Promise<ReviewPublicListResponse>;
  readonly getClientReviewDetail: (input: {
    readonly clientUserId: string;
    readonly reviewableInstanceId: string;
  }) => Promise<ClientReviewDetail | null>;
  readonly getAdminReviewDetail: (input: {
    readonly reviewId: string;
  }) => Promise<ReviewAdminDetail | null>;
};
