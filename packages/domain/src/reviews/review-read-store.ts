import type {
  ClientReviewDetail,
  ClientReviewableInstanceListQuery,
  ClientReviewableInstanceListResponse,
  ReviewAstrologerListQuery,
  ReviewAstrologerListResponse,
  ReviewAdminDetail,
  ReviewModerationCaseDetail,
  ReviewModerationQueueQuery,
  ReviewModerationQueueResponse,
  ReviewRequestTargetListQuery,
  ReviewRequestTargetListResponse,
  ReviewPublicListQuery,
  ReviewPublicListResponse
} from "@elevenhouse/contracts";

export type ReviewModerationCaseActorRole = "moderator" | "client" | "astrologer";

export type ReviewReadStore = {
  readonly listPublicReviews: (query: ReviewPublicListQuery) => Promise<ReviewPublicListResponse>;
  readonly listClientReviewableInstances: (
    query: ClientReviewableInstanceListQuery
  ) => Promise<ClientReviewableInstanceListResponse>;
  readonly listAstrologerReviews: (
    query: ReviewAstrologerListQuery
  ) => Promise<ReviewAstrologerListResponse>;
  readonly listReviewRequestTargets: (
    query: ReviewRequestTargetListQuery
  ) => Promise<ReviewRequestTargetListResponse>;
  readonly listModerationQueue: (
    query: ReviewModerationQueueQuery
  ) => Promise<ReviewModerationQueueResponse>;
  readonly getClientReviewDetail: (input: {
    readonly clientUserId: string;
    readonly reviewableInstanceId: string;
  }) => Promise<ClientReviewDetail | null>;
  readonly getAdminReviewDetail: (input: {
    readonly reviewId: string;
  }) => Promise<ReviewAdminDetail | null>;
  readonly getModerationCaseDetail: (input: {
    readonly caseId: string;
    readonly actorUserId: string;
    readonly actorRole: ReviewModerationCaseActorRole;
  }) => Promise<ReviewModerationCaseDetail | null>;
};
