import { randomUUID } from "node:crypto";

import { HttpException, Inject, Injectable, Optional } from "@nestjs/common";
import {
  createAstroDiaryMediaUploadIntentRequestSchema,
  astroDiaryMediaUploadCompletionResponseSchema,
  astroDiaryClientEntryDraftResponseSchema,
  astroDiaryClientEntryDraftCreateRequestSchema,
  astroDiaryClientEntryDraftUpdateRequestSchema,
  astroDiaryCommandResponseSchema,
  astroDiaryDraftMutationResponseSchema,
  astroDiaryJournalListResponseSchema,
  astroDiaryJournalSchema,
  astroDiaryJournalSummaryResponseSchema,
  astroDiaryPaidCoreDraftPublishRequestSchema,
  astroDiaryTimelinePageSchema,
  astroDiaryTimelineQuerySchema,
  mediaUploadIntentResponseSchema,
  completeMediaUploadRequestSchema,
  type AstroDiaryMediaUploadCompletionResponse,
  type AstroDiaryCommandResponse,
  type AstroDiaryClientEntryDraftResponse,
  type AstroDiaryDraftMutationResponse,
  type AstroDiaryJournalListResponse,
  type AstroDiaryJournalSummaryResponse,
  type AstroDiaryTimelinePage,
  type MediaUploadIntentResponse
} from "@elevenhouse/contracts";
import {
  AstroDiaryMediaAuthorizationError,
  completeAstroDiaryPrivateMediaUpload,
  createAstroDiaryPrivateMediaUploadIntent,
  executeAstroDiaryParticipantDraftCreateCommand,
  executeAstroDiaryParticipantDraftUpdateCommand,
  executeOpenClientCycleCommand,
  type AstroDiaryCommandExecution,
  type AstroDiaryCommandStableResult,
  type AstroDiaryCommandUnitOfWork,
  type AstroDiaryJournalReader,
  type AstroDiaryMediaUploadStore,
  MediaStorageObjectMissingError,
  MediaValidationError,
  MediaNotFoundError,
  type ObjectStoragePort,
  type AstroDiaryMediaAuthorizationContext
} from "@elevenhouse/domain";

import { SystemClock } from "../../common/system-clock.js";
import {
  ASTRO_DIARY_COMMAND_UNIT_OF_WORK,
  ASTRO_DIARY_JOURNAL_READER,
  ASTRO_DIARY_MEDIA_STORAGE,
  ASTRO_DIARY_MEDIA_STORE
} from "./astro-diary.tokens";

type AstroDiaryMediaStore = AstroDiaryMediaUploadStore &
  Readonly<{
    getAuthorizationContext(input: {
      readonly journalId: string;
      readonly actorUserId: string;
    }): Promise<AstroDiaryMediaAuthorizationContext | null>;
  }>;

@Injectable()
export class ClientAstroDiaryService {
  constructor(
    @Inject(ASTRO_DIARY_JOURNAL_READER) private readonly reader: AstroDiaryJournalReader,
    @Inject(ASTRO_DIARY_COMMAND_UNIT_OF_WORK)
    private readonly commandUnitOfWork: AstroDiaryCommandUnitOfWork,
    @Inject(SystemClock) private readonly clock: Pick<SystemClock, "now">,
    @Optional()
    @Inject(ASTRO_DIARY_MEDIA_STORE)
    private readonly mediaStore: AstroDiaryMediaStore | null = null,
    @Optional()
    @Inject(ASTRO_DIARY_MEDIA_STORAGE)
    private readonly mediaStorage: ObjectStoragePort | null = null
  ) {}

  async listJournals(clientUserId: string): Promise<AstroDiaryJournalListResponse> {
    const result = await this.reader.listParticipantJournals({
      participantUserId: clientUserId,
      participantRole: "client",
      limit: 100,
      now: this.clock.now().toISOString()
    });
    return astroDiaryJournalListResponseSchema.parse(result);
  }

  async getJournal(
    clientUserId: string,
    journalId: string
  ): Promise<AstroDiaryJournalSummaryResponse> {
    requireUuid(journalId);
    const result = await this.reader.getParticipantJournalSummary({
      participantUserId: clientUserId,
      participantRole: "client",
      journalId,
      now: this.clock.now().toISOString()
    });
    if (!result) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return astroDiaryJournalSummaryResponseSchema.parse(result);
  }

  async getTimeline(
    clientUserId: string,
    journalId: string,
    query: unknown
  ): Promise<AstroDiaryTimelinePage> {
    requireUuid(journalId);
    const parsedQuery = astroDiaryTimelineQuerySchema.safeParse(query);
    if (!parsedQuery.success) throw invalidRequest();
    const result = await this.reader.getParticipantJournalTimeline({
      participantUserId: clientUserId,
      participantRole: "client",
      journalId,
      afterCursor: parsedQuery.data.afterCursor,
      limit: parsedQuery.data.limit
    });
    if (!result) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return astroDiaryTimelinePageSchema.parse(result);
  }

  async getClientEntryDraft(
    clientUserId: string,
    journalId: string
  ): Promise<AstroDiaryClientEntryDraftResponse> {
    requireUuid(journalId);
    const result = await this.reader.getParticipantClientEntryDraft({
      participantUserId: clientUserId,
      participantRole: "client",
      journalId,
      now: this.clock.now().toISOString()
    });
    if (!result) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return astroDiaryClientEntryDraftResponseSchema.parse(result);
  }

  async createMediaUploadIntent(
    clientUserId: string,
    journalId: string,
    body: unknown
  ): Promise<MediaUploadIntentResponse> {
    requireUuid(journalId);
    const request = createAstroDiaryMediaUploadIntentRequestSchema.safeParse(body);
    if (!request.success) throw invalidRequest();
    const mediaStore = this.requireMediaStore();
    const context = await mediaStore.getAuthorizationContext({
      journalId,
      actorUserId: clientUserId
    });
    if (!context) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return mapAstroDiaryMediaErrors(async () =>
      mediaUploadIntentResponseSchema.parse(
        await createAstroDiaryPrivateMediaUploadIntent({
          store: mediaStore,
          storage: this.requireMediaStorage(),
          authority: context,
          ownerUserId: clientUserId,
          input: request.data,
          idGenerator: randomUUID,
          now: this.clock.now()
        })
      )
    );
  }

  async completeMediaUpload(
    clientUserId: string,
    journalId: string,
    mediaId: string,
    body: unknown
  ): Promise<AstroDiaryMediaUploadCompletionResponse> {
    requireUuid(journalId);
    requireUuid(mediaId);
    const request = completeMediaUploadRequestSchema.safeParse(body ?? {});
    if (!request.success) throw invalidRequest();
    const mediaStore = this.requireMediaStore();
    const context = await mediaStore.getAuthorizationContext({
      journalId,
      actorUserId: clientUserId
    });
    if (!context) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return mapAstroDiaryMediaErrors(async () => {
      const asset = await completeAstroDiaryPrivateMediaUpload({
        store: mediaStore,
        storage: this.requireMediaStorage(),
        authority: context,
        ownerUserId: clientUserId,
        mediaId,
        input: request.data,
        now: this.clock.now()
      });
      return astroDiaryMediaUploadCompletionResponseSchema.parse({
        mediaId: asset.id,
        status: "ready",
        purpose: asset.purpose,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        checksumSha256: asset.checksumSha256,
        width: asset.width,
        height: asset.height
      });
    });
  }

  async createClientEntryDraft(
    clientUserId: string,
    journalId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<AstroDiaryDraftMutationResponse> {
    requireUuid(journalId);
    const request = astroDiaryClientEntryDraftCreateRequestSchema.safeParse(body);
    if (!request.success) throw invalidRequest();
    await this.requireCommandContext(clientUserId, journalId);
    const result = await executeAstroDiaryParticipantDraftCreateCommand(this.commandUnitOfWork, {
      journalId,
      idempotencyKey,
      actorUserId: clientUserId,
      actorRole: "client",
      request: {
        ...request.data,
        cycleId: null,
        kind: "client_entry",
        correctsItemId: null
      }
    });
    return mapDraftMutationResult(result);
  }

  async updateClientEntryDraft(
    clientUserId: string,
    journalId: string,
    draftId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<AstroDiaryDraftMutationResponse> {
    requireUuid(journalId);
    requireUuid(draftId);
    const request = astroDiaryClientEntryDraftUpdateRequestSchema.safeParse(body);
    if (!request.success) throw invalidRequest();
    await this.requireCommandContext(clientUserId, journalId);
    const result = await executeAstroDiaryParticipantDraftUpdateCommand(this.commandUnitOfWork, {
      journalId,
      idempotencyKey,
      actorUserId: clientUserId,
      actorRole: "client",
      request: { ...request.data, draftId }
    });
    return mapDraftMutationResult(result);
  }

  async publishClientEntry(
    clientUserId: string,
    journalId: string,
    draftId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<AstroDiaryCommandResponse> {
    requireUuid(journalId);
    requireUuid(draftId);
    const request = astroDiaryPaidCoreDraftPublishRequestSchema.safeParse(body);
    if (!request.success) throw invalidRequest();
    const context = await this.requireCommandContext(clientUserId, journalId);
    const period = context.activePeriod ?? context.latestPeriod;
    if (!period) {
      throw astroDiaryHttpError(403, "paid_access_ended", "Journal access is read-only");
    }
    const result = await executeOpenClientCycleCommand(this.commandUnitOfWork, {
      journalId,
      expectedJournalVersion: request.data.expectedJournalVersion,
      idempotencyKey,
      command: {
        actorUserId: clientUserId,
        draftId,
        expectedDraftVersion: request.data.expectedDraftVersion,
        cycleId: randomUUID(),
        entryItemId: randomUUID(),
        obligationId: randomUUID(),
        contextId: randomUUID(),
        derivativeCommandId: randomUUID(),
        allowancePeriodId: period.id,
        allowanceExpectedVersion: period.allowanceVersion,
        allowanceIdempotencyKey: `astro-diary:${idempotencyKey}`,
        allowanceConsumptionId: randomUUID(),
        eventIds: {
          cycleOpened: randomUUID(),
          itemPublished: randomUUID(),
          obligationCreated: randomUUID(),
          contextRequested: randomUUID(),
          derivativeRequested: randomUUID()
        }
      }
    });
    return mapCommandResult(result);
  }

  private async requireCommandContext(clientUserId: string, journalId: string) {
    const context = await this.reader.getPaidCoreCommandContext({
      participantUserId: clientUserId,
      participantRole: "client",
      journalId,
      now: this.clock.now().toISOString()
    });
    if (!context) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return context;
  }

  private requireMediaStore(): AstroDiaryMediaStore {
    if (!this.mediaStore) throw new Error("AstroDiary media store is not configured");
    return this.mediaStore;
  }

  private requireMediaStorage(): ObjectStoragePort {
    if (!this.mediaStorage) throw new Error("AstroDiary media storage is not configured");
    return this.mediaStorage;
  }
}

export function mapDraftMutationResult(
  execution: AstroDiaryCommandExecution
): AstroDiaryDraftMutationResponse {
  const stable = requireStableResult(execution);
  if (stable.outcome === "rejected") throw rejectedCommand(stable.code);
  const resource = stable.resource;
  if (!resource || resource.type !== "draft") {
    throw new Error("AstroDiary draft command response is missing its resource");
  }
  return astroDiaryDraftMutationResponseSchema.parse({
    outcome: execution.outcome === "replayed" ? "replayed" : "applied",
    draftId: resource.draftId,
    version: resource.version
  });
}

export function mapCommandResult(execution: AstroDiaryCommandExecution): AstroDiaryCommandResponse {
  const stable = requireStableResult(execution);
  if (stable.outcome === "rejected") throw rejectedCommand(stable.code);
  return astroDiaryCommandResponseSchema.parse({
    outcome: execution.outcome === "replayed" ? "replayed" : "applied",
    eventIds: stable.eventIds
  });
}

function requireStableResult(execution: AstroDiaryCommandExecution): AstroDiaryCommandStableResult {
  switch (execution.outcome) {
    case "not_found":
      throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    case "idempotency_conflict":
      throw astroDiaryHttpError(409, "idempotency_conflict", "Idempotency key intent conflicts");
    case "version_conflict":
      throw astroDiaryHttpError(409, "stale_version", "Resource version is stale", {
        aggregate: execution.aggregate,
        resourceId: execution.id,
        expectedVersion: execution.expectedVersion,
        currentVersion: execution.currentVersion
      });
    case "replayed":
      return execution.result;
    case "applied":
    case "rejected":
      return execution.receipt.result;
  }
}

function rejectedCommand(code: string): HttpException {
  if (code === "invalid_request" || code === "invalid_draft") return invalidRequest();
  if (code === "authority_not_found" || code === "draft_not_found") {
    return astroDiaryHttpError(404, "astro_diary_not_found", "Journal resource was not found");
  }
  if (
    code === "relationship_denied" ||
    code === "journal_not_writable" ||
    code === "finance_denied" ||
    code === "paid_access_ended"
  ) {
    return astroDiaryHttpError(403, code, "Journal access does not allow this command");
  }
  return astroDiaryHttpError(409, code, "AstroDiary command conflicts with current state");
}

function invalidRequest(): HttpException {
  return astroDiaryHttpError(400, "invalid_request", "Invalid AstroDiary request");
}

async function mapAstroDiaryMediaErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AstroDiaryMediaAuthorizationError) {
      if (
        error.reason === "actor_not_participant" ||
        error.reason === "journal_scope_conflict" ||
        error.reason === "media_journal_conflict" ||
        error.reason === "media_owner_conflict"
      ) {
        throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal media was not found");
      }
      throw astroDiaryHttpError(403, error.reason, "Journal media operation is not allowed");
    }
    if (error instanceof MediaNotFoundError) {
      throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal media was not found");
    }
    if (error instanceof MediaValidationError || error instanceof MediaStorageObjectMissingError) {
      throw invalidRequest();
    }
    throw error;
  }
}

function requireUuid(value: string): void {
  if (!astroDiaryJournalSchema.shape.id.safeParse(value).success) throw invalidRequest();
}

export function astroDiaryHttpError(
  status: number,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>
): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message, ...details }, status);
}
