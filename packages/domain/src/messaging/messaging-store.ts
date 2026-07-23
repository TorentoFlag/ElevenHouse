import type { MessagingMessageDeliveryRequestedEvent } from "./messaging-events";
import type {
  MessagingMessage,
  MessagingMessageWithRequestHash,
  MessagingRealtimeEvent,
  MessagingRealtimeEventDraft,
  MessagingThread,
  MessagingThreadExternalIdentity
} from "./messaging-types";

export type CreateOutboundMessageStoreInput = {
  readonly messageId: string;
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
  readonly deliveryRequestedEvent: MessagingMessageDeliveryRequestedEvent;
};

export type RecordInboundProviderMessageStoreInput = {
  readonly messageId: string;
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly externalIdentityId: string;
  readonly providerMessageId: string;
  readonly text: string;
  readonly now: string;
  readonly receivedEvent: AppendMessagingRealtimeEventInput;
};

export type InboundMessageRecordResult = {
  readonly kind: "created" | "duplicate";
  readonly message: MessagingMessage;
};

export type TelegramBusinessConnectionRights = {
  readonly canReply: boolean;
  readonly canReadMessages: boolean;
  readonly canDeleteSentMessages: boolean;
  readonly canDeleteAllMessages: boolean;
  readonly canEditName: boolean;
  readonly canEditBio: boolean;
  readonly canEditProfilePhoto: boolean;
  readonly canEditUsername: boolean;
  readonly canChangeGiftSettings: boolean;
  readonly canViewGiftsAndStars: boolean;
  readonly canConvertGiftsToStars: boolean;
  readonly canTransferAndUpgradeGifts: boolean;
  readonly canTransferStars: boolean;
  readonly canManageStories: boolean;
};

export type RecordTelegramBusinessConnectionStoreInput = {
  readonly businessConnectionId: string;
  readonly userId: string;
  readonly userChatId: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly connectedAt: string;
  readonly enabled: boolean;
  readonly rights: TelegramBusinessConnectionRights;
  readonly now: string;
};

export type RecordTelegramBusinessConnectionStoreResult = {
  readonly kind: "recorded" | "unmatched";
};

export type RecordTelegramBusinessMessageStoreInput = {
  readonly updateId: string;
  readonly businessConnectionId: string;
  readonly providerMessageId: string;
  readonly providerChatId: string;
  readonly providerUserId: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly text: string;
  readonly providerSentAt: string;
  readonly now: string;
};

export type LinkThreadToClientStoreInput = {
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly clientUserId: string;
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
  readonly expiresAt: string;
};

export type CreateClientFromThreadStoreInput = {
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly displayName: string;
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
  readonly now: string;
  readonly expiresAt: string;
};

export type MarkThreadReadStoreInput = {
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly now: string;
  readonly realtimeEvent: MessagingRealtimeEventDraft;
};

export type MarkThreadReadStoreResult = {
  readonly thread: MessagingThread;
  readonly realtimeEvent: MessagingRealtimeEvent;
};

export type AppendMessagingRealtimeEventInput = MessagingRealtimeEventDraft;

export type MessagingStore = {
  readonly findThreadForAstrologer: (input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
  }) => Promise<MessagingThread | null>;
  readonly findExternalIdentityForThread: (input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly externalIdentityId: string;
  }) => Promise<MessagingThreadExternalIdentity | null>;
  readonly createOutboundMessage: (
    input: CreateOutboundMessageStoreInput
  ) => Promise<MessagingMessage>;
  readonly findOutboundMessageByIdempotencyKey: (input: {
    readonly threadId: string;
    readonly idempotencyKey: string;
  }) => Promise<MessagingMessageWithRequestHash | null>;
  readonly recordInboundProviderMessage: (
    input: RecordInboundProviderMessageStoreInput
  ) => Promise<InboundMessageRecordResult>;
  readonly recordTelegramBusinessConnection: (
    input: RecordTelegramBusinessConnectionStoreInput
  ) => Promise<RecordTelegramBusinessConnectionStoreResult>;
  readonly recordTelegramBusinessMessage: (
    input: RecordTelegramBusinessMessageStoreInput
  ) => Promise<InboundMessageRecordResult | { readonly kind: "unmatched" }>;
  readonly linkThreadToClient: (input: LinkThreadToClientStoreInput) => Promise<MessagingThread>;
  /** Atomically creates the manual client relationship and links the thread's primary identity. */
  readonly createClientFromThread: (
    input: CreateClientFromThreadStoreInput
  ) => Promise<MessagingThread>;
  /** Atomically persists the thread state transition and its durable realtime event. */
  readonly markThreadRead: (input: MarkThreadReadStoreInput) => Promise<MarkThreadReadStoreResult>;
  readonly appendRealtimeEvent: (
    input: AppendMessagingRealtimeEventInput
  ) => Promise<MessagingRealtimeEvent>;
};
