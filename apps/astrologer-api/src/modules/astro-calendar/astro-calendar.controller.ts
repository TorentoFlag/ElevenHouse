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
import { AstroCalendarService } from "./astro-calendar.service";

@Controller("astro-calendar")
@UseGuards(AstrologerSessionAuthGuard)
export class AstroCalendarController {
  constructor(private readonly service: AstroCalendarService) {}

  @Get("range")
  getRange(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.getRange(query, request);
  }

  @Post("generations")
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCsrf()
  createGeneration(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.createGeneration(body, request);
  }

  @Post("generations/:generationId/retry")
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCsrf()
  retryGeneration(
    @Param("generationId") generationId: string,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.retryGeneration(generationId, request);
  }
}
