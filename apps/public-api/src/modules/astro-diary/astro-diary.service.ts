import { randomUUID } from "node:crypto";

import { HttpException, Inject, Injectable } from "@nestjs/common";
import {
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
  type AstroDiaryCommandResponse,
  type AstroDiaryClientEntryDraftResponse,
  type AstroDiaryDraftMutationResponse,
  type AstroDiaryJournalListResponse,
  type AstroDiaryJournalSummaryResponse,
  type AstroDiaryTimelinePage
} from "@elevenhouse/contracts";
import {
  executeAstroDiaryParticipantDraftCreateCommand,
  executeAstroDiaryParticipantDraftUpdateCommand,
  executeOpenClientCycleCommand,
  type AstroDiaryCommandExecution,
  type AstroDiaryCommandStableResult,
  type AstroDiaryCommandUnitOfWork,
  type AstroDiaryJournalReader
} from "@elevenhouse/domain";

import { SystemClock } from "../../common/system-clock.js";
import { ASTRO_DIARY_COMMAND_UNIT_OF_WORK, ASTRO_DIARY_JOURNAL_READER } from "./astro-diary.tokens";

@Injectable()
export class ClientAstroDiaryService {
  constructor(
    @Inject(ASTRO_DIARY_JOURNAL_READER) private readonly reader: AstroDiaryJournalReader,
    @Inject(ASTRO_DIARY_COMMAND_UNIT_OF_WORK)
    private readonly commandUnitOfWork: AstroDiaryCommandUnitOfWork,
    @Inject(SystemClock) private readonly clock: Pick<SystemClock, "now">
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
