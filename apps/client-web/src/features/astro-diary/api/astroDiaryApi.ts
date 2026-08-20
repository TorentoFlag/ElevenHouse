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
  astroDiaryMediaUploadCompletionResponseSchema,
  createAstroDiaryMediaUploadIntentRequestSchema,
  mediaMimeTypeSchema,
  mediaUploadIntentResponseSchema,
  type AstroDiaryClientEntryDraftCreateRequest,
  type AstroDiaryClientEntryDraftResponse,
  type AstroDiaryClientEntryDraftUpdateRequest,
  type AstroDiaryCommandResponse,
  type AstroDiaryDraftMutationResponse,
  type AstroDiaryJournalListResponse,
  type AstroDiaryJournalSummaryResponse,
  type AstroDiaryMediaUploadCompletionResponse,
  type AstroDiaryMediaUploadPurpose,
  type AstroDiaryPaidCoreDraftPublishRequest,
  type MediaUploadIntentResponse,
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

export async function createClientAstroDiaryMediaUploadIntent(input: {
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

export async function completeClientAstroDiaryMediaUpload(input: {
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

export async function uploadClientAstroDiaryMediaFile(input: {
  readonly journalId: string;
  readonly purpose: AstroDiaryMediaUploadPurpose;
  readonly file: File;
  readonly fetcher?: typeof fetch;
}): Promise<AstroDiaryMediaUploadCompletionResponse> {
  const uploadIntent = await createClientAstroDiaryMediaUploadIntent({
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
  return completeClientAstroDiaryMediaUpload({
    journalId: input.journalId,
    mediaId: uploadIntent.mediaId
  });
}

function commandRequestOptions(idempotencyKey: string) {
  return { csrf: true, idempotencyKey } as const;
}
