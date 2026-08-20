import {
  astroDiaryAstrologerReplyDraftResponseSchema,
  astroDiaryAstrologerReplyDraftCreateRequestSchema,
  astroDiaryAstrologerReplyDraftUpdateRequestSchema,
  astroDiaryCommandResponseSchema,
  astroDiaryDraftMutationResponseSchema,
  astroDiaryJournalListResponseSchema,
  astroDiaryJournalSummaryResponseSchema,
  astroDiaryPaidCoreDraftPublishRequestSchema,
  astroDiaryTimelinePageSchema,
  astroDiaryMediaUploadCompletionResponseSchema,
  createAstroDiaryMediaUploadIntentRequestSchema,
  mediaMimeTypeSchema,
  mediaUploadIntentResponseSchema,
  type AstroDiaryAstrologerReplyDraftCreateRequest,
  type AstroDiaryAstrologerReplyDraftResponse,
  type AstroDiaryAstrologerReplyDraftUpdateRequest,
  type AstroDiaryCommandResponse,
  type AstroDiaryDraftMutationResponse,
  type AstroDiaryJournalSummaryResponse,
  type AstroDiaryMediaUploadCompletionResponse,
  type AstroDiaryMediaUploadPurpose,
  type AstroDiaryPaidCoreDraftPublishRequest,
  type MediaUploadIntentResponse,
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

export async function getAstroDiaryReplyDraft(
  journalId: string
): Promise<AstroDiaryAstrologerReplyDraftResponse> {
  return astroDiaryAstrologerReplyDraftResponseSchema.parse(
    await application.http.get(
      `/astro-diary/journals/${encodeURIComponent(journalId)}/astrologer-reply/draft`
    )
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

export async function createAstroDiaryMediaUploadIntent(input: {
  readonly journalId: string;
  readonly purpose: AstroDiaryMediaUploadPurpose;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}): Promise<MediaUploadIntentResponse> {
  const body = createAstroDiaryMediaUploadIntentRequestSchema.parse({
    purpose: input.purpose,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes
  });
  return mediaUploadIntentResponseSchema.parse(
    await application.http.post(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/media/upload-intents`,
      body,
      { csrf: true }
    )
  );
}

export async function completeAstroDiaryMediaUpload(input: {
  readonly journalId: string;
  readonly mediaId: string;
}): Promise<AstroDiaryMediaUploadCompletionResponse> {
  return astroDiaryMediaUploadCompletionResponseSchema.parse(
    await application.http.post(
      `/astro-diary/journals/${encodeURIComponent(input.journalId)}/media/${encodeURIComponent(input.mediaId)}/complete`,
      {},
      { csrf: true }
    )
  );
}

export async function uploadAstroDiaryMediaFile(input: {
  readonly journalId: string;
  readonly purpose: AstroDiaryMediaUploadPurpose;
  readonly file: File;
  readonly fetcher?: typeof fetch;
}): Promise<AstroDiaryMediaUploadCompletionResponse> {
  const uploadIntent = await createAstroDiaryMediaUploadIntent({
    journalId: input.journalId,
    purpose: input.purpose,
    fileName: input.file.name.trim(),
    mimeType: mediaMimeTypeSchema.parse(input.file.type),
    sizeBytes: input.file.size
  });
  const uploadResponse = await (input.fetcher ?? globalThis.fetch)(uploadIntent.upload.url, {
    method: uploadIntent.upload.method,
    headers: uploadIntent.upload.headers,
    body: input.file
  });
  if (!uploadResponse.ok) {
    throw new Error(`AstroDiary media object upload failed with status ${uploadResponse.status}`);
  }
  return completeAstroDiaryMediaUpload({
    journalId: input.journalId,
    mediaId: uploadIntent.mediaId
  });
}

function commandRequestOptions(idempotencyKey: string) {
  return {
    csrf: true,
    headers: { "idempotency-key": idempotencyKey }
  } as const;
}
