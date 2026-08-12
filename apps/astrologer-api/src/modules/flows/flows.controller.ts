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
import { PlatformTariffCapabilityGuard } from "../platform-entitlements/platform-tariff-capability.guard";
import { RequirePlatformTariffCapability } from "../platform-entitlements/platform-tariff-capability.policy";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FlowsService } from "./flows.service";

@Controller("flow-templates")
@UseGuards(AstrologerSessionAuthGuard, PlatformTariffCapabilityGuard)
export class FlowTemplatesController {
  constructor(private readonly service: FlowsService) {}

  @Get()
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.templates.read",
    capability: "funnels",
    operation: "read"
  })
  listFlowTemplates(@Query() query: unknown) {
    return this.service.listFlowTemplates(query);
  }
}

@Controller("flows")
@UseGuards(AstrologerSessionAuthGuard, PlatformTariffCapabilityGuard)
export class FlowsController {
  constructor(private readonly service: FlowsService) {}

  @Get()
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.list",
    capability: "funnels",
    operation: "read"
  })
  listFlows(
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.listFlows(query, request);
  }

  @Post()
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.create",
    capability: "funnels",
    operation: "mutation"
  })
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
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.read",
    capability: "funnels",
    operation: "read"
  })
  getFlow(
    @Param("flowId") flowId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.getFlow(flowId, request);
  }

  @Post(":flowId/validate")
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.validate",
    capability: "funnels",
    operation: "mutation"
  })
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
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.draft.update",
    capability: "funnels",
    operation: "mutation"
  })
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
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.publish",
    capability: "funnels",
    operation: "mutation"
  })
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
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.next-draft.create",
    capability: "funnels",
    operation: "mutation"
  })
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

  @Post(":flowId/archive")
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.archive",
    capability: "funnels",
    operation: "mutation"
  })
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  archiveFlow(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.archiveFlow(flowId, body, request);
  }

  @Post(":flowId/restore")
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.restore",
    capability: "funnels",
    operation: "mutation"
  })
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  restoreFlow(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.restoreFlow(flowId, body, request);
  }

  @Post(":flowId/duplicate")
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.duplicate",
    capability: "funnels",
    operation: "mutation"
  })
  @HttpCode(HttpStatus.CREATED)
  @RequireCsrf()
  duplicateFlow(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.duplicateFlow(flowId, body, request);
  }

  @Post(":flowId/delete")
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.delete",
    capability: "funnels",
    operation: "mutation"
  })
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  deleteFlow(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.deleteFlow(flowId, body, request);
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
