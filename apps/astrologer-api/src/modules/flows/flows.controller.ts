import {
  Body,
  Controller,
  Get,
  Headers,
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
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FlowsService } from "./flows.service";

@Controller("flow-templates")
@UseGuards(AstrologerSessionAuthGuard)
export class FlowTemplatesController {
  constructor(private readonly service: FlowsService) {}

  @Get()
  listFlowTemplates(@Query() query: unknown) {
    return this.service.listFlowTemplates(query);
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
  @RequireIdempotency({ scope: "flows.definition.create.v2" })
  createFlow(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.createFlow(body, idempotencyKey, request);
  }

  @Get(":flowId")
  getFlow(@Param("flowId") flowId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.getFlow(flowId, request);
  }

  @Post(":flowId/validate")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  validateFlowDefinition(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.validateFlowDefinition(flowId, body, request);
  }

  @Patch(":flowId/draft")
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.definition.update-draft.v2" })
  updateFlowDraft(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.updateFlowDraft(flowId, body, idempotencyKey, request);
  }

  @Post(":flowId/publish")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.definition.publish.v2" })
  publishFlow(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.publishFlow(flowId, body, idempotencyKey, request);
  }

  @Post(":flowId/next-draft")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.definition.create-next-draft.v2" })
  createNextFlowDraft(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.createNextFlowDraft(flowId, body, idempotencyKey, request);
  }

  @Post(":flowId/migrations/v2")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.definition.migrate.v2" })
  migrateFlowDefinition(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.migrateFlowDefinition(flowId, body, idempotencyKey, request);
  }

  @Post(":flowId/activate")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  activateFlow(@Param("flowId") flowId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.activateFlow(flowId, request);
  }

  @Post(":flowId/pause")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  pauseFlow(@Param("flowId") flowId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.pauseFlow(flowId, request);
  }

  @Post(":flowId/simulate")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  simulateFlow(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.simulateFlow(flowId, body, request);
  }

  @Post(":flowId/manual-runs")
  @RequireCsrf()
  createManualRun(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.createManualRun(flowId, body, request);
  }

  @Get(":flowId/runs")
  listFlowRuns(
    @Param("flowId") flowId: string,
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.listFlowRuns(flowId, query, request);
  }
}
