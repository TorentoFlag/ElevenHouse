import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { ChartsService } from "./charts.service";

@Controller("charts")
@UseGuards(AstrologerSessionAuthGuard)
export class ChartsController {
  constructor(private readonly service: ChartsService) {}

  @Post("natal/jobs")
  @RequireCsrf()
  createNatalJob(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.createNatalJob(body, request);
  }

  @Post("transits/jobs")
  @RequireCsrf()
  createTransitJob(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.createTransitJob(body, request);
  }

  @Get("jobs/:jobId")
  getJob(@Param("jobId") jobId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.getJob(jobId, request);
  }

  @Get("calculations/:calculationId")
  getCalculation(
    @Param("calculationId") calculationId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.getCalculation(calculationId, request);
  }

  @Post("calculations/:calculationId/recalculate")
  @RequireCsrf()
  recalculate(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.recalculate(calculationId, body, request);
  }
}
