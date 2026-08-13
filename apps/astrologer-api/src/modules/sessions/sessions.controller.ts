import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { SessionsService } from "./sessions.service";

@Controller("sessions")
@UseGuards(AstrologerSessionAuthGuard)
export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  @Get()
  list(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.list(requireUserId(request), query, new Date());
  }

  @Get(":sessionId")
  get(@Param("sessionId") sessionId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.get(sessionId, requireUserId(request), new Date());
  }

  @Post(":sessionId/join")
  @RequireCsrf()
  join(@Param("sessionId") sessionId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.join(sessionId, requireUserId(request), new Date());
  }

  @Get(":sessionId/messages")
  messages(@Param("sessionId") sessionId: string, @Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.listMessages(sessionId, requireUserId(request), query);
  }

  @Post(":sessionId/messages")
  @RequireCsrf()
  send(@Param("sessionId") sessionId: string, @Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.sendMessage(sessionId, requireUserId(request), body, new Date());
  }

  @Get(":sessionId/events")
  events(@Param("sessionId") sessionId: string, @Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.listEvents(sessionId, requireUserId(request), query);
  }

  @Post(":sessionId/end")
  @RequireCsrf()
  end(@Param("sessionId") sessionId: string, @Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.end(sessionId, requireUserId(request), body, new Date());
  }
}

@Controller("session-provider/livekit")
export class SessionsWebhookController {
  constructor(private readonly service: SessionsService) {}

  @Post("webhook")
  webhook(
    @Headers("authorization") authorization: string | undefined,
    @Req() request: { readonly rawBody?: Buffer }
  ) {
    return this.service.applyLiveKitWebhook(authorization, request.rawBody);
  }
}

function requireUserId(request: AstrologerSessionRequest): string {
  const id = request.currentAstrologerAccount?.account.id;
  if (!id) throw new Error("Authenticated astrologer account is missing");
  return id;
}
