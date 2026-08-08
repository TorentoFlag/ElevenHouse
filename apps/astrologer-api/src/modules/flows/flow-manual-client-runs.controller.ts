import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { PlatformTariffCapabilityGuard } from "../platform-entitlements/platform-tariff-capability.guard";
import { RequirePlatformTariffCapability } from "../platform-entitlements/platform-tariff-capability.policy";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FlowManualClientRunsService } from "./flow-manual-client-runs.service";

@Controller("flows")
@UseGuards(AstrologerSessionAuthGuard, PlatformTariffCapabilityGuard)
export class FlowManualClientRunsController {
  constructor(private readonly service: FlowManualClientRunsService) {}

  @Post(":flowId/manual-runs")
  @HttpCode(HttpStatus.OK)
  @RequirePlatformTariffCapability({
    surfaceId: "funnels.manual-client-run.create",
    capability: "funnels",
    operation: "mutation"
  })
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.manual-client-run.create.v1" })
  createManualClientRun(
    @Param("flowId") flowId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.create(flowId, body, idempotencyKey, request);
  }
}
