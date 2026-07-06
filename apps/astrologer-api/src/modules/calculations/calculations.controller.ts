import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { CalculationsService } from "./calculations.service";

@Controller("calculations")
@UseGuards(AstrologerSessionAuthGuard)
export class CalculationsController {
  constructor(private readonly calculationsService: CalculationsService) {}

  @Get()
  listCalculations(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.calculationsService.listCalculations(query, request);
  }

  @Get(":calculationId")
  getCalculation(
    @Param("calculationId") calculationId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.calculationsService.getCalculation(calculationId, request);
  }

  @Post(":calculationId/link-client")
  @RequireCsrf()
  linkClient(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.calculationsService.linkClient(calculationId, body, request);
  }

  @Post(":calculationId/publish")
  @RequireCsrf()
  publish(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.calculationsService.publish(calculationId, body, request);
  }

  @Post(":calculationId/interpretations")
  @RequireCsrf()
  saveManualInterpretation(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.calculationsService.saveManualInterpretation(calculationId, body, request);
  }

  @Post(":calculationId/interpretations/:interpretationId/approve")
  @RequireCsrf()
  approveInterpretation(
    @Param("calculationId") calculationId: string,
    @Param("interpretationId") interpretationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.calculationsService.approveInterpretation(
      calculationId,
      interpretationId,
      body,
      request
    );
  }

  @Post(":calculationId/archive")
  @RequireCsrf()
  archive(@Param("calculationId") calculationId: string, @Req() request: AstrologerSessionRequest) {
    return this.calculationsService.archive(calculationId, request);
  }
}
