import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { FlowsService } from "./flows.service";

@Controller("flow-approvals")
@UseGuards(AstrologerSessionAuthGuard)
export class FlowApprovalsController {
  constructor(private readonly service: FlowsService) {}

  @Get()
  listFlowApprovals(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.listFlowApprovals(query, request);
  }

  @Post(":approvalId/decision")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  decideFlowApproval(
    @Param("approvalId") approvalId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.decideFlowApproval(approvalId, body, request);
  }
}
