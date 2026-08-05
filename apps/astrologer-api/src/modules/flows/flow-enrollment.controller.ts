import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";

import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PlatformTariffCapabilityGuard } from "../platform-entitlements/platform-tariff-capability.guard";
import { RequirePlatformTariffCapability } from "../platform-entitlements/platform-tariff-capability.policy";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FlowEnrollmentService } from "./flow-enrollment.service";

@Controller("flows")
@UseGuards(AstrologerSessionAuthGuard, PlatformTariffCapabilityGuard)
export class FlowEnrollmentController {
  constructor(private readonly service: FlowEnrollmentService) {}

  @Get(":flowId/enrollment")
  @Header("Cache-Control", "no-store")
  getFlowEnrollment(@Param("flowId") flowId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.getFlowEnrollment(flowId, request);
  }

  @Post(":flowId/activate")
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.activate",
    capability: "funnels",
    operation: "mutation"
  })
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.enrollment.activate.v1" })
  activateFlowVersion(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.activateFlowVersion(flowId, body, idempotencyKey, request);
  }

  @Post(":flowId/pause-enrollment")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.enrollment.pause.v1" })
  pauseFlowEnrollment(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.pauseFlowEnrollment(flowId, body, idempotencyKey, request);
  }
}
