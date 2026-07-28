import { z } from "@elevenhouse/validation";

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true });
const NullableSnapshotSchema = z.string().trim().min(1).max(200).nullable();

export const MessagingProviderSchema = z.enum(["telegram", "instagram"]);
export type MessagingProvider = z.infer<typeof MessagingProviderSchema>;

export const MessagingChannelModeSchema = z.enum([
  "telegram_business_bot",
  "telegram_mtproto_account",
  "instagram_graph"
]);
export type MessagingChannelMode = z.infer<typeof MessagingChannelModeSchema>;

export const MessagingChannelConnectionStatusSchema = z.enum([
  "connecting",
  "active",
  "paused",
  "revoked",
  "reauth_required",
  "error"
]);
export type MessagingChannelConnectionStatus = z.infer<
  typeof MessagingChannelConnectionStatusSchema
>;

export const MessagingChannelCapabilitiesSchema = z.strictObject({
  canSend: z.boolean(),
  canReceive: z.boolean(),
  canRead: z.boolean(),
  supportsHistoryImport: z.boolean(),
  supportsMessageEdits: z.boolean(),
  supportsMessageDeletes: z.boolean(),
  supportsAttachments: z.boolean()
});
export type MessagingChannelCapabilities = z.infer<typeof MessagingChannelCapabilitiesSchema>;

export const MessagingChannelConnectionSchema = z.strictObject({
  id: UuidSchema,
  provider: MessagingProviderSchema,
  mode: MessagingChannelModeSchema,
  status: MessagingChannelConnectionStatusSchema,
  displayName: NullableSnapshotSchema,
  username: NullableSnapshotSchema,
  capabilities: MessagingChannelCapabilitiesSchema,
  connectedAt: TimestampSchema.nullable(),
  lastSyncedAt: TimestampSchema.nullable(),
  lastErrorCode: z.string().trim().min(1).max(100).nullable()
});
export type MessagingChannelConnection = z.infer<typeof MessagingChannelConnectionSchema>;

export const MessagingChannelConnectionResponseSchema = z.strictObject({
  channelConnections: z.array(MessagingChannelConnectionSchema).max(100)
});
export type MessagingChannelConnectionResponse = z.infer<
  typeof MessagingChannelConnectionResponseSchema
>;

export const StartTelegramBusinessConnectionResponseSchema = z.strictObject({
  channelConnection: MessagingChannelConnectionSchema,
  telegramBotUsername: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{5,32}$/)
    .nullable(),
  telegramBotUrl: z.string().trim().url().nullable()
});
export type StartTelegramBusinessConnectionResponse = z.infer<
  typeof StartTelegramBusinessConnectionResponseSchema
>;

export const StartInstagramGraphConnectionResponseSchema = z.strictObject({
  channelConnection: MessagingChannelConnectionSchema,
  authorizationUrl: z.string().trim().url()
});
export type StartInstagramGraphConnectionResponse = z.infer<
  typeof StartInstagramGraphConnectionResponseSchema
>;

export const StartTelegramMtprotoConnectionRequestSchema = z.strictObject({
  phoneNumber: z
    .string()
    .trim()
    .min(5)
    .max(32)
    .regex(/^\+?[0-9][0-9\s().-]{4,31}$/),
  consentAccepted: z.literal(true)
});
export type StartTelegramMtprotoConnectionRequest = z.infer<
  typeof StartTelegramMtprotoConnectionRequestSchema
>;

export const SubmitTelegramMtprotoCodeRequestSchema = z.strictObject({
  channelConnectionId: UuidSchema,
  code: z.string().trim().min(1).max(32)
});
export type SubmitTelegramMtprotoCodeRequest = z.infer<
  typeof SubmitTelegramMtprotoCodeRequestSchema
>;

export const SubmitTelegramMtprotoPasswordRequestSchema = z.strictObject({
  channelConnectionId: UuidSchema,
  password: z.string().min(1).max(256)
});
export type SubmitTelegramMtprotoPasswordRequest = z.infer<
  typeof SubmitTelegramMtprotoPasswordRequestSchema
>;

export const TelegramMtprotoLoginStepSchema = z.enum([
  "code_required",
  "password_required",
  "connected"
]);
export type TelegramMtprotoLoginStep = z.infer<typeof TelegramMtprotoLoginStepSchema>;

export const TelegramMtprotoLoginResponseSchema = z.strictObject({
  channelConnection: MessagingChannelConnectionSchema,
  loginStep: TelegramMtprotoLoginStepSchema,
  maskedPhoneNumber: z.string().trim().min(3).max(32),
  retryAfterSeconds: z.number().int().positive().nullable()
});
export type TelegramMtprotoLoginResponse = z.infer<typeof TelegramMtprotoLoginResponseSchema>;

export const MessagingExternalIdentityLinkStatusSchema = z.enum([
  "unlinked",
  "suggested",
  "linked",
  "ignored"
]);
export type MessagingExternalIdentityLinkStatus = z.infer<
  typeof MessagingExternalIdentityLinkStatusSchema
>;

export const MessagingExternalIdentitySchema = z.strictObject({
  id: UuidSchema,
  channelConnectionId: UuidSchema,
  provider: MessagingProviderSchema,
  providerUserId: z.string().trim().min(1).max(200).nullable(),
  providerChatId: z.string().trim().min(1).max(200),
  username: NullableSnapshotSchema,
  displayName: NullableSnapshotSchema,
  avatarMediaId: UuidSchema.nullable(),
  linkedClientUserId: UuidSchema.nullable(),
  linkStatus: MessagingExternalIdentityLinkStatusSchema,
  firstSeenAt: TimestampSchema,
  lastSeenAt: TimestampSchema
});
export type MessagingExternalIdentity = z.infer<typeof MessagingExternalIdentitySchema>;

export const MessagingExternalIdentityResponseSchema = z.strictObject({
  externalIdentity: MessagingExternalIdentitySchema
});
export type MessagingExternalIdentityResponse = z.infer<
  typeof MessagingExternalIdentityResponseSchema
>;

export const MessagingThreadStatusSchema = z.enum(["open", "archived", "blocked"]);
export type MessagingThreadStatus = z.infer<typeof MessagingThreadStatusSchema>;

export const MessagingMessageDirectionSchema = z.enum(["inbound", "outbound"]);
export type MessagingMessageDirection = z.infer<typeof MessagingMessageDirectionSchema>;

export const MessagingMessageSenderKindSchema = z.enum(["client", "astrologer", "system"]);
export type MessagingMessageSenderKind = z.infer<typeof MessagingMessageSenderKindSchema>;

export const MessagingMessageContentTypeSchema = z.enum([
  "text",
  "image",
  "file",
  "voice",
  "video_note",
  "video",
  "unsupported"
]);
export type MessagingMessageContentType = z.infer<typeof MessagingMessageContentTypeSchema>;

export const MessagingMessageStatusSchema = z.enum([
  "received",
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "unknown",
  "deleted"
]);
export type MessagingMessageStatus = z.infer<typeof MessagingMessageStatusSchema>;

export const MessagingMessageMediaSchema = z.strictObject({
  mediaAssetId: UuidSchema.nullable(),
  kind: z.enum(["voice", "image", "video_note", "video"]),
  status: z.enum(["pending", "ready", "failed"]),
  durationSeconds: z.number().int().nonnegative().nullable(),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  mimeType: z.string().trim().min(1).max(100).nullable(),
  sizeBytes: z.number().int().nonnegative().nullable()
});
export type MessagingMessageMedia = z.infer<typeof MessagingMessageMediaSchema>;

export const MessagingMessageSchema = z.strictObject({
  id: UuidSchema,
  threadId: UuidSchema,
  channelConnectionId: UuidSchema,
  externalIdentityId: UuidSchema.nullable(),
  direction: MessagingMessageDirectionSchema,
  senderKind: MessagingMessageSenderKindSchema,
  contentType: MessagingMessageContentTypeSchema,
  text: z.string().max(4_000).nullable(),
  mediaAssetId: UuidSchema.nullable(),
  media: MessagingMessageMediaSchema.nullable().default(null),
  status: MessagingMessageStatusSchema,
  failureCode: z.string().trim().min(1).max(100).nullable(),
  providerSentAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});
export type MessagingMessage = z.infer<typeof MessagingMessageSchema>;

export const MessagingThreadSchema = z.strictObject({
  id: UuidSchema,
  clientUserId: UuidSchema.nullable(),
  status: MessagingThreadStatusSchema,
  primaryIdentity: MessagingExternalIdentitySchema.nullable(),
  lastMessage: MessagingMessageSchema.nullable(),
  lastMessageAt: TimestampSchema.nullable(),
  unreadCount: z.number().int().min(0),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});
export type MessagingThread = z.infer<typeof MessagingThreadSchema>;

export const MessagingThreadListResponseSchema = z.strictObject({
  threads: z.array(MessagingThreadSchema).max(100),
  nextCursor: z.string().trim().min(1).max(200).nullable()
});
export type MessagingThreadListResponse = z.infer<typeof MessagingThreadListResponseSchema>;

export const MessagingThreadResponseSchema = z.strictObject({
  thread: MessagingThreadSchema,
  messages: z.array(MessagingMessageSchema),
  nextCursor: z.string().trim().min(1).max(200).nullable()
});
export type MessagingThreadResponse = z.infer<typeof MessagingThreadResponseSchema>;

export const MessagingThreadParamsSchema = z.strictObject({
  threadId: UuidSchema
});
export type MessagingThreadParams = z.infer<typeof MessagingThreadParamsSchema>;

const MessagingPaginationQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

export const MessagingThreadListQuerySchema = MessagingPaginationQuerySchema;
export type MessagingThreadListQuery = z.infer<typeof MessagingThreadListQuerySchema>;

export const MessagingThreadDetailQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});
export type MessagingThreadDetailQuery = z.infer<typeof MessagingThreadDetailQuerySchema>;

export const MessagingMessageResponseSchema = z.strictObject({
  message: MessagingMessageSchema
});
export type MessagingMessageResponse = z.infer<typeof MessagingMessageResponseSchema>;

export const MessagingMessageMediaSourceResponseSchema = z.strictObject({
  url: z.string().trim().url(),
  expiresAt: TimestampSchema,
  mimeType: z.string().trim().min(1).max(100)
});
export type MessagingMessageMediaSourceResponse = z.infer<
  typeof MessagingMessageMediaSourceResponseSchema
>;

export const SendMessagingMessageRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(4_000),
  channelConnectionId: UuidSchema.optional()
});
export type SendMessagingMessageRequest = z.infer<typeof SendMessagingMessageRequestSchema>;

export const LinkMessagingThreadClientRequestSchema = z.strictObject({
  clientUserId: UuidSchema
});
export type LinkMessagingThreadClientRequest = z.infer<
  typeof LinkMessagingThreadClientRequestSchema
>;

export const CreateMessagingThreadClientRequestSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(200)
});
export type CreateMessagingThreadClientRequest = z.infer<
  typeof CreateMessagingThreadClientRequestSchema
>;

export const MessagingThreadMutationResponseSchema = z.strictObject({
  thread: MessagingThreadSchema
});
export type MessagingThreadMutationResponse = z.infer<typeof MessagingThreadMutationResponseSchema>;

export const MessagingThreadClientLinkResponseSchema = z.strictObject({
  thread: MessagingThreadSchema,
  clientUserId: UuidSchema
});
export type MessagingThreadClientLinkResponse = z.infer<
  typeof MessagingThreadClientLinkResponseSchema
>;

export const MessagingRealtimeEventTypeSchema = z.enum([
  "thread.created",
  "thread.updated",
  "message.received",
  "message.updated",
  "message.deleted",
  "channelConnection.updated",
  "identity.linked",
  "delivery.failed"
]);
export type MessagingRealtimeEventType = z.infer<typeof MessagingRealtimeEventTypeSchema>;

export const MessagingRealtimeEventSchema = z.strictObject({
  eventId: z.string().trim().min(1).max(200),
  type: MessagingRealtimeEventTypeSchema,
  occurredAt: TimestampSchema,
  threadId: UuidSchema.optional(),
  messageId: UuidSchema.optional(),
  channelConnectionId: UuidSchema.optional(),
  externalIdentityId: UuidSchema.optional()
});
export type MessagingRealtimeEvent = z.infer<typeof MessagingRealtimeEventSchema>;

export const TelegramBusinessWebhookAcceptedResponseSchema = z.strictObject({
  accepted: z.literal(true)
});
export type TelegramBusinessWebhookAcceptedResponse = z.infer<
  typeof TelegramBusinessWebhookAcceptedResponseSchema
>;
