import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { HumanDesignService } from "./human-design.service";

@Controller("human-design")
@UseGuards(AstrologerSessionAuthGuard)
export class HumanDesignController {
  constructor(private readonly humanDesignService: HumanDesignService) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  preview(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.humanDesignService.preview(body, request);
  }

  @Post("calculations")
  @RequireCsrf()
  createCalculation(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.humanDesignService.createCalculation(body, request);
  }

  @Post("calculations/:calculationId/recalculate")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  recalculate(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.humanDesignService.recalculate(calculationId, body, request);
  }

  @Get("calculations/:calculationId/transits")
  transits(
    @Param("calculationId") calculationId: string,
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.humanDesignService.transits(calculationId, query, request);
  }

  @Post("calculations/:calculationId/ai-draft")
  @HttpCode(HttpStatus.OK)
  @RequireCsrf()
  createAiDraft(
    @Param("calculationId") calculationId: string,
    @Body() body: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.humanDesignService.createAiDraft(calculationId, body, request);
  }
}
