import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { SessionsService } from "./sessions.service";

@Controller("sessions")
@UseGuards(PublicSessionAuthGuard)
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly service: SessionsService) {}

  @Get()
  list(@Query() query: unknown, @Req() request: PublicSessionRequest) {
    return this.service.list(requireUserId(request), query, new Date());
  }

  @Get(":sessionId")
  get(@Param("sessionId") sessionId: string, @Req() request: PublicSessionRequest) {
    return this.service.get(sessionId, requireUserId(request), new Date());
  }

  @Post(":sessionId/join")
  @RequireCsrf()
  join(@Param("sessionId") sessionId: string, @Req() request: PublicSessionRequest) {
    return this.service.join(sessionId, requireUserId(request), new Date());
  }

  @Get(":sessionId/messages")
  messages(
    @Param("sessionId") sessionId: string,
    @Query() query: unknown,
    @Req() request: PublicSessionRequest
  ) {
    return this.service.listMessages(sessionId, requireUserId(request), query);
  }

  @Post(":sessionId/messages")
  @RequireCsrf()
  send(
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: PublicSessionRequest
  ) {
    return this.service.sendMessage(sessionId, requireUserId(request), body, new Date());
  }

  @Get(":sessionId/events")
  events(
    @Param("sessionId") sessionId: string,
    @Query() query: unknown,
    @Req() request: PublicSessionRequest
  ) {
    return this.service.listEvents(sessionId, requireUserId(request), query);
  }
}

function requireUserId(request: PublicSessionRequest): string {
  const account = request.currentCustomerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid client session is required");
  if (!account.roles.includes("client")) throw new ForbiddenException("Client role is required");
  return account.id;
}
