import {
  reviewAdminDetailSchema,
  reviewModerationCaseDetailSchema,
  reviewModerationCaseMessageCreateSchema,
  reviewModerationCaseMessageSchema,
  reviewModerationCaseStatusUpdateSchema,
  reviewModerationDecisionSchema,
  reviewModerationQueueResponseSchema,
  reviewRatingAggregateReconciliationResponseSchema,
  type ReviewAdminDetail,
  type ReviewModerationCaseDetail,
  type ReviewModerationCaseMessage,
  type ReviewModerationCaseMessageCreate,
  type ReviewModerationCaseStatusUpdate,
  type ReviewModerationDecision,
  type ReviewModerationQueueResponse,
  type ReviewRatingAggregateReconciliationResponse
} from "@elevenhouse/contracts";

export type AdminReviewsApi = {
  readonly listModerationQueue: (input?: {
    readonly limit?: number;
    readonly cursor?: string | null;
  }) => Promise<ReviewModerationQueueResponse>;
  readonly getReviewDetail: (reviewId: string) => Promise<ReviewAdminDetail>;
  readonly getModerationCaseDetail: (caseId: string) => Promise<ReviewModerationCaseDetail>;
  readonly approveReviewVersion: (
    reviewId: string,
    versionId: string,
    idempotencyKey: string
  ) => Promise<ReviewAdminDetail>;
  readonly rejectReviewVersion: (
    reviewId: string,
    versionId: string,
    request: ReviewModerationDecision,
    idempotencyKey: string
  ) => Promise<ReviewAdminDetail>;
  readonly approveReviewReplyVersion: (
    reviewId: string,
    replyVersionId: string,
    idempotencyKey: string
  ) => Promise<ReviewAdminDetail>;
  readonly rejectReviewReplyVersion: (
    reviewId: string,
    replyVersionId: string,
    request: ReviewModerationDecision,
    idempotencyKey: string
  ) => Promise<ReviewAdminDetail>;
  readonly restoreReviewAfterDispute: (
    reviewId: string,
    caseId: string,
    idempotencyKey: string
  ) => Promise<ReviewAdminDetail>;
  readonly hideReviewByModeration: (
    reviewId: string,
    caseId: string | null,
    request: ReviewModerationDecision,
    idempotencyKey: string
  ) => Promise<ReviewAdminDetail>;
  readonly reconcileRatingAggregatesForReview: (
    reviewId: string,
    idempotencyKey: string
  ) => Promise<ReviewRatingAggregateReconciliationResponse>;
  readonly createModerationCaseMessage: (
    caseId: string,
    request: ReviewModerationCaseMessageCreate,
    idempotencyKey: string
  ) => Promise<ReviewModerationCaseMessage>;
  readonly updateModerationCaseStatus: (
    caseId: string,
    request: ReviewModerationCaseStatusUpdate,
    idempotencyKey: string
  ) => Promise<ReviewModerationCaseDetail>;
};

export type CreateAdminReviewsApiInput = {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly csrfTokenReader?: () => string | null;
};

export function createAdminReviewsApi(input: CreateAdminReviewsApiInput = {}): AdminReviewsApi {
  const fetcher = input.fetcher ?? fetch;
  const baseUrl = input.baseUrl ?? import.meta.env.VITE_ADMIN_API_BASE_URL ?? "";
  const csrfTokenReader = input.csrfTokenReader ?? readAdminCsrfCookie;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...csrfHeaders(init.method, csrfTokenReader),
        ...init.headers
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new AdminReviewsApiError(response.status, body);
    return body;
  }

  return {
    listModerationQueue: async (input = {}) =>
      reviewModerationQueueResponseSchema.parse(
        await request(`/admin/reviews/moderation-queue${searchParams(input)}`)
      ),
    getReviewDetail: async (reviewId) =>
      reviewAdminDetailSchema.parse(
        await request(`/admin/reviews/${encodeURIComponent(reviewId)}`)
      ),
    getModerationCaseDetail: async (caseId) =>
      reviewModerationCaseDetailSchema.parse(
        await request(`/admin/reviews/moderation-cases/${encodeURIComponent(caseId)}`)
      ),
    approveReviewVersion: async (reviewId, versionId, idempotencyKey) =>
      reviewAdminDetailSchema.parse(
        await request(
          `/admin/reviews/${encodeURIComponent(reviewId)}/versions/${encodeURIComponent(versionId)}/approve`,
          { method: "POST", headers: idempotencyHeaders(idempotencyKey) }
        )
      ),
    rejectReviewVersion: async (reviewId, versionId, rawRequest, idempotencyKey) => {
      const parsed = reviewModerationDecisionSchema.parse(rawRequest);
      return reviewAdminDetailSchema.parse(
        await request(
          `/admin/reviews/${encodeURIComponent(reviewId)}/versions/${encodeURIComponent(versionId)}/reject`,
          {
            method: "POST",
            headers: idempotencyHeaders(idempotencyKey),
            body: JSON.stringify(parsed)
          }
        )
      );
    },
    approveReviewReplyVersion: async (reviewId, replyVersionId, idempotencyKey) =>
      reviewAdminDetailSchema.parse(
        await request(
          `/admin/reviews/${encodeURIComponent(reviewId)}/reply-versions/${encodeURIComponent(replyVersionId)}/approve`,
          { method: "POST", headers: idempotencyHeaders(idempotencyKey) }
        )
      ),
    rejectReviewReplyVersion: async (reviewId, replyVersionId, rawRequest, idempotencyKey) => {
      const parsed = reviewModerationDecisionSchema.parse(rawRequest);
      return reviewAdminDetailSchema.parse(
        await request(
          `/admin/reviews/${encodeURIComponent(reviewId)}/reply-versions/${encodeURIComponent(replyVersionId)}/reject`,
          {
            method: "POST",
            headers: idempotencyHeaders(idempotencyKey),
            body: JSON.stringify(parsed)
          }
        )
      );
    },
    restoreReviewAfterDispute: async (reviewId, caseId, idempotencyKey) =>
      reviewAdminDetailSchema.parse(
        await request(
          `/admin/reviews/${encodeURIComponent(reviewId)}/moderation-cases/${encodeURIComponent(caseId)}/restore`,
          { method: "POST", headers: idempotencyHeaders(idempotencyKey) }
        )
      ),
    hideReviewByModeration: async (reviewId, caseId, rawRequest, idempotencyKey) => {
      const parsed = reviewModerationDecisionSchema.parse(rawRequest);
      const caseSegment = caseId ? `/moderation-cases/${encodeURIComponent(caseId)}` : "";
      return reviewAdminDetailSchema.parse(
        await request(`/admin/reviews/${encodeURIComponent(reviewId)}${caseSegment}/hide`, {
          method: "POST",
          headers: idempotencyHeaders(idempotencyKey),
          body: JSON.stringify(parsed)
        })
      );
    },
    reconcileRatingAggregatesForReview: async (reviewId, idempotencyKey) =>
      reviewRatingAggregateReconciliationResponseSchema.parse(
        await request(
          `/admin/reviews/${encodeURIComponent(reviewId)}/rating-aggregates/reconcile`,
          { method: "POST", headers: idempotencyHeaders(idempotencyKey) }
        )
      ),
    createModerationCaseMessage: async (caseId, rawRequest, idempotencyKey) => {
      const parsed = reviewModerationCaseMessageCreateSchema.parse(rawRequest);
      return reviewModerationCaseMessageSchema.parse(
        await request(`/admin/reviews/moderation-cases/${encodeURIComponent(caseId)}/messages`, {
          method: "POST",
          headers: idempotencyHeaders(idempotencyKey),
          body: JSON.stringify(parsed)
        })
      );
    },
    updateModerationCaseStatus: async (caseId, rawRequest, idempotencyKey) => {
      const parsed = reviewModerationCaseStatusUpdateSchema.parse(rawRequest);
      return reviewModerationCaseDetailSchema.parse(
        await request(`/admin/reviews/moderation-cases/${encodeURIComponent(caseId)}/status`, {
          method: "POST",
          headers: idempotencyHeaders(idempotencyKey),
          body: JSON.stringify(parsed)
        })
      );
    }
  };
}

export class AdminReviewsApiError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: unknown
  ) {
    super(`Admin reviews request failed with status ${status}`);
  }
}

function searchParams(input: { readonly limit?: number; readonly cursor?: string | null }): string {
  const params = new URLSearchParams();
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  const value = params.toString();
  return value ? `?${value}` : "";
}

function csrfHeaders(
  method: string | undefined,
  csrfTokenReader: () => string | null
): Record<string, string> {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") return {};
  const csrfToken = csrfTokenReader();
  return csrfToken ? { "x-csrf-token": csrfToken } : {};
}

function idempotencyHeaders(value: string): Record<string, string> {
  const normalized = value.trim();
  if (!normalized) throw new Error("An idempotency key is required for an admin review mutation");
  return { "idempotency-key": normalized };
}

function readAdminCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = "elevenhouse_admin_csrf=";
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}
