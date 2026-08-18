import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type {
  AstroDiaryCommandResponse,
  AstroDiaryDraftMutationResponse,
  AstroDiaryJournalListResponse,
  AstroDiaryJournalSummaryResponse,
  AstroDiaryTimelinePage
} from "@elevenhouse/contracts";

import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { PublicSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { ClientAstroDiaryService } from "./astro-diary.service";

type HeaderResponse = { setHeader(name: string, value: string): void };

@Controller("astro-diary")
@UseGuards(PublicSessionAuthGuard)
export class ClientAstroDiaryController {
  constructor(private readonly service: ClientAstroDiaryService) {}

  @Get("journals")
  listJournals(@Req() request: PublicSessionRequest): Promise<AstroDiaryJournalListResponse> {
    return this.service.listJournals(requireClientUserId(request));
  }

  @Get("journals/:journalId")
  getJournal(
    @Req() request: PublicSessionRequest,
    @Param("journalId") journalId: string
  ): Promise<AstroDiaryJournalSummaryResponse> {
    return this.service.getJournal(requireClientUserId(request), journalId);
  }

  @Get("journals/:journalId/timeline")
  getTimeline(
    @Req() request: PublicSessionRequest,
    @Param("journalId") journalId: string,
    @Query() query: unknown
  ): Promise<AstroDiaryTimelinePage> {
    return this.service.getTimeline(requireClientUserId(request), journalId, query);
  }

  @Post("journals/:journalId/client-entry/drafts")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astro-diary.client-entry-draft.create" })
  createDraft(
    @Req() request: PublicSessionRequest,
    @Param("journalId") journalId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse
  ): Promise<AstroDiaryDraftMutationResponse> {
    const key = requireIdempotencyKey(idempotencyKey);
    response.setHeader("Idempotency-Key", key);
    return this.service.createClientEntryDraft(requireClientUserId(request), journalId, body, key);
  }

  @Put("journals/:journalId/client-entry/drafts/:draftId")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astro-diary.client-entry-draft.update" })
  updateDraft(
    @Req() request: PublicSessionRequest,
    @Param("journalId") journalId: string,
    @Param("draftId") draftId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse
  ): Promise<AstroDiaryDraftMutationResponse> {
    const key = requireIdempotencyKey(idempotencyKey);
    response.setHeader("Idempotency-Key", key);
    return this.service.updateClientEntryDraft(
      requireClientUserId(request),
      journalId,
      draftId,
      body,
      key
    );
  }

  @Post("journals/:journalId/client-entry/drafts/:draftId/publish")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astro-diary.client-entry.publish" })
  publish(
    @Req() request: PublicSessionRequest,
    @Param("journalId") journalId: string,
    @Param("draftId") draftId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse
  ): Promise<AstroDiaryCommandResponse> {
    const key = requireIdempotencyKey(idempotencyKey);
    response.setHeader("Idempotency-Key", key);
    return this.service.publishClientEntry(
      requireClientUserId(request),
      journalId,
      draftId,
      body,
      key
    );
  }
}

function requireClientUserId(request: PublicSessionRequest): string {
  const account = request.currentCustomerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid public session is required");
  if (!account.roles.includes("client")) {
    throw new ForbiddenException({
      statusCode: 403,
      error: "client_role_required",
      code: "client_role_required",
      message: "Client role is required"
    });
  }
  return account.id;
}

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException("Valid Idempotency-Key header is required");
  return normalized;
}
