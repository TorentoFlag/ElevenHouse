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
  AstroDiaryAstrologerReplyDraftResponse,
  AstroDiaryCommandResponse,
  AstroDiaryDraftMutationResponse,
  AstroDiaryJournalListResponse,
  AstroDiaryJournalSummaryResponse,
  AstroDiaryTimelinePage,
  AstroDiaryMediaUploadCompletionResponse,
  MediaUploadIntentResponse
} from "@elevenhouse/contracts";

import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf, RequireIdempotency } from "../security/route-policy/route-security-policy";
import { AstroDiaryService } from "./astro-diary.service";

type HeaderResponse = { setHeader(name: string, value: string): void };

@Controller("astro-diary")
@UseGuards(AstrologerSessionAuthGuard)
export class AstroDiaryController {
  constructor(private readonly service: AstroDiaryService) {}

  @Get("journals")
  listJournals(@Req() request: AstrologerSessionRequest): Promise<AstroDiaryJournalListResponse> {
    return this.service.listJournals(requireAstrologerUserId(request));
  }

  @Get("journals/:journalId")
  getJournal(
    @Req() request: AstrologerSessionRequest,
    @Param("journalId") journalId: string
  ): Promise<AstroDiaryJournalSummaryResponse> {
    return this.service.getJournal(requireAstrologerUserId(request), journalId);
  }

  @Get("journals/:journalId/timeline")
  getTimeline(
    @Req() request: AstrologerSessionRequest,
    @Param("journalId") journalId: string,
    @Query() query: unknown
  ): Promise<AstroDiaryTimelinePage> {
    return this.service.getTimeline(requireAstrologerUserId(request), journalId, query);
  }

  @Get("journals/:journalId/astrologer-reply/draft")
  getReplyDraft(
    @Req() request: AstrologerSessionRequest,
    @Param("journalId") journalId: string
  ): Promise<AstroDiaryAstrologerReplyDraftResponse> {
    return this.service.getReplyDraft(requireAstrologerUserId(request), journalId);
  }

  @Post("journals/:journalId/media/upload-intents")
  @RequireCsrf()
  createMediaUploadIntent(
    @Req() request: AstrologerSessionRequest,
    @Param("journalId") journalId: string,
    @Body() body: unknown
  ): Promise<MediaUploadIntentResponse> {
    return this.service.createMediaUploadIntent(requireAstrologerUserId(request), journalId, body);
  }

  @Post("journals/:journalId/media/:mediaId/complete")
  @RequireCsrf()
  completeMediaUpload(
    @Req() request: AstrologerSessionRequest,
    @Param("journalId") journalId: string,
    @Param("mediaId") mediaId: string,
    @Body() body: unknown
  ): Promise<AstroDiaryMediaUploadCompletionResponse> {
    return this.service.completeMediaUpload(
      requireAstrologerUserId(request),
      journalId,
      mediaId,
      body
    );
  }

  @Post("journals/:journalId/astrologer-reply/drafts")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astro-diary.astrologer-reply-draft.create" })
  createReplyDraft(
    @Req() request: AstrologerSessionRequest,
    @Param("journalId") journalId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse
  ): Promise<AstroDiaryDraftMutationResponse> {
    const key = requireIdempotencyKey(idempotencyKey);
    response.setHeader("Idempotency-Key", key);
    return this.service.createReplyDraft(requireAstrologerUserId(request), journalId, body, key);
  }

  @Put("journals/:journalId/astrologer-reply/drafts/:draftId")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astro-diary.astrologer-reply-draft.update" })
  updateReplyDraft(
    @Req() request: AstrologerSessionRequest,
    @Param("journalId") journalId: string,
    @Param("draftId") draftId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse
  ): Promise<AstroDiaryDraftMutationResponse> {
    const key = requireIdempotencyKey(idempotencyKey);
    response.setHeader("Idempotency-Key", key);
    return this.service.updateReplyDraft(
      requireAstrologerUserId(request),
      journalId,
      draftId,
      body,
      key
    );
  }

  @Post("journals/:journalId/astrologer-reply/drafts/:draftId/publish")
  @RequireCsrf()
  @RequireIdempotency({ scope: "astro-diary.astrologer-reply.publish" })
  publishClosingReply(
    @Req() request: AstrologerSessionRequest,
    @Param("journalId") journalId: string,
    @Param("draftId") draftId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: HeaderResponse
  ): Promise<AstroDiaryCommandResponse> {
    const key = requireIdempotencyKey(idempotencyKey);
    response.setHeader("Idempotency-Key", key);
    return this.service.publishClosingReply(
      requireAstrologerUserId(request),
      journalId,
      draftId,
      body,
      key
    );
  }
}

function requireAstrologerUserId(request: AstrologerSessionRequest): string {
  const account = request.currentAstrologerAccount?.account;
  if (!account) throw new UnauthorizedException("Valid astrologer session is required");
  if (!account.roles.includes("astrologer")) {
    throw new ForbiddenException({
      statusCode: 403,
      error: "astrologer_role_required",
      code: "astrologer_role_required",
      message: "Astrologer role is required"
    });
  }
  return account.id;
}

function requireIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException("Valid Idempotency-Key header is required");
  return normalized;
}
