import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { CalendarService } from "./calendar.service";

@Controller("calendar")
@UseGuards(AstrologerSessionAuthGuard)
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get("range")
  getRange(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.getRange(query, request);
  }

  @Post("blocks")
  @RequireCsrf()
  createBlock(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.createBlock(body, idempotencyKey, request);
  }

  @Delete("blocks/:blockId")
  @RequireCsrf()
  releaseBlock(@Param("blockId") blockId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.releaseBlock(blockId, request);
  }
}
