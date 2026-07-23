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
export type MessagingRealtimeEventType =
  | "thread.created"
  | "thread.updated"
  | "message.received"
  | "message.updated"
  | "message.deleted"
  | "channelConnection.updated"
  | "identity.linked"
  | "delivery.failed";

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
