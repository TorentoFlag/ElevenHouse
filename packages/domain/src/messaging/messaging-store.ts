import type { MessagingMessageDeliveryRequestedEvent } from "./messaging-events";
import type {
  EncryptedMessagingSecret,
  MessagingMessage,
  MessagingMessageContentType,
  MessagingMessageWithRequestHash,
  MessagingRealtimeEvent,
  MessagingRealtimeEventDraft,
  MessagingThread,
  MessagingThreadExternalIdentity,
  TelegramBusinessMediaAttachment
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

export type StartTelegramBusinessConnectionStoreInput = {
  readonly connectionId: string;
  readonly astrologerUserId: string;
  readonly now: string;
};

export type StartTelegramBusinessConnectionStoreResult = {
  readonly connectionId: string;
};

export type StartInstagramGraphConnectionStoreInput = {
  readonly connectionId: string;
  readonly astrologerUserId: string;
  readonly now: string;
};

export type StartInstagramGraphConnectionStoreResult = {
  readonly connectionId: string;
};

export type CompleteInstagramGraphConnectionStoreInput = {
  readonly astrologerUserId: string;
  readonly connectionId: string;
  readonly pageId: string;
  readonly pageName: string | null;
  readonly instagramUserId: string;
  readonly instagramUsername: string | null;
  readonly instagramDisplayName: string | null;
  readonly encryptedUserAccessToken: EncryptedMessagingSecret;
  readonly encryptedPageAccessToken: EncryptedMessagingSecret;
  readonly tokenExpiresAt: string | null;
  readonly now: string;
};

export type CompleteInstagramGraphConnectionStoreResult = {
  readonly kind: "recorded" | "unmatched";
};

export type StartTelegramMtprotoConnectionStoreInput = {
  readonly connectionId: string;
  readonly astrologerUserId: string;
  readonly phoneNumberLast4: string;
  readonly maskedPhoneNumber: string;
  readonly encryptedPhoneNumber: EncryptedMessagingSecret;
  readonly encryptedPhoneCodeHash: EncryptedMessagingSecret;
  readonly consentAccepted: true;
  readonly now: string;
};

export type StartTelegramMtprotoConnectionStoreResult = {
  readonly connectionId: string;
  readonly loginStep: "code_required";
  readonly maskedPhoneNumber: string;
};

export type TelegramMtprotoLoginSession = {
  readonly connectionId: string;
  readonly loginState:
    | "code_required"
    | "password_required"
    | "authorized"
    | "reauth_required"
    | "revoked";
  readonly maskedPhoneNumber: string;
  readonly encryptedPhoneNumber: EncryptedMessagingSecret;
  readonly encryptedPhoneCodeHash: EncryptedMessagingSecret;
  readonly encryptedSession: EncryptedMessagingSecret | null;
};

export type RecordTelegramMtprotoCodeResultStoreInput = {
  readonly astrologerUserId: string;
  readonly connectionId: string;
  readonly loginStep: "password_required" | "connected";
  readonly encryptedSession: EncryptedMessagingSecret;
  readonly telegramUserId: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly now: string;
};

export type RecordTelegramMtprotoPasswordResultStoreInput = {
  readonly astrologerUserId: string;
  readonly connectionId: string;
  readonly encryptedSession: EncryptedMessagingSecret;
  readonly telegramUserId: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly now: string;
};

export type TelegramMtprotoLoginResultStoreResult = {
  readonly connectionId: string;
  readonly loginStep: "password_required" | "connected";
  readonly maskedPhoneNumber: string;
};

export type RecordTelegramBusinessMessageStoreInput = {
  readonly updateId: string;
  readonly businessConnectionId: string;
  readonly providerMessageId: string;
  readonly providerChatId: string;
  readonly providerUserId: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly chatUsername: string | null;
  readonly chatDisplayName: string | null;
  readonly contentType: MessagingMessageContentType;
  readonly text: string;
  readonly mediaAttachment?: TelegramBusinessMediaAttachment | undefined;
  readonly providerSentAt: string;
  readonly now: string;
};

export type TelegramMtprotoUpdateCursor = {
  readonly pts: number | null;
  readonly qts: number | null;
  readonly dateCursor: string | null;
  readonly seq: number | null;
};

export type RecordTelegramMtprotoMessageStoreInput = {
  readonly channelConnectionId: string;
  readonly leaseOwner: string;
  readonly providerMessageId: string;
  readonly providerChatId: string;
  readonly providerUserId: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly isOutgoing: boolean;
  readonly text: string;
  readonly providerSentAt: string;
  readonly cursor: TelegramMtprotoUpdateCursor | null;
  readonly now: string;
};

export type RecordTelegramBusinessDeletedMessagesStoreInput = {
  readonly businessConnectionId: string;
  readonly providerChatId: string;
  readonly providerMessageIds: readonly string[];
  readonly now: string;
};

export type RecordTelegramBusinessDeletedMessagesStoreResult =
  | {
      readonly kind: "recorded";
      readonly deletedCount: number;
    }
  | {
      readonly kind: "unmatched";
    };

export type RecordTelegramBusinessEditedMessageStoreInput = {
  readonly updateId: string;
  readonly businessConnectionId: string;
  readonly providerMessageId: string;
  readonly providerChatId: string;
  readonly text: string;
  readonly providerSentAt: string;
  readonly providerEditedAt: string;
  readonly now: string;
};

export type RecordTelegramBusinessEditedMessageStoreResult =
  | {
      readonly kind: "recorded";
      readonly updatedCount: number;
    }
  | {
      readonly kind: "unmatched";
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
  readonly startTelegramBusinessConnection: (
    input: StartTelegramBusinessConnectionStoreInput
  ) => Promise<StartTelegramBusinessConnectionStoreResult>;
  readonly startInstagramGraphConnection: (
    input: StartInstagramGraphConnectionStoreInput
  ) => Promise<StartInstagramGraphConnectionStoreResult>;
  readonly completeInstagramGraphConnection: (
    input: CompleteInstagramGraphConnectionStoreInput
  ) => Promise<CompleteInstagramGraphConnectionStoreResult>;
  readonly startTelegramMtprotoConnection: (
    input: StartTelegramMtprotoConnectionStoreInput
  ) => Promise<StartTelegramMtprotoConnectionStoreResult>;
  readonly findTelegramMtprotoLoginSession: (input: {
    readonly astrologerUserId: string;
    readonly connectionId: string;
  }) => Promise<TelegramMtprotoLoginSession | null>;
  readonly recordTelegramMtprotoCodeResult: (
    input: RecordTelegramMtprotoCodeResultStoreInput
  ) => Promise<TelegramMtprotoLoginResultStoreResult>;
  readonly recordTelegramMtprotoPasswordResult: (
    input: RecordTelegramMtprotoPasswordResultStoreInput
  ) => Promise<TelegramMtprotoLoginResultStoreResult>;
  readonly recordTelegramBusinessMessage: (
    input: RecordTelegramBusinessMessageStoreInput
  ) => Promise<InboundMessageRecordResult | { readonly kind: "unmatched" }>;
  readonly recordTelegramMtprotoMessage: (
    input: RecordTelegramMtprotoMessageStoreInput
  ) => Promise<InboundMessageRecordResult | { readonly kind: "unmatched" }>;
  readonly recordTelegramBusinessDeletedMessages: (
    input: RecordTelegramBusinessDeletedMessagesStoreInput
  ) => Promise<RecordTelegramBusinessDeletedMessagesStoreResult>;
  readonly recordTelegramBusinessEditedMessage: (
    input: RecordTelegramBusinessEditedMessageStoreInput
  ) => Promise<RecordTelegramBusinessEditedMessageStoreResult>;
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
