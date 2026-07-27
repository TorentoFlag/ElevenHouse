import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { FlowsService } from "./flows.service";

@Controller("flow-templates")
@UseGuards(AstrologerSessionAuthGuard)
export class FlowTemplatesController {
  constructor(private readonly service: FlowsService) {}

  @Get()
  listFlowTemplates() {
    return this.service.listFlowTemplates();
  }
}

@Controller("flows")
@UseGuards(AstrologerSessionAuthGuard)
export class FlowsController {
  constructor(private readonly service: FlowsService) {}

  @Get()
  listFlows(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.listFlows(query, request);
  }

  @Post()
  @RequireCsrf()
  createFlow(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.createFlow(body, request);
  }

  @Get(":flowId")
  getFlow(@Param("flowId") flowId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.getFlow(flowId, request);
  }

  @Patch(":flowId/draft")
  @RequireCsrf()
  updateFlowDraft(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.updateFlowDraft(flowId, body, request);
  }

  @Post(":flowId/publish")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  publishFlow(@Param("flowId") flowId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.publishFlow(flowId, request);
  }
}
