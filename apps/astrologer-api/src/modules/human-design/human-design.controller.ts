import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
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
}
