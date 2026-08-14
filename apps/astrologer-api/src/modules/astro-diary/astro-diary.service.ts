import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  astroDiaryJournalListResponseSchema,
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
}
