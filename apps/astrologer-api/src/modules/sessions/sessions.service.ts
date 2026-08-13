import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  EndSessionBodySchema,
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
  endSession,
  issueSessionJoin,
  sendSessionMessage,
  type MediaRoomProviderPort,
  type SessionActor,
  type SessionCommandStore,
  type SessionProjection,
  type SessionReadStore
} from "@elevenhouse/domain";
import {
  SESSION_COMMAND_STORE,
  SESSION_MEDIA_ROOM_PROVIDER,
  SESSION_READ_STORE
} from "./sessions.tokens";

@Injectable()
export class SessionsService {
  constructor(
    @Inject(SESSION_READ_STORE) private readonly reads: SessionReadStore,
    @Inject(SESSION_COMMAND_STORE) private readonly commands: SessionCommandStore,
    @Inject(SESSION_MEDIA_ROOM_PROVIDER) private readonly provider: MediaRoomProviderPort
  ) {}

  async list(ownerUserId: string, input: unknown, now: Date) {
    const query = SessionRangeQuerySchema.parse(input);
    return SessionListResponseSchema.parse({
      sessions: await this.reads.listForActor({
        actor: actor(ownerUserId),
        rangeStartAt: query.rangeStartAt,
        rangeEndAt: query.rangeEndAt,
        now: now.toISOString()
      })
    });
  }

  async get(sessionId: string, ownerUserId: string, now: Date) {
    const session = await this.reads.getForActor({
      actor: actor(ownerUserId),
      sessionId,
      now: now.toISOString()
    });
    if (!session) throw new NotFoundException({ code: "SESSION_NOT_FOUND" });
    const decision = await this.commands.issueJoin({
      actor: actor(ownerUserId),
      sessionId,
      now: now.toISOString()
    });
    return SessionResponseSchema.parse({ session: toContractSession(session, decision) });
  }

  async join(sessionId: string, ownerUserId: string, now: Date) {
    try {
      const credential = await issueSessionJoin({
        store: this.commands,
        provider: this.provider,
        actor: actor(ownerUserId),
        sessionId,
        now
      });
      return SessionJoinCredentialResponseSchema.parse({
        schemaVersion: "session-join-credential.v1",
        ...credential
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async listMessages(sessionId: string, ownerUserId: string, input: unknown) {
    const query = SessionMessageListQuerySchema.parse(input);
    return SessionMessagePageSchema.parse(
      await this.reads.listMessages({
        actor: actor(ownerUserId),
        sessionId,
        afterSequence: query.afterSequence,
        limit: query.limit
      })
    );
  }

  async sendMessage(sessionId: string, ownerUserId: string, input: unknown, now: Date) {
    const body = SendSessionMessageBodySchema.parse(input);
    try {
      return SessionMessageResponseSchema.parse(
        await sendSessionMessage({
          store: this.commands,
          actor: actor(ownerUserId),
          sessionId,
          operationId: body.operationId,
          text: body.text,
          now
        })
      );
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async listEvents(sessionId: string, ownerUserId: string, input: unknown) {
    const query = SessionRealtimeEventListQuerySchema.parse(input);
    return SessionRealtimeEventPageSchema.parse(
      await this.reads.listRealtimeEvents({
        actor: actor(ownerUserId),
        sessionId,
        afterEventId: query.afterEventId,
        limit: query.limit
      })
    );
  }

  async end(sessionId: string, ownerUserId: string, input: unknown, now: Date) {
    const body = EndSessionBodySchema.parse(input);
    try {
      return await endSession({
        store: this.commands,
        provider: this.provider,
        actor: actor(ownerUserId),
        sessionId,
        operationId: body.operationId,
        now
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async applyLiveKitWebhook(authorization: string | undefined, rawBody: Buffer | undefined) {
    if (!authorization || !rawBody) throw new BadRequestException("Signed raw webhook is required");
    try {
      const text = rawBody.toString("utf8");
      const event = await this.provider.parseWebhook({ authorization, rawBody: text });
      return await this.commands.applyProviderEvent({
        event,
        payloadDigest: `sha256:${createHash("sha256").update(rawBody).digest("hex")}`,
        receivedAt: new Date().toISOString()
      });
    } catch (error) {
      throw toHttpError(error);
    }
  }
}

function actor(userId: string): SessionActor {
  return { userId, role: "astrologer" };
}

function toContractSession(
  session: SessionProjection,
  decision: Awaited<ReturnType<SessionCommandStore["issueJoin"]>>
) {
  const joinPolicy =
    decision.kind === "authorized"
      ? { kind: "allowed" as const, joinableAt: null }
      : decision.reason === "too_early"
        ? { kind: "too_early" as const, joinableAt: decision.joinableAt }
        : { kind: "denied" as const, joinableAt: null, reason: decision.reason };
  return { schemaVersion: "session.v1" as const, ...session, joinPolicy };
}

function toHttpError(error: unknown): Error {
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  if (code === "session_not_found") return new NotFoundException({ code: "SESSION_NOT_FOUND" });
  if (code === "session_message_operation_conflict") {
    return new ConflictException({ code: "SESSION_OPERATION_CONFLICT" });
  }
  if (code === "session_provider_outcome_unknown" || code === "unknown") {
    return new ServiceUnavailableException({ code: "SESSION_PROVIDER_UNAVAILABLE" });
  }
  return new BadRequestException({ code: code.toUpperCase() });
}
