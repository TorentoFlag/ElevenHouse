import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FlowApprovalsService } from "./flow-approvals.service";
import { FlowsService } from "./flows.service";

@Controller("flow-approvals")
@UseGuards(AstrologerSessionAuthGuard)
export class FlowApprovalsController {
  constructor(
    private readonly service: FlowsService,
    private readonly approvalsService: FlowApprovalsService
  ) {}

  @Get()
  listFlowApprovals(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.listFlowApprovals(query, request);
  }

  @Post(":approvalId/decision")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.approvals.decide.v1" })
  decideFlowApproval(
    @Param("approvalId") approvalId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.approvalsService.decide(approvalId, body, idempotencyKey, request);
  }
}
