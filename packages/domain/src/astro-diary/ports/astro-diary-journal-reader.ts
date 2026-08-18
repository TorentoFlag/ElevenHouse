import type {
  AstroDiaryJournalListResponse,
  AstroDiaryJournalSummaryResponse,
  AstroDiaryTimelinePage
} from "@elevenhouse/contracts";

export type AstroDiaryParticipantIdentity = Readonly<{
  participantUserId: string;
  participantRole: "client" | "astrologer";
}>;

export type AstroDiaryJournalReaderListInput = Readonly<{
  astrologerUserId: string;
  limit: number;
  now: string;
}>;

export type AstroDiaryTimelineReaderInput = Readonly<{
  astrologerUserId: string;
  journalId: string;
  afterCursor: number;
  limit: number;
}>;

export type AstroDiaryParticipantJournalListInput = AstroDiaryParticipantIdentity &
  Readonly<{
    limit: number;
    now: string;
  }>;

export type AstroDiaryParticipantJournalInput = AstroDiaryParticipantIdentity &
  Readonly<{
    journalId: string;
    now: string;
  }>;

export type AstroDiaryParticipantTimelineInput = AstroDiaryParticipantIdentity &
  Readonly<{
    journalId: string;
    afterCursor: number;
    limit: number;
  }>;

export type AstroDiaryPaidCoreCommandContext = Readonly<{
  journalVersion: number;
  activePeriod: Readonly<{ id: string; allowanceVersion: number }> | null;
  latestPeriod: Readonly<{ id: string; allowanceVersion: number }> | null;
  currentCycle: Readonly<{ id: string; version: number }> | null;
  currentObligation: Readonly<{ id: string; version: number }> | null;
  latestCycle: Readonly<{ id: string; version: number }> | null;
  latestObligation: Readonly<{ id: string; version: number }> | null;
}>;

export type AstroDiaryJournalReader = Readonly<{
  listAstrologerJournals(
    input: AstroDiaryJournalReaderListInput
  ): Promise<AstroDiaryJournalListResponse>;
  getJournalTimeline(input: AstroDiaryTimelineReaderInput): Promise<AstroDiaryTimelinePage | null>;
  listParticipantJournals(
    input: AstroDiaryParticipantJournalListInput
  ): Promise<AstroDiaryJournalListResponse>;
  getParticipantJournalSummary(
    input: AstroDiaryParticipantJournalInput
  ): Promise<AstroDiaryJournalSummaryResponse | null>;
  getParticipantJournalTimeline(
    input: AstroDiaryParticipantTimelineInput
  ): Promise<AstroDiaryTimelinePage | null>;
  getPaidCoreCommandContext(
    input: AstroDiaryParticipantJournalInput
  ): Promise<AstroDiaryPaidCoreCommandContext | null>;
}>;
