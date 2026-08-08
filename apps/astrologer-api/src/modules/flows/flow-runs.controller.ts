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
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { FlowsService } from "./flows.service";

@Controller("flow-runs")
@UseGuards(AstrologerSessionAuthGuard)
export class FlowRunsController {
  constructor(private readonly service: FlowsService) {}

  @Get(":runId")
  @Header("Cache-Control", "no-store")
  getFlowRun(@Param("runId") runId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.getFlowRun(runId, request);
  }

  @Post(":runId/cancel")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  @RequireIdempotency({ scope: "flows.runtime.cancel.v1" })
  cancelFlowRun(
    @Param("runId") runId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.cancelFlowRun(runId, idempotencyKey, body, request);
  }
}
