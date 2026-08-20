import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { ReviewPublicListResponse } from "@elevenhouse/contracts";

import { PublicReviewsService } from "./reviews.service";

@Controller("reviews")
export class PublicReviewsController {
  constructor(@Inject(PublicReviewsService) private readonly service: PublicReviewsService) {}

  @Get()
  listPublicReviews(@Query() query: unknown): Promise<ReviewPublicListResponse> {
    return this.service.listPublicReviews(query);
  }
}
