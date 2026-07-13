import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { NumerologyService } from "./numerology.service";

@Controller("numerology")
@UseGuards(AstrologerSessionAuthGuard)
export class NumerologyController {
  constructor(private readonly numerologyService: NumerologyService) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  preview(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.numerologyService.preview(body, request);
  }

  @Post("calculations")
  @RequireCsrf()
  createCalculation(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.numerologyService.createCalculation(body, request);
  }

  @Post("calculations/:calculationId/recalculate")
  @RequireCsrf()
  recalculate(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.numerologyService.recalculate(calculationId, body, request);
  }

  @Post("calculations/:calculationId/ai-draft")
  @RequireCsrf()
  createAiDraft(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.numerologyService.createAiDraft(calculationId, body, request);
  }
}
