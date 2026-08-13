import type { BookingState } from "../bookings/booking-types";

export type SessionState = "scheduled" | "active" | "ended" | "cancelled" | "expired";
export type SessionParticipantRole = "astrologer" | "client";
export type SessionEndReason = "astrologer_ended" | "participants_absent";
export type SessionRelationshipStatus = "active" | "archived" | "blocked";

export type SessionActor = {
  readonly userId: string;
  readonly role: SessionParticipantRole;
};

export type SessionParticipantProjection = {
  readonly role: SessionParticipantRole;
  readonly displayName: string;
  readonly firstJoinedAt: string | null;
  readonly lastJoinedAt: string | null;
  readonly isPresent: boolean;
};

export type SessionProjection = {
  readonly id: string;
  readonly bookingId: string;
  readonly state: SessionState;
  readonly lifecycleRevision: number;
  readonly bookingState: BookingState;
  readonly productTitle: string;
  readonly scheduledStartAt: string;
  readonly scheduledEndAt: string;
  readonly timeZone: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly endReason: SessionEndReason | null;
  readonly currentParticipantRole: SessionParticipantRole;
  readonly participants: readonly SessionParticipantProjection[];
  readonly latestMessageSequence: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SessionSummary = Pick<
  SessionProjection,
  | "id"
  | "bookingId"
  | "state"
  | "bookingState"
  | "productTitle"
  | "scheduledStartAt"
  | "scheduledEndAt"
  | "timeZone"
  | "startedAt"
  | "endedAt"
  | "currentParticipantRole"
  | "participants"
>;

export type SessionMessage = {
  readonly id: string;
  readonly sessionId: string;
  readonly sequence: string;
  readonly operationId: string;
  readonly senderRole: SessionParticipantRole;
  readonly text: string;
  readonly createdAt: string;
};

export type SessionRealtimeEventType = "session.updated" | "message.created";

export type SessionRealtimeEvent = {
  readonly eventId: string;
  readonly sessionId: string;
  readonly type: SessionRealtimeEventType;
  readonly occurredAt: string;
  readonly messageId: string | null;
  readonly state: SessionState | null;
};

export type SessionMessagePage = {
  readonly messages: readonly SessionMessage[];
  readonly nextAfterSequence: string | null;
};

export type SessionRealtimeEventPage = {
  readonly events: readonly SessionRealtimeEvent[];
};

export type MediaRoomJoinInput = {
  readonly sessionId: string;
  readonly roomName: string;
  readonly participantId: string;
  readonly participantName: string;
  readonly participantRole: SessionParticipantRole;
  readonly issuedAt: string;
  readonly ttlSeconds: 300;
};

export type MediaRoomJoinCredential = {
  readonly serverUrl: string;
  readonly participantToken: string;
  readonly expiresAt: string;
};

export type MediaRoomParticipantCommand = {
  readonly commandId: string;
  readonly roomName: string;
  readonly participantId: string;
};

export type MediaRoomEndCommand = {
  readonly commandId: string;
  readonly roomName: string;
};

export type MediaRoomCommandResult =
  | { readonly kind: "applied" }
  | { readonly kind: "already_applied" }
  | { readonly kind: "outcome_unknown"; readonly safeCode: string };

export type MediaRoomWebhookInput = {
  readonly authorization: string;
  readonly rawBody: string;
};

export type MediaRoomEvent = {
  readonly id: string;
  readonly kind:
    | "participant_joined"
    | "participant_left"
    | "room_started"
    | "room_finished";
  readonly roomName: string;
  readonly participantId?: string;
  readonly occurredAt: string;
};
