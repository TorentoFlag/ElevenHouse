import type {
  MediaRoomCommandResult,
  MediaRoomEndCommand,
  MediaRoomEvent,
  MediaRoomJoinCredential,
  MediaRoomJoinInput,
  MediaRoomParticipantCommand,
  MediaRoomWebhookInput,
  SessionActor,
  SessionMessage,
  SessionMessagePage,
  SessionProjection,
  SessionRealtimeEventPage,
  SessionState,
  SessionSummary
} from "./session-types";

export type IssueSessionJoinInput = {
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly now: string;
};

export type IssueSessionJoinDecision =
  | {
      readonly kind: "authorized";
      readonly sessionId: string;
      readonly providerRoomName: string;
      readonly providerParticipantId: string;
      readonly participantRole: SessionActor["role"];
      readonly participantDisplayName: string;
    }
  | {
      readonly kind: "denied";
      readonly reason:
        | "not_found"
        | "not_video_booking"
        | "booking_not_confirmed"
        | "relationship_blocked"
        | "too_early"
        | "cancelled"
        | "expired"
        | "ended";
      readonly joinableAt?: string;
    };

export type RecordSessionMessageInput = {
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly operationId: string;
  readonly requestHash: `sha256:${string}`;
  readonly text: string;
  readonly now: string;
};

export type RecordSessionMessageResult =
  | { readonly kind: "created"; readonly message: SessionMessage }
  | { readonly kind: "replayed"; readonly message: SessionMessage };

export type RecordSessionLeaveInput = {
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly operationId: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
};

export type RecordSessionLeaveResult = {
  readonly kind: "recorded" | "replayed";
  readonly session: SessionProjection;
};

export type PrepareSessionEndInput = {
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly operationId: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
};

export type PrepareSessionEndResult =
  | {
      readonly kind: "prepared";
      readonly commandId: string;
      readonly sessionId: string;
      readonly providerRoomName: string;
    }
  | { readonly kind: "replayed" | "already_ended"; readonly session: SessionProjection };

export type CompleteSessionEndInput = {
  readonly commandId: string;
  readonly sessionId: string;
  readonly endedAt: string;
  readonly endReason: "astrologer_ended";
};

export type CompleteSessionEndResult = { readonly session: SessionProjection };

export type MarkSessionEndOutcomeUnknownInput = {
  readonly commandId: string;
  readonly sessionId: string;
  readonly safeCode: string;
  readonly observedAt: string;
};

export type ApplySessionProviderEventInput = {
  readonly event: MediaRoomEvent;
  readonly payloadDigest: `sha256:${string}`;
  readonly receivedAt: string;
};

export type ApplyProviderEventResult = {
  readonly kind: "applied" | "replayed" | "ignored";
  readonly state: SessionState | null;
};

export type SessionCommandStore = {
  issueJoin(input: IssueSessionJoinInput): Promise<IssueSessionJoinDecision>;
  recordMessage(input: RecordSessionMessageInput): Promise<RecordSessionMessageResult>;
  recordLeave(input: RecordSessionLeaveInput): Promise<RecordSessionLeaveResult>;
  prepareEnd(input: PrepareSessionEndInput): Promise<PrepareSessionEndResult>;
  completeEnd(input: CompleteSessionEndInput): Promise<CompleteSessionEndResult>;
  markEndOutcomeUnknown(input: MarkSessionEndOutcomeUnknownInput): Promise<void>;
  applyProviderEvent(input: ApplySessionProviderEventInput): Promise<ApplyProviderEventResult>;
};

export type GetSessionForActorInput = {
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly now: string;
};

export type ListSessionsForActorInput = {
  readonly actor: SessionActor;
  readonly rangeStartAt: string;
  readonly rangeEndAt: string;
  readonly now: string;
};

export type ListSessionMessagesInput = {
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly afterSequence: string;
  readonly limit: number;
};

export type ListSessionRealtimeEventsInput = {
  readonly actor: SessionActor;
  readonly sessionId: string;
  readonly afterEventId: string | undefined;
  readonly limit: number;
};

export type SessionReadStore = {
  getForActor(input: GetSessionForActorInput): Promise<SessionProjection | null>;
  listForActor(input: ListSessionsForActorInput): Promise<readonly SessionSummary[]>;
  listMessages(input: ListSessionMessagesInput): Promise<SessionMessagePage>;
  listRealtimeEvents(input: ListSessionRealtimeEventsInput): Promise<SessionRealtimeEventPage>;
};

export type MediaRoomProviderPort = {
  createJoinCredential(input: MediaRoomJoinInput): Promise<MediaRoomJoinCredential>;
  removeParticipant(input: MediaRoomParticipantCommand): Promise<MediaRoomCommandResult>;
  endRoom(input: MediaRoomEndCommand): Promise<MediaRoomCommandResult>;
  parseWebhook(input: MediaRoomWebhookInput): Promise<MediaRoomEvent>;
  readiness(): Promise<{ readonly ready: boolean; readonly code: string }>;
};
