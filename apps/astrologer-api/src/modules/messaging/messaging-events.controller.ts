import { Controller, Headers, Req, Sse, UseGuards, type MessageEvent } from "@nestjs/common";
import type { Observable } from "rxjs";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { MessagingService } from "./messaging.service";

@Controller("messaging")
@UseGuards(AstrologerSessionAuthGuard)
export class MessagingEventsController {
  constructor(private readonly service: MessagingService) {}

  @Sse("events")
  streamEvents(
    @Headers("last-event-id") lastEventId: string | undefined,
    @Req() request: AstrologerSessionRequest
  ): Observable<MessageEvent> {
    return this.service.streamRealtimeEvents(lastEventId, request);
  }
}
