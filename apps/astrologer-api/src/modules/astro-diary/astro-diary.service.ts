import { randomUUID } from "node:crypto";

import { HttpException, Inject, Injectable } from "@nestjs/common";
import {
  astroDiaryAstrologerReplyDraftResponseSchema,
  astroDiaryAstrologerReplyDraftCreateRequestSchema,
  astroDiaryAstrologerReplyDraftUpdateRequestSchema,
  astroDiaryCommandResponseSchema,
  astroDiaryDraftMutationResponseSchema,
  astroDiaryJournalListResponseSchema,
  astroDiaryJournalSchema,
  astroDiaryJournalSummaryResponseSchema,
  astroDiaryPaidCoreDraftPublishRequestSchema,
  astroDiaryTimelinePageSchema,
  astroDiaryTimelineQuerySchema,
  type AstroDiaryCommandResponse,
  type AstroDiaryAstrologerReplyDraftResponse,
  type AstroDiaryDraftMutationResponse,
  type AstroDiaryJournalListResponse,
  type AstroDiaryJournalSummaryResponse,
  type AstroDiaryTimelinePage
} from "@elevenhouse/contracts";
import {
  executeAstroDiaryParticipantDraftCreateCommand,
  executeAstroDiaryParticipantDraftUpdateCommand,
  executePublishAstrologerReplyCommand,
  type AstroDiaryCommandExecution,
  type AstroDiaryCommandStableResult,
  type AstroDiaryCommandUnitOfWork,
  type AstroDiaryJournalReader,
  type AstroDiaryPaidCoreCommandContext
} from "@elevenhouse/domain";

import { SystemClock } from "../clock/system-clock.service";
import { ASTRO_DIARY_COMMAND_UNIT_OF_WORK, ASTRO_DIARY_JOURNAL_READER } from "./astro-diary.tokens";

@Injectable()
export class AstroDiaryService {
  constructor(
    @Inject(ASTRO_DIARY_JOURNAL_READER) private readonly reader: AstroDiaryJournalReader,
    @Inject(ASTRO_DIARY_COMMAND_UNIT_OF_WORK)
    private readonly commandUnitOfWork: AstroDiaryCommandUnitOfWork,
    @Inject(SystemClock) private readonly clock: Pick<SystemClock, "now">
  ) {}

  async listJournals(astrologerUserId: string): Promise<AstroDiaryJournalListResponse> {
    const result = await this.reader.listParticipantJournals({
      participantUserId: astrologerUserId,
      participantRole: "astrologer",
      limit: 100,
      now: this.clock.now().toISOString()
    });
    return astroDiaryJournalListResponseSchema.parse(result);
  }

  async getJournal(
    astrologerUserId: string,
    journalId: string
  ): Promise<AstroDiaryJournalSummaryResponse> {
    requireUuid(journalId);
    const result = await this.reader.getParticipantJournalSummary({
      participantUserId: astrologerUserId,
      participantRole: "astrologer",
      journalId,
      now: this.clock.now().toISOString()
    });
    if (!result) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return astroDiaryJournalSummaryResponseSchema.parse(result);
  }

  async getTimeline(
    astrologerUserId: string,
    journalId: string,
    query: unknown
  ): Promise<AstroDiaryTimelinePage> {
    requireUuid(journalId);
    const parsedQuery = astroDiaryTimelineQuerySchema.safeParse(query);
    if (!parsedQuery.success) throw invalidRequest();
    const result = await this.reader.getParticipantJournalTimeline({
      participantUserId: astrologerUserId,
      participantRole: "astrologer",
      journalId,
      afterCursor: parsedQuery.data.afterCursor,
      limit: parsedQuery.data.limit
    });
    if (!result) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return astroDiaryTimelinePageSchema.parse(result);
  }

  async getReplyDraft(
    astrologerUserId: string,
    journalId: string
  ): Promise<AstroDiaryAstrologerReplyDraftResponse> {
    requireUuid(journalId);
    const result = await this.reader.getParticipantAstrologerReplyDraft({
      participantUserId: astrologerUserId,
      participantRole: "astrologer",
      journalId,
      now: this.clock.now().toISOString()
    });
    if (!result) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return astroDiaryAstrologerReplyDraftResponseSchema.parse(result);
  }

  async createReplyDraft(
    astrologerUserId: string,
    journalId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<AstroDiaryDraftMutationResponse> {
    requireUuid(journalId);
    const request = astroDiaryAstrologerReplyDraftCreateRequestSchema.safeParse(body);
    if (!request.success) throw invalidRequest();
    const context = await this.requireCommandContext(astrologerUserId, journalId);
    const cycle = context.currentCycle ?? context.latestCycle;
    if (!cycle) {
      throw astroDiaryHttpError(409, "no_open_cycle", "Journal has no open cycle");
    }
    const result = await executeAstroDiaryParticipantDraftCreateCommand(this.commandUnitOfWork, {
      journalId,
      idempotencyKey,
      actorUserId: astrologerUserId,
      actorRole: "astrologer",
      request: {
        ...request.data,
        cycleId: cycle.id,
        kind: "astrologer_reply",
        moodId: null,
        correctsItemId: null
      }
    });
    return mapDraftMutationResult(result);
  }

  async updateReplyDraft(
    astrologerUserId: string,
    journalId: string,
    draftId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<AstroDiaryDraftMutationResponse> {
    requireUuid(journalId);
    requireUuid(draftId);
    const request = astroDiaryAstrologerReplyDraftUpdateRequestSchema.safeParse(body);
    if (!request.success) throw invalidRequest();
    await this.requireCommandContext(astrologerUserId, journalId);
    const result = await executeAstroDiaryParticipantDraftUpdateCommand(this.commandUnitOfWork, {
      journalId,
      idempotencyKey,
      actorUserId: astrologerUserId,
      actorRole: "astrologer",
      request: { ...request.data, draftId, moodId: null }
    });
    return mapDraftMutationResult(result);
  }

  async publishClosingReply(
    astrologerUserId: string,
    journalId: string,
    draftId: string,
    body: unknown,
    idempotencyKey: string
  ): Promise<AstroDiaryCommandResponse> {
    requireUuid(journalId);
    requireUuid(draftId);
    const request = astroDiaryPaidCoreDraftPublishRequestSchema.safeParse(body);
    if (!request.success) throw invalidRequest();
    const context = await this.requireCommandContext(astrologerUserId, journalId);
    const cycle = context.currentCycle ?? context.latestCycle;
    const obligation = context.currentObligation ?? context.latestObligation;
    if (!cycle || !obligation) {
      throw astroDiaryHttpError(409, "no_open_response_obligation", "No reply is currently due");
    }
    const result = await executePublishAstrologerReplyCommand(this.commandUnitOfWork, {
      journalId,
      expectedJournalVersion: request.data.expectedJournalVersion,
      idempotencyKey,
      command: {
        mode: "close",
        actorUserId: astrologerUserId,
        cycleId: cycle.id,
        expectedCycleVersion: cycle.version,
        obligationId: obligation.id,
        expectedObligationVersion: obligation.version,
        replyDraftId: draftId,
        expectedReplyDraftVersion: request.data.expectedDraftVersion,
        replyItemId: randomUUID(),
        derivativeCommandId: randomUUID(),
        eventIds: {
          itemPublished: randomUUID(),
          obligationSatisfied: randomUUID(),
          cycleClosed: randomUUID(),
          derivativeRequested: randomUUID()
        }
      }
    });
    return mapCommandResult(result);
  }

  private async requireCommandContext(
    astrologerUserId: string,
    journalId: string
  ): Promise<AstroDiaryPaidCoreCommandContext> {
    const context = await this.reader.getPaidCoreCommandContext({
      participantUserId: astrologerUserId,
      participantRole: "astrologer",
      journalId,
      now: this.clock.now().toISOString()
    });
    if (!context) throw astroDiaryHttpError(404, "astro_diary_not_found", "Journal was not found");
    return context;
  }
}

function mapDraftMutationResult(
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

function mapCommandResult(execution: AstroDiaryCommandExecution): AstroDiaryCommandResponse {
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

function requireUuid(value: string): void {
  if (!astroDiaryJournalSchema.shape.id.safeParse(value).success) throw invalidRequest();
}

function astroDiaryHttpError(
  status: number,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>
): HttpException {
  return new HttpException({ statusCode: status, error: code, code, message, ...details }, status);
}
