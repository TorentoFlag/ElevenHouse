import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  reviewAdminDetailSchema,
  reviewModerationCaseDetailSchema,
  type ReviewAdminDetail,
  type ReviewModerationCaseDetail
} from "@elevenhouse/contracts";
import type { ReviewReadStore } from "@elevenhouse/domain";

import { ADMIN_REVIEWS_READ_STORE } from "./reviews.tokens";

@Injectable()
export class AdminReviewsService {
  constructor(
    @Inject(ADMIN_REVIEWS_READ_STORE)
    private readonly readStore: Pick<
      ReviewReadStore,
      "getAdminReviewDetail" | "getModerationCaseDetail"
    >
  ) {}

  async getReviewDetail(reviewId: string): Promise<ReviewAdminDetail> {
    const detail = await this.readStore.getAdminReviewDetail({ reviewId: requireUuid(reviewId) });
    if (!detail) throw new NotFoundException("Review was not found");
    return reviewAdminDetailSchema.parse(detail);
  }

  async getModerationCaseDetail(
    adminUserId: string,
    caseId: string
  ): Promise<ReviewModerationCaseDetail> {
    const detail = await this.readStore.getModerationCaseDetail({
      caseId: requireUuid(caseId),
      actorUserId: requireUuid(adminUserId),
      actorRole: "moderator"
    });
    if (!detail) throw new NotFoundException("Review moderation case was not found");
    return reviewModerationCaseDetailSchema.parse(detail);
  }
}

function requireUuid(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value
    )
  ) {
    throw new BadRequestException("Valid UUID is required");
  }
  return value;
}
