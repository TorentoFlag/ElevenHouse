import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { AstroDiaryService } from "./astro-diary.service";

@Controller("astro-diary")
@UseGuards(AstrologerSessionAuthGuard)
export class AstroDiaryController {
  constructor(private readonly service: AstroDiaryService) {}

  @Get("journals")
  listJournals(@Req() request: AstrologerSessionRequest) {
    return this.service.listJournals(request);
  }

  @Get("journals/:journalId/timeline")
  getTimeline(
    @Req() request: AstrologerSessionRequest,
    @Param("journalId") journalId: string,
    @Query() query: unknown
  ) {
    return this.service.getTimeline(request, journalId, query);
  }
}
