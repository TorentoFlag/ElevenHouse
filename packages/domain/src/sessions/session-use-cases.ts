import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import {
  SessionBookingNotConfirmedError,
  SessionCancelledError,
  SessionEndedError,
  SessionExpiredError,
  SessionNotFoundError,
  SessionNotVideoBookingError,
  SessionProviderOutcomeUnknownError,
  SessionRelationshipBlockedError,
  SessionTooEarlyError,
  SessionValidationError,
  SessionEndForbiddenError
} from "./session-errors";
import type {
  MediaRoomProviderPort,
  SessionCommandStore
} from "./session-ports";
import type { SessionActor, SessionMessage } from "./session-types";

export async function issueSessionJoin(input: {
  readonly store: SessionCommandStore;
  readonly provider: MediaRoomProviderPort;
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly now: Date;
}) {
  const now = input.now.toISOString();
  const decision = await input.store.issueJoin({
    actor: input.actor,
    sessionId: normalizeId(input.sessionId, "Session id is required"),
    now
  });
  if (decision.kind === "denied") throwJoinDenied(decision);

  const credential = await input.provider.createJoinCredential({
    sessionId: decision.sessionId,
    roomName: decision.providerRoomName,
    participantId: decision.providerParticipantId,
    participantName: decision.participantDisplayName,
    participantRole: decision.participantRole,
    issuedAt: now,
    ttlSeconds: 300
  });
  return {
    sessionId: decision.sessionId,
    ...credential,
    participant: {
      id: decision.providerParticipantId,
      role: decision.participantRole,
      displayName: decision.participantDisplayName
    },
    grants: {
      canPublishAudio: true as const,
      canPublishVideo: true as const,
      canPublishScreenShare: true as const,
      canSubscribe: true as const
    }
  };
}

export async function sendSessionMessage(input: {
  readonly store: SessionCommandStore;
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly operationId: string;
  readonly text: string;
  readonly now: Date;
}): Promise<{ readonly message: SessionMessage; readonly replayed: boolean }> {
  const sessionId = normalizeId(input.sessionId, "Session id is required");
  const operationId = normalizeId(input.operationId, "Message operation id is required");
  const text = input.text.trim();
  if (text.length === 0) throw new SessionValidationError("Session message is required");
  if (Array.from(text).length > 4_000) {
    throw new SessionValidationError("Session message exceeds 4,000 Unicode code points");
  }
  const requestHash = sha256CanonicalJson({
    schemaVersion: "session-message-command.v1",
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    sessionId,
    operationId,
    text
  } as unknown as CanonicalJson);
  const result = await input.store.recordMessage({
    actor: input.actor,
    sessionId,
    operationId,
    requestHash,
    text,
    now: input.now.toISOString()
  });
  return { message: result.message, replayed: result.kind === "replayed" };
}

export async function endSession(input: {
  readonly store: SessionCommandStore;
  readonly provider: MediaRoomProviderPort;
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly operationId: string;
  readonly now: Date;
}) {
  if (input.actor.role !== "astrologer") throw new SessionEndForbiddenError();
  const sessionId = normalizeId(input.sessionId, "Session id is required");
  const operationId = normalizeId(input.operationId, "End operation id is required");
  const now = input.now.toISOString();
  const requestHash = sha256CanonicalJson({
    schemaVersion: "session-end-command.v1",
    actorUserId: input.actor.userId,
    sessionId,
    operationId
  } as unknown as CanonicalJson);
  const prepared = await input.store.prepareEnd({
    actor: input.actor,
    sessionId,
    operationId,
    requestHash,
    now
  });
  if (prepared.kind !== "prepared") {
    return { session: prepared.session, replayed: prepared.kind === "replayed" };
  }

  let providerResult;
  try {
    providerResult = await input.provider.endRoom({
      commandId: prepared.commandId,
      roomName: prepared.providerRoomName
    });
  } catch {
    providerResult = { kind: "outcome_unknown" as const, safeCode: "request_failed" };
  }
  if (providerResult.kind === "outcome_unknown") {
    await input.store.markEndOutcomeUnknown({
      commandId: prepared.commandId,
      sessionId,
      safeCode: providerResult.safeCode,
      observedAt: now
    });
    throw new SessionProviderOutcomeUnknownError(providerResult.safeCode);
  }
  const completed = await input.store.completeEnd({
    commandId: prepared.commandId,
    sessionId,
    endedAt: now,
    endReason: "astrologer_ended"
  });
  return { session: completed.session, replayed: false };
}

function normalizeId(value: string, message: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new SessionValidationError(message);
  return normalized;
}

function throwJoinDenied(decision: Extract<Awaited<ReturnType<SessionCommandStore["issueJoin"]>>, { kind: "denied" }>): never {
  if (decision.reason === "not_found") throw new SessionNotFoundError();
  if (decision.reason === "not_video_booking") throw new SessionNotVideoBookingError();
  if (decision.reason === "booking_not_confirmed") throw new SessionBookingNotConfirmedError();
  if (decision.reason === "relationship_blocked") throw new SessionRelationshipBlockedError();
  if (decision.reason === "too_early") {
    if (!decision.joinableAt) throw new SessionValidationError("Joinable time is missing");
    throw new SessionTooEarlyError(decision.joinableAt);
  }
  if (decision.reason === "cancelled") throw new SessionCancelledError();
  if (decision.reason === "expired") throw new SessionExpiredError();
  throw new SessionEndedError();
}
