export type MessagingProvider = "telegram" | "instagram";

export type MessagingChannelMode =
  | "telegram_business_bot"
  | "telegram_mtproto_account"
  | "instagram_graph";

export type MessagingChannelStatus =
  | "connecting"
  | "active"
  | "paused"
  | "revoked"
  | "reauth_required"
  | "error";

export type MessagingThreadStatus = "open" | "archived" | "blocked";
export type MessagingMessageDirection = "inbound" | "outbound";
export type MessagingMessageContentType =
  | "text"
  | "image"
  | "file"
  | "voice"
  | "video_note"
  | "video"
  | "unsupported";
export type MessagingMessageStatus =
  | "received"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "unknown"
  | "deleted";
export type MessagingMediaIngestionStatus =
  | "pending"
  | "downloading"
  | "ready"
  | "failed"
  | "permanent_failed";
export type MessagingRealtimeEventType =
  | "thread.created"
  | "thread.updated"
  | "message.received"
  | "message.updated"
  | "message.deleted"
  | "channelConnection.updated"
  | "identity.linked"
  | "delivery.failed";

export type EncryptedMessagingSecret = {
  readonly algorithm: "aes-256-gcm";
  readonly keyId: string;
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
};

export type TelegramMtprotoLoginStep = "code_required" | "password_required" | "connected";

export type MessagingThreadExternalIdentity = {
  readonly id: string;
  readonly channelConnectionId: string;
};

export type MessagingThread = {
  readonly id: string;
  readonly astrologerUserId: string;
  readonly clientUserId: string | null;
  readonly channelConnectionId: string;
  readonly externalIdentityId: string | null;
  readonly status: MessagingThreadStatus;
  readonly lastMessageAt: string | null;
  readonly unreadAstrologerCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MessagingMessage = {
  readonly id: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly externalIdentityId: string | null;
  readonly direction: MessagingMessageDirection;
  readonly text: string;
  readonly status: MessagingMessageStatus;
  readonly providerMessageId: string | null;
  readonly idempotencyKey: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MessagingMessageMedia = {
  readonly mediaAssetId: string | null;
  readonly kind: "voice" | "image" | "video_note" | "video";
  readonly status: "pending" | "ready" | "failed";
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
};

export type TelegramBusinessMediaAttachment = {
  readonly kind: "voice" | "image" | "video_note" | "video";
  readonly providerFileId: string;
  readonly providerFileUniqueId: string;
  readonly durationSeconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly providerMimeType: string | null;
  readonly providerSizeBytes: number | null;
};

export type TelegramBusinessVoiceAttachment = TelegramBusinessMediaAttachment & {
  readonly kind: "voice";
  readonly durationSeconds: number;
};

export type MessagingMessageWithRequestHash = MessagingMessage & {
  readonly requestHash: `sha256:${string}`;
};

export type MessagingOutboxEvent<TPayload extends Record<string, string>> = {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly payload: TPayload;
};

export type MessagingRealtimeEvent = {
  readonly eventId: string;
  readonly astrologerUserId: string;
  readonly type: MessagingRealtimeEventType;
  readonly occurredAt: string;
  readonly threadId: string | undefined;
  readonly messageId: string | undefined;
  readonly channelConnectionId: string | undefined;
  readonly externalIdentityId: string | undefined;
};

export type MessagingRealtimeEventDraft = Omit<MessagingRealtimeEvent, "eventId">;

export type NormalizedSendMessageInput = {
  readonly threadId: string;
  readonly channelConnectionId: string | undefined;
  readonly text: string;
  readonly idempotencyKey: string;
};
