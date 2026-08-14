import { Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  astroDiaryJournalListResponseSchema,
  astroDiaryTimelinePageSchema,
  astroDiaryTimelineQuerySchema,
  type AstroDiaryJournalListResponse
} from "@elevenhouse/contracts";
import type { AstroDiaryJournalReader } from "@elevenhouse/domain";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ASTRO_DIARY_JOURNAL_READER } from "./astro-diary.tokens";

@Injectable()
export class AstroDiaryService {
  constructor(
    @Inject(ASTRO_DIARY_JOURNAL_READER) private readonly reader: AstroDiaryJournalReader,
    private readonly clock: SystemClock
  ) {}

  async listJournals(
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">
  ): Promise<AstroDiaryJournalListResponse> {
    const astrologerUserId = request.currentAstrologerAccount?.account.id;
    if (!astrologerUserId) {
      throw new UnauthorizedException("Valid astrologer session is required");
    }

    const result = await this.reader.listAstrologerJournals({
      astrologerUserId,
      limit: 100,
      now: this.clock.now().toISOString()
    });

    return astroDiaryJournalListResponseSchema.parse(result);
  }

  async getTimeline(
    request: Pick<AstrologerSessionRequest, "currentAstrologerAccount">,
    journalId: string,
    query: unknown
  ) {
    const astrologerUserId = request.currentAstrologerAccount?.account.id;
    if (!astrologerUserId) {
      throw new UnauthorizedException("Valid astrologer session is required");
    }

    const parsedQuery = astroDiaryTimelineQuerySchema.parse(query);
    const result = await this.reader.getJournalTimeline({
      astrologerUserId,
      journalId,
      afterCursor: parsedQuery.afterCursor,
      limit: parsedQuery.limit
    });
    if (!result) {
      throw new NotFoundException("AstroDiary journal was not found");
    }

    return astroDiaryTimelinePageSchema.parse(result);
  }
}
