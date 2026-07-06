import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { NumerologyService } from "./numerology.service";

@Controller("numerology/calculations")
@UseGuards(AstrologerSessionAuthGuard)
export class NumerologyController {
  constructor(private readonly numerologyService: NumerologyService) {}

  @Post()
  @RequireCsrf()
  createCalculation(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.numerologyService.createCalculation(body, request);
  }

  @Post(":calculationId/recalculate")
  @RequireCsrf()
  recalculate(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.numerologyService.recalculate(calculationId, body, request);
  }

  @Post(":calculationId/ai-draft")
  @RequireCsrf()
  createAiDraft(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.numerologyService.createAiDraft(calculationId, body, request);
  }
}
