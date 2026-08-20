import { Controller, Get, Inject, Param, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { ReviewAdminDetail, ReviewModerationCaseDetail } from "@elevenhouse/contracts";

import { AdminSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AdminSessionRequest } from "../identity/session/identity-current-session.service";
import { AdminReviewsService } from "./reviews.service";

@Controller("admin/reviews")
@UseGuards(AdminSessionAuthGuard)
export class AdminReviewsController {
  constructor(@Inject(AdminReviewsService) private readonly service: AdminReviewsService) {}

  @Get("moderation-cases/:caseId")
  getModerationCaseDetail(
    @Req() request: AdminSessionRequest,
    @Param("caseId") caseId: string
  ): Promise<ReviewModerationCaseDetail> {
    return this.service.getModerationCaseDetail(requireAdminUserId(request), caseId);
  }

  @Get(":reviewId")
  getReviewDetail(@Param("reviewId") reviewId: string): Promise<ReviewAdminDetail> {
    return this.service.getReviewDetail(reviewId);
  }
}

function requireAdminUserId(request: AdminSessionRequest): string {
  const account = request.currentAdminAccount;
  if (!account) throw new UnauthorizedException("Valid admin session is required");
  return account.id;
}
