import {
  astroDiaryClientEntryDraftCreateRequestSchema,
  astroDiaryClientEntryDraftResponseSchema,
  astroDiaryClientEntryDraftUpdateRequestSchema,
  astroDiaryCommandResponseSchema,
  astroDiaryDraftMutationResponseSchema,
  astroDiaryJournalListResponseSchema,
  astroDiaryJournalSummaryResponseSchema,
  astroDiaryPaidCoreDraftPublishRequestSchema,
  astroDiaryTimelinePageSchema,
  type AstroDiaryClientEntryDraftCreateRequest,
  type AstroDiaryClientEntryDraftResponse,
  type AstroDiaryClientEntryDraftUpdateRequest,
  type AstroDiaryCommandResponse,
  type AstroDiaryDraftMutationResponse,
  type AstroDiaryJournalListResponse,
  type AstroDiaryJournalSummaryResponse,
  type AstroDiaryPaidCoreDraftPublishRequest,
  type AstroDiaryTimelinePage
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listClientAstroDiaryJournals(): Promise<AstroDiaryJournalListResponse> {
  return astroDiaryJournalListResponseSchema.parse(
    await application.http.get("/astro-diary/journals")
  );
}

export async function getClientAstroDiaryJournal(
  journalId: string
): Promise<AstroDiaryJournalSummaryResponse> {
  return astroDiaryJournalSummaryResponseSchema.parse(
    await application.http.get(`/astro-diary/journals/${encodeURIComponent(journalId)}`)
  );
}

export async function getClientAstroDiaryEntryDraft(
  journalId: string
): Promise<AstroDiaryClientEntryDraftResponse> {
  return astroDiaryClientEntryDraftResponseSchema.parse(
    await application.http.get(
      `/astro-diary/journals/${encodeURIComponent(journalId)}/client-entry/draft`
    )
  );
}

export async function getClientAstroDiaryTimeline(input: {
  readonly journalId: string;
  readonly afterCursor: number;
  readonly limit: number;
}): Promise<AstroDiaryTimelinePage> {
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

type MutationInput<TBody> = Readonly<{
  journalId: string;
  idempotencyKey: string;
  body: TBody;
}>;

export async function createClientAstroDiaryEntryDraft(
  input: MutationInput<AstroDiaryClientEntryDraftCreateRequest>
): Promise<AstroDiaryDraftMutationResponse> {
  const body = astroDiaryClientEntryDraftCreateRequestSchema.parse(input.body);
  return astroDiaryDraftMutationResponseSchema.parse(
    await application.http.post(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/client-entry/drafts`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

export async function updateClientAstroDiaryEntryDraft(
  input: MutationInput<AstroDiaryClientEntryDraftUpdateRequest> & { readonly draftId: string }
): Promise<AstroDiaryDraftMutationResponse> {
  const body = astroDiaryClientEntryDraftUpdateRequestSchema.parse(input.body);
  return astroDiaryDraftMutationResponseSchema.parse(
    await application.http.put(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/client-entry/drafts/${encodeURIComponent(input.draftId)}`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

export async function publishClientAstroDiaryEntryDraft(
  input: MutationInput<AstroDiaryPaidCoreDraftPublishRequest> & { readonly draftId: string }
): Promise<AstroDiaryCommandResponse> {
  const body = astroDiaryPaidCoreDraftPublishRequestSchema.parse(input.body);
  return astroDiaryCommandResponseSchema.parse(
    await application.http.post(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/client-entry/drafts/${encodeURIComponent(input.draftId)}/publish`,
      body,
      commandRequestOptions(input.idempotencyKey)
    )
  );
}

function commandRequestOptions(idempotencyKey: string) {
  return { csrf: true, idempotencyKey } as const;
}
