import type {
  MessagingChannelMode,
  MessagingChannelStatus,
  MessagingMessageDirection,
  MessagingMessageMedia,
  MessagingMessageStatus,
  MessagingRealtimeEvent,
  MessagingProvider,
  MessagingThreadStatus
} from "./messaging-types";

export type MessagingReadChannelConnection = {
  readonly id: string;
  readonly provider: MessagingProvider;
  readonly mode: MessagingChannelMode;
  readonly status: MessagingChannelStatus;
  readonly displayName: string | null;
  readonly username: string | null;
  readonly capabilities: Record<string, boolean>;
  readonly connectedAt: string | null;
  readonly lastSyncedAt: string | null;
  readonly lastErrorCode: string | null;
};

export type MessagingReadExternalIdentity = {
  readonly id: string;
  readonly channelConnectionId: string;
  readonly provider: MessagingProvider;
  readonly providerUserId: string | null;
  readonly providerChatId: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly avatarMediaId: string | null;
  readonly linkedClientUserId: string | null;
  readonly linkStatus: "unlinked" | "suggested" | "linked" | "ignored";
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
};

export type MessagingReadMessage = {
  readonly id: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly externalIdentityId: string | null;
  readonly direction: MessagingMessageDirection;
  readonly senderKind: "client" | "astrologer" | "system";
  readonly contentType: "text" | "image" | "file" | "voice" | "video_note" | "video" | "unsupported";
  readonly text: string | null;
  readonly mediaAssetId: string | null;
  readonly media: MessagingMessageMedia | null;
  readonly status: MessagingMessageStatus;
  readonly failureCode: string | null;
  readonly providerSentAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MessagingReadMessageMediaSource = {
  readonly status: "pending" | "ready" | "failed";
  readonly mediaAssetId: string | null;
  readonly storageBucket: string | null;
  readonly storageKey: string | null;
  readonly originalFileName: string | null;
  readonly mimeType: string | null;
};

export type TelegramBusinessConnectionReconciliationCandidate = {
  readonly channelConnectionId: string;
  readonly businessConnectionId: string;
};

export type MessagingReadLinkedClient = {
  readonly userId: string;
  readonly displayName: string | null;
  readonly birthDate: string | null;
};

export type MessagingReadThread = {
  readonly id: string;
  readonly clientUserId: string | null;
  readonly linkedClient: MessagingReadLinkedClient | null;
  readonly status: MessagingThreadStatus;
  readonly primaryIdentity: MessagingReadExternalIdentity | null;
  readonly lastMessage: MessagingReadMessage | null;
  readonly lastMessageAt: string | null;
  readonly unreadCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MessagingReadStore = {
  readonly listChannelConnections: (input: {
    readonly astrologerUserId: string;
  }) => Promise<{ readonly channelConnections: readonly MessagingReadChannelConnection[] }>;
  readonly listTelegramBusinessConnectionReconciliationCandidates: (input: {
    readonly astrologerUserId: string;
  }) => Promise<{
    readonly candidates: readonly TelegramBusinessConnectionReconciliationCandidate[];
  }>;
  readonly listThreads: (input: {
    readonly astrologerUserId: string;
    readonly limit: number;
    readonly offset: number;
  }) => Promise<{
    readonly threads: readonly MessagingReadThread[];
    readonly nextCursor: string | null;
  }>;
  readonly getThread: (input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly limit?: number;
    readonly offset: number;
  }) => Promise<{
    readonly thread: MessagingReadThread;
    readonly messages: readonly MessagingReadMessage[];
    readonly nextCursor: string | null;
  } | null>;
  readonly findMessageMediaSource: (input: {
    readonly astrologerUserId: string;
    readonly messageId: string;
  }) => Promise<MessagingReadMessageMediaSource | null>;
  readonly listRealtimeEvents: (input: {
    readonly astrologerUserId: string;
    readonly afterEventId: string | undefined;
    readonly limit: number;
  }) => Promise<{
    readonly events: readonly (MessagingRealtimeEvent & { readonly astrologerUserId: string })[];
  }>;
};
