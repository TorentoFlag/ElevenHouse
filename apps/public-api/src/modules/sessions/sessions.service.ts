import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import {
  SendSessionMessageBodySchema,
  SessionJoinCredentialResponseSchema,
  SessionListResponseSchema,
  SessionMessageListQuerySchema,
  SessionMessagePageSchema,
  SessionMessageResponseSchema,
  SessionRangeQuerySchema,
  SessionRealtimeEventListQuerySchema,
  SessionRealtimeEventPageSchema,
  SessionResponseSchema
} from "@elevenhouse/contracts";
import {
  issueSessionJoin,
  sendSessionMessage,
  type MediaRoomProviderPort,
  type SessionActor,
  type SessionCommandStore,
  type SessionProjection,
  type SessionReadStore
} from "@elevenhouse/domain";
import { SESSION_COMMAND_STORE, SESSION_MEDIA_ROOM_PROVIDER, SESSION_READ_STORE } from "./sessions.tokens";

@Injectable()
export class SessionsService {
  constructor(
    @Inject(SESSION_READ_STORE) private readonly reads: SessionReadStore,
    @Inject(SESSION_COMMAND_STORE) private readonly commands: SessionCommandStore,
    @Inject(SESSION_MEDIA_ROOM_PROVIDER) private readonly provider: MediaRoomProviderPort
  ) {}

  async list(clientUserId: string, input: unknown, now: Date) {
    const query = SessionRangeQuerySchema.parse(input);
    return SessionListResponseSchema.parse({ sessions: await this.reads.listForActor({ actor: actor(clientUserId), rangeStartAt: query.rangeStartAt, rangeEndAt: query.rangeEndAt, now: now.toISOString() }) });
  }

  async get(sessionId: string, clientUserId: string, now: Date) {
    const session = await this.reads.getForActor({ actor: actor(clientUserId), sessionId, now: now.toISOString() });
    if (!session) throw new NotFoundException({ code: "SESSION_NOT_FOUND" });
    const decision = await this.commands.issueJoin({ actor: actor(clientUserId), sessionId, now: now.toISOString() });
    return SessionResponseSchema.parse({ session: toContractSession(session, decision) });
  }

  async join(sessionId: string, clientUserId: string, now: Date) {
    try {
      const credential = await issueSessionJoin({ store: this.commands, provider: this.provider, actor: actor(clientUserId), sessionId, now });
      return SessionJoinCredentialResponseSchema.parse({ schemaVersion: "session-join-credential.v1", ...credential });
    } catch (error) { throw toHttpError(error); }
  }

  async listMessages(sessionId: string, clientUserId: string, input: unknown) {
    const query = SessionMessageListQuerySchema.parse(input);
    return SessionMessagePageSchema.parse(await this.reads.listMessages({ actor: actor(clientUserId), sessionId, afterSequence: query.afterSequence, limit: query.limit }));
  }

  async sendMessage(sessionId: string, clientUserId: string, input: unknown, now: Date) {
    const body = SendSessionMessageBodySchema.parse(input);
    try {
      return SessionMessageResponseSchema.parse(await sendSessionMessage({ store: this.commands, actor: actor(clientUserId), sessionId, operationId: body.operationId, text: body.text, now }));
    } catch (error) { throw toHttpError(error); }
  }

  async listEvents(sessionId: string, clientUserId: string, input: unknown) {
    const query = SessionRealtimeEventListQuerySchema.parse(input);
    return SessionRealtimeEventPageSchema.parse(await this.reads.listRealtimeEvents({ actor: actor(clientUserId), sessionId, afterEventId: query.afterEventId, limit: query.limit }));
  }
}

function actor(userId: string): SessionActor { return { userId, role: "client" }; }

function toContractSession(session: SessionProjection, decision: Awaited<ReturnType<SessionCommandStore["issueJoin"]>>) {
  const joinPolicy = decision.kind === "authorized"
    ? { kind: "allowed" as const, joinableAt: null }
    : decision.reason === "too_early"
      ? { kind: "too_early" as const, joinableAt: decision.joinableAt }
      : { kind: "denied" as const, joinableAt: null, reason: decision.reason };
  return { schemaVersion: "session.v1" as const, ...session, joinPolicy };
}

function toHttpError(error: unknown): Error {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  if (code === "session_not_found") return new NotFoundException({ code: "SESSION_NOT_FOUND" });
  if (code === "session_message_operation_conflict") return new ConflictException({ code: "SESSION_OPERATION_CONFLICT" });
  if (code === "session_provider_outcome_unknown" || code === "unknown") return new ServiceUnavailableException({ code: "SESSION_PROVIDER_UNAVAILABLE" });
  return new BadRequestException({ code: code.toUpperCase() });
}
