import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { MessagingService } from "./messaging.service";

@Controller("messaging")
@UseGuards(AstrologerSessionAuthGuard)
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Get("channel-connections")
  listChannelConnections(@Req() request: AstrologerSessionRequest) {
    return this.service.listChannelConnections(request);
  }

  @Post("channel-connections/telegram/business/start")
  @RequireCsrf()
  startTelegramBusinessConnection(@Req() request: AstrologerSessionRequest) {
    return this.service.startTelegramBusinessConnection(request);
  }

  @Get("threads")
  listThreads(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.listThreads(query, request);
  }

  @Get("threads/:threadId")
  getThread(
    @Param("threadId") threadId: string,
    @Query() query: unknown,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.getThread(threadId, query, request);
  }

  @Post("threads/:threadId/messages")
  @RequireIdempotency({ scope: "messaging.messages.send" })
  @RequireCsrf()
  sendMessage(
    @Param("threadId") threadId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.sendMessage(threadId, body, idempotencyKey, request);
  }

  @Post("threads/:threadId/link-client")
  @RequireIdempotency({ scope: "messaging.threads.link-client" })
  @RequireCsrf()
  linkClient(
    @Param("threadId") threadId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.linkClient(threadId, body, idempotencyKey, request);
  }

  @Post("threads/:threadId/create-client")
  @RequireIdempotency({ scope: "messaging.threads.create-client" })
  @RequireCsrf()
  createClient(
    @Param("threadId") threadId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AstrologerSessionRequest
  ) {
    return this.service.createClient(threadId, body, idempotencyKey, request);
  }

  @Post("threads/:threadId/read")
  @RequireCsrf()
  markRead(@Param("threadId") threadId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.markRead(threadId, request);
  }
}
