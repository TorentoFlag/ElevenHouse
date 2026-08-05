import { Controller, Get, Header, Param, Query, Req, UseGuards } from "@nestjs/common";

import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { FlowActivationReviewService } from "./flow-activation-review.service";

@Controller("flows")
@UseGuards(AstrologerSessionAuthGuard)
export class FlowActivationReviewController {
  constructor(private readonly service: FlowActivationReviewService) {}

  @Get(":flowId/activation-review")
  @Header("Cache-Control", "no-store")
  review(
    @Param("flowId") flowId: string,
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.review(flowId, query, request);
  }
}
