import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { AvailabilityService } from "./availability.service";

@Controller("availability/schedules")
@UseGuards(AstrologerSessionAuthGuard)
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  @Get("default")
  getDefault(@Req() request: AstrologerSessionRequest) {
    return this.service.getDefaultSchedule(request);
  }

  @Put("default")
  @RequireCsrf()
  putDefault(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.putDefaultSchedule(body, request);
  }
}
