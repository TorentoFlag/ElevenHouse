import {
  astroDiaryAstrologerReplyDraftCreateRequestSchema,
  astroDiaryAstrologerReplyDraftUpdateRequestSchema,
  astroDiaryCommandResponseSchema,
  astroDiaryDraftMutationResponseSchema,
  astroDiaryJournalListResponseSchema,
  astroDiaryJournalSummaryResponseSchema,
  astroDiaryPaidCoreDraftPublishRequestSchema,
  astroDiaryTimelinePageSchema,
  type AstroDiaryAstrologerReplyDraftCreateRequest,
  type AstroDiaryAstrologerReplyDraftUpdateRequest,
  type AstroDiaryCommandResponse,
  type AstroDiaryDraftMutationResponse,
  type AstroDiaryJournalSummaryResponse,
  type AstroDiaryPaidCoreDraftPublishRequest,
  type AstroDiaryTimelinePage,
  type AstroDiaryJournalListResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listAstroDiaryJournals(): Promise<AstroDiaryJournalListResponse> {
  return astroDiaryJournalListResponseSchema.parse(
    await application.http.get("/astro-diary/journals")
  );
}

export async function getAstroDiaryJournal(
  journalId: string
): Promise<AstroDiaryJournalSummaryResponse> {
  return astroDiaryJournalSummaryResponseSchema.parse(
    await application.http.get(`/astro-diary/journals/${encodeURIComponent(journalId)}`)
  );
}

export type GetAstroDiaryTimelineInput = Readonly<{
  journalId: string;
  afterCursor: number;
  limit: number;
}>;

export async function getAstroDiaryTimeline(
  input: GetAstroDiaryTimelineInput
): Promise<AstroDiaryTimelinePage> {
  const searchParams = new URLSearchParams({
    afterCursor: String(input.afterCursor),
    limit: String(input.limit)
  });

  return astroDiaryTimelinePageSchema.parse(
    await application.http.get(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/timeline?${searchParams.toString()}`
    )
  );
}

type AstroDiaryMutationInput<TBody> = Readonly<{
  journalId: string;
  idempotencyKey: string;
  body: TBody;
}>;

export async function createAstroDiaryReplyDraft(
  input: AstroDiaryMutationInput<AstroDiaryAstrologerReplyDraftCreateRequest>
): Promise<AstroDiaryDraftMutationResponse> {
  const body = astroDiaryAstrologerReplyDraftCreateRequestSchema.parse(input.body);
  return astroDiaryDraftMutationResponseSchema.parse(
    await application.http.post(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/astrologer-reply/drafts`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

export async function updateAstroDiaryReplyDraft(
  input: AstroDiaryMutationInput<AstroDiaryAstrologerReplyDraftUpdateRequest> & {
    readonly draftId: string;
  }
): Promise<AstroDiaryDraftMutationResponse> {
  const body = astroDiaryAstrologerReplyDraftUpdateRequestSchema.parse(input.body);
  return astroDiaryDraftMutationResponseSchema.parse(
    await application.http.put(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/astrologer-reply/drafts/${encodeURIComponent(input.draftId)}`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

export async function publishAstroDiaryReplyDraft(
  input: AstroDiaryMutationInput<AstroDiaryPaidCoreDraftPublishRequest> & {
    readonly draftId: string;
  }
): Promise<AstroDiaryCommandResponse> {
  const body = astroDiaryPaidCoreDraftPublishRequestSchema.parse(input.body);
  return astroDiaryCommandResponseSchema.parse(
    await application.http.post(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/astrologer-reply/drafts/${encodeURIComponent(input.draftId)}/publish`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

function commandRequestOptions(idempotencyKey: string) {
  return {
    csrf: true,
    headers: { "idempotency-key": idempotencyKey }
  } as const;
}
