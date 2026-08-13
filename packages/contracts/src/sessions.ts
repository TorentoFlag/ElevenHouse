import { z } from "@elevenhouse/validation";

const UuidSchema = z.string().uuid();
const InstantSchema = z.string().datetime({ offset: true });
const SequenceSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);

export const SessionStateSchema = z.enum([
  "scheduled",
  "active",
  "ended",
  "cancelled",
  "expired"
]);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const SessionParticipantRoleSchema = z.enum(["astrologer", "client"]);
export type SessionParticipantRole = z.infer<typeof SessionParticipantRoleSchema>;

export const SessionEndReasonSchema = z.enum(["astrologer_ended", "participants_absent"]);
export type SessionEndReason = z.infer<typeof SessionEndReasonSchema>;

export const SessionBookingStateSchema = z.enum([
  "hold",
  "pending_payment",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "expired"
]);

export const SessionJoinPolicySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("allowed"), joinableAt: z.null() }),
  z.strictObject({ kind: z.literal("too_early"), joinableAt: InstantSchema }),
  z.strictObject({
    kind: z.literal("denied"),
    joinableAt: z.null(),
    reason: z.enum([
      "not_video_booking",
      "booking_not_confirmed",
      "relationship_blocked",
      "cancelled",
      "expired",
      "ended"
    ])
  })
]);
export type SessionJoinPolicy = z.infer<typeof SessionJoinPolicySchema>;

export const SessionParticipantSchema = z.strictObject({
  role: SessionParticipantRoleSchema,
  displayName: z.string().trim().min(1).max(200),
  firstJoinedAt: InstantSchema.nullable(),
  lastJoinedAt: InstantSchema.nullable(),
  isPresent: z.boolean()
});
export type SessionParticipant = z.infer<typeof SessionParticipantSchema>;

const SessionShape = {
    schemaVersion: z.literal("session.v1"),
    id: UuidSchema,
    bookingId: UuidSchema,
    state: SessionStateSchema,
    lifecycleRevision: z.number().int().positive(),
    bookingState: SessionBookingStateSchema,
    productTitle: z.string().trim().min(1).max(200),
    scheduledStartAt: InstantSchema,
    scheduledEndAt: InstantSchema,
    timeZone: z.string().trim().min(1).max(100),
    startedAt: InstantSchema.nullable(),
    endedAt: InstantSchema.nullable(),
    endReason: SessionEndReasonSchema.nullable(),
    joinPolicy: SessionJoinPolicySchema,
    currentParticipantRole: SessionParticipantRoleSchema,
    participants: z.array(SessionParticipantSchema).length(2),
    latestMessageSequence: SequenceSchema,
    createdAt: InstantSchema,
    updatedAt: InstantSchema
  } as const;

export const SessionSchema = z
  .strictObject(SessionShape)
  .superRefine((session, context) => {
    const roles = new Set(session.participants.map((participant) => participant.role));
    if (roles.size !== 2 || !roles.has("astrologer") || !roles.has("client")) {
      context.addIssue({
        code: "custom",
        message: "Session requires one astrologer and one client participant",
        path: ["participants"]
      });
    }
    if (Date.parse(session.scheduledStartAt) >= Date.parse(session.scheduledEndAt)) {
      context.addIssue({
        code: "custom",
        message: "Session schedule range is invalid",
        path: ["scheduledEndAt"]
      });
    }
    if (session.state === "scheduled" && session.startedAt !== null) {
      context.addIssue({ code: "custom", message: "Scheduled Session cannot be started", path: ["startedAt"] });
    }
    if (session.state === "active" && (session.startedAt === null || session.endedAt !== null)) {
      context.addIssue({ code: "custom", message: "Active Session evidence is invalid", path: ["state"] });
    }
    if (
      session.state === "ended" &&
      (session.startedAt === null || session.endedAt === null || session.endReason === null)
    ) {
      context.addIssue({ code: "custom", message: "Ended Session evidence is invalid", path: ["state"] });
    }
    if (session.state !== "ended" && session.endReason !== null) {
      context.addIssue({ code: "custom", message: "Only ended Sessions have an end reason", path: ["endReason"] });
    }
  });
export type Session = z.infer<typeof SessionSchema>;

export const SessionResponseSchema = z.strictObject({ session: SessionSchema });
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const SessionSummarySchema = z.strictObject(SessionShape).pick({
  id: true,
  bookingId: true,
  state: true,
  bookingState: true,
  productTitle: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  timeZone: true,
  startedAt: true,
  endedAt: true,
  currentParticipantRole: true,
  participants: true
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionListResponseSchema = z.strictObject({
  sessions: z.array(SessionSummarySchema).max(500)
});
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

export const SessionJoinCredentialResponseSchema = z.strictObject({
  schemaVersion: z.literal("session-join-credential.v1"),
  sessionId: UuidSchema,
  serverUrl: z.string().url().refine((value) => value.startsWith("wss://"), {
    message: "Session media server URL must use wss"
  }),
  participantToken: z.string().min(20).max(8_192),
  expiresAt: InstantSchema,
  participant: z.strictObject({
    id: UuidSchema,
    role: SessionParticipantRoleSchema,
    displayName: z.string().trim().min(1).max(200)
  }),
  grants: z.strictObject({
    canPublishAudio: z.literal(true),
    canPublishVideo: z.literal(true),
    canPublishScreenShare: z.literal(true),
    canSubscribe: z.literal(true)
  })
});
export type SessionJoinCredentialResponse = z.infer<
  typeof SessionJoinCredentialResponseSchema
>;

export const SessionMessageSchema = z.strictObject({
  id: UuidSchema,
  sessionId: UuidSchema,
  sequence: SequenceSchema,
  operationId: UuidSchema,
  senderRole: SessionParticipantRoleSchema,
  text: z.string().min(1).refine((value) => Array.from(value).length <= 4_000),
  createdAt: InstantSchema
});
export type SessionMessage = z.infer<typeof SessionMessageSchema>;

export const SessionMessageResponseSchema = z.strictObject({
  message: SessionMessageSchema,
  replayed: z.boolean()
});
export type SessionMessageResponse = z.infer<typeof SessionMessageResponseSchema>;

export const SessionMessagePageSchema = z.strictObject({
  messages: z.array(SessionMessageSchema).max(100),
  nextAfterSequence: SequenceSchema.nullable()
});
export type SessionMessagePage = z.infer<typeof SessionMessagePageSchema>;

export const SessionRealtimeEventSchema = z
  .strictObject({
    eventId: SequenceSchema,
    sessionId: UuidSchema,
    type: z.enum(["session.updated", "message.created"]),
    occurredAt: InstantSchema,
    messageId: UuidSchema.nullable(),
    state: SessionStateSchema.nullable()
  })
  .superRefine((event, context) => {
    if (event.type === "message.created" && event.messageId === null) {
      context.addIssue({ code: "custom", message: "Message event requires message id", path: ["messageId"] });
    }
    if (event.type === "session.updated" && event.state === null) {
      context.addIssue({ code: "custom", message: "Session event requires state", path: ["state"] });
    }
  });
export type SessionRealtimeEvent = z.infer<typeof SessionRealtimeEventSchema>;

export const SendSessionMessageBodySchema = z.strictObject({
  operationId: UuidSchema,
  text: z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= 4_000, {
      message: "Session message exceeds 4,000 Unicode code points"
    })
});
export type SendSessionMessageBody = z.infer<typeof SendSessionMessageBodySchema>;

export const LeaveSessionBodySchema = z.strictObject({ operationId: UuidSchema });
export type LeaveSessionBody = z.infer<typeof LeaveSessionBodySchema>;

export const EndSessionBodySchema = z.strictObject({ operationId: UuidSchema });
export type EndSessionBody = z.infer<typeof EndSessionBodySchema>;

export const SessionParamsSchema = z.strictObject({ sessionId: UuidSchema });
export type SessionParams = z.infer<typeof SessionParamsSchema>;

export const SessionMessageListQuerySchema = z.strictObject({
  afterSequence: SequenceSchema.default("0"),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
export type SessionMessageListQuery = z.infer<typeof SessionMessageListQuerySchema>;

export const SessionRangeQuerySchema = z
  .strictObject({ rangeStartAt: InstantSchema, rangeEndAt: InstantSchema })
  .refine((value) => Date.parse(value.rangeStartAt) < Date.parse(value.rangeEndAt), {
    message: "Session range is invalid",
    path: ["rangeEndAt"]
  });
export type SessionRangeQuery = z.infer<typeof SessionRangeQuerySchema>;

export const SessionRealtimeEventListQuerySchema = z.strictObject({
  afterEventId: SequenceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
export const SessionRealtimeEventPageSchema = z.strictObject({
  events: z.array(SessionRealtimeEventSchema).max(100)
});
