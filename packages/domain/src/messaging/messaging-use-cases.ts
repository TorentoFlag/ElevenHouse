import { createHash, randomUUID } from "node:crypto";
import {
  MessagingIdempotencyConflictError,
  MessagingThreadNotFoundError,
  MessagingValidationError
} from "./messaging-errors";
import {
  messagingMessageDeliveryRequestedEventType,
  messagingMessageReceivedEventType,
  messagingRealtimeEventTypes,
  messagingThreadUpdatedEventType,
  type MessagingMessageDeliveryRequestedEvent
} from "./messaging-events";
import type {
  InboundMessageRecordResult,
  MessagingStore,
  TelegramMtprotoLoginSession,
  TelegramMtprotoLoginResultStoreResult,
  RecordTelegramBusinessConnectionStoreResult,
  CompleteInstagramGraphConnectionStoreResult,
  TelegramBusinessConnectionRights
} from "./messaging-store";
import type {
  EncryptedMessagingSecret,
  MessagingMessage,
  MessagingMessageContentType,
  MessagingRealtimeEvent,
  MessagingRealtimeEventDraft,
  MessagingRealtimeEventType,
  MessagingThread,
  NormalizedSendMessageInput,
  TelegramBusinessMediaAttachment
} from "./messaging-types";

export function normalizeSendMessageInput(input: {
  readonly threadId: string;
  readonly channelConnectionId?: string | null;
  readonly text: string;
  readonly idempotencyKey: string;
}): NormalizedSendMessageInput {
  return {
    threadId: required(input.threadId, "Messaging thread id is required"),
    channelConnectionId: optional(input.channelConnectionId),
    text: bounded(input.text, 1, 4000, "Message text is invalid"),
    idempotencyKey: idempotencyKey(input.idempotencyKey)
  };
}

export async function createOutboundMessage(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly channelConnectionId?: string | null;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly idGenerator?: () => string;
  readonly now: Date;
}): Promise<{ readonly message: MessagingMessage; readonly replayed: boolean }> {
  const astrologerUserId = required(input.astrologerUserId, "Astrologer user id is required");
  const command = normalizeSendMessageInput(input);
  const thread = await requireThread(input.store, astrologerUserId, command.threadId);
  const channelConnectionId = resolveChannelConnectionId(thread, command.channelConnectionId);
  const requestHash = hashRequest({ threadId: thread.id, channelConnectionId, text: command.text });
  const existing = await input.store.findOutboundMessageByIdempotencyKey({
    threadId: thread.id,
    idempotencyKey: command.idempotencyKey
  });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new MessagingIdempotencyConflictError();
    return { message: existing, replayed: true };
  }

  const now = input.now.toISOString();
  const messageId = identifier(input.idGenerator?.() ?? randomUUID(), "Message id is required");
  const deliveryRequestedEvent = createDeliveryRequestedEvent({
    id: identifier(input.idGenerator?.() ?? randomUUID(), "Event id is required"),
    messageId,
    threadId: thread.id,
    channelConnectionId,
    astrologerUserId,
    occurredAt: now
  });
  const message = await input.store.createOutboundMessage({
    messageId,
    astrologerUserId,
    threadId: thread.id,
    channelConnectionId,
    text: command.text,
    idempotencyKey: command.idempotencyKey,
    requestHash,
    now,
    deliveryRequestedEvent
  });
  return { message, replayed: false };
}

export async function recordInboundProviderMessage(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly externalIdentityId: string;
  readonly providerMessageId: string;
  readonly text: string;
  readonly idGenerator?: () => string;
  readonly now: Date;
}): Promise<{ readonly message: MessagingMessage; readonly duplicate: boolean }> {
  const astrologerUserId = required(input.astrologerUserId, "Astrologer user id is required");
  const thread = await requireThread(input.store, astrologerUserId, input.threadId);
  const externalIdentity = await requireThreadExternalIdentity(input.store, {
    astrologerUserId,
    threadId: thread.id,
    externalIdentityId: required(input.externalIdentityId, "External identity id is required")
  });
  const channelConnectionId = resolveChannelConnectionId(thread, input.channelConnectionId);
  if (externalIdentity.channelConnectionId !== channelConnectionId) {
    throw new MessagingValidationError("External identity does not belong to the messaging thread");
  }
  const now = input.now.toISOString();
  const messageId = identifier(input.idGenerator?.() ?? randomUUID(), "Message id is required");
  const result = await input.store.recordInboundProviderMessage({
    messageId,
    astrologerUserId,
    threadId: thread.id,
    channelConnectionId,
    externalIdentityId: externalIdentity.id,
    providerMessageId: required(input.providerMessageId, "Provider message id is required"),
    text: bounded(input.text, 1, 4000, "Message text is invalid"),
    now,
    receivedEvent: normalizeRealtimeEventDraft({
      astrologerUserId,
      type: messagingMessageReceivedEventType,
      occurredAt: now,
      threadId: thread.id,
      messageId,
      channelConnectionId,
      externalIdentityId: externalIdentity.id
    })
  });
  return { message: result.message, duplicate: result.kind === "duplicate" };
}

export async function recordTelegramBusinessConnection(input: {
  readonly store: MessagingStore;
  readonly businessConnectionId: string;
  readonly userId: string;
  readonly userChatId: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly connectedAt: string;
  readonly enabled: boolean;
  readonly rights: TelegramBusinessConnectionRights;
  readonly now: Date;
}): Promise<RecordTelegramBusinessConnectionStoreResult> {
  return input.store.recordTelegramBusinessConnection({
    businessConnectionId: bounded(
      input.businessConnectionId,
      1,
      200,
      "Telegram business connection id is required"
    ),
    userId: bounded(input.userId, 1, 200, "Telegram business user id is required"),
    userChatId: bounded(input.userChatId, 1, 200, "Telegram business user chat id is required"),
    username: optionalSnapshot(input.username),
    displayName: optionalSnapshot(input.displayName),
    connectedAt: normalizeIsoInstant(input.connectedAt),
    enabled: input.enabled,
    rights: input.rights,
    now: input.now.toISOString()
  });
}

export async function bindTelegramBusinessConnectionUser(input: {
  readonly store: MessagingStore;
  readonly connectionId: string;
  readonly telegramUserId: string;
  readonly userChatId: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly now: Date;
}): Promise<RecordTelegramBusinessConnectionStoreResult> {
  return input.store.bindTelegramBusinessConnectionUser({
    connectionId: identifier(input.connectionId, "Channel connection id is required"),
    telegramUserId: bounded(input.telegramUserId, 1, 200, "Telegram user id is required"),
    userChatId: bounded(input.userChatId, 1, 200, "Telegram user chat id is required"),
    username: optionalSnapshot(input.username),
    displayName: optionalSnapshot(input.displayName),
    now: input.now.toISOString()
  });
}

export async function startTelegramBusinessConnection(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly idGenerator?: () => string;
  readonly now: Date;
}): Promise<{ readonly connectionId: string }> {
  return input.store.startTelegramBusinessConnection({
    connectionId: identifier(
      input.idGenerator?.() ?? randomUUID(),
      "Channel connection id is required"
    ),
    astrologerUserId: required(input.astrologerUserId, "Astrologer user id is required"),
    now: input.now.toISOString()
  });
}

export async function startInstagramGraphConnection(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly idGenerator?: () => string;
  readonly now: Date;
}): Promise<{ readonly connectionId: string }> {
  return input.store.startInstagramGraphConnection({
    connectionId: identifier(
      input.idGenerator?.() ?? randomUUID(),
      "Channel connection id is required"
    ),
    astrologerUserId: required(input.astrologerUserId, "Astrologer user id is required"),
    now: input.now.toISOString()
  });
}

export async function completeInstagramGraphConnection(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly connectionId: string;
  readonly instagramAccountId: string;
  readonly instagramUserId: string;
  readonly instagramUsername: string | null;
  readonly instagramDisplayName: string | null;
  readonly encryptedAccessToken: EncryptedMessagingSecret;
  readonly tokenExpiresAt: string | null;
  readonly now: Date;
}): Promise<CompleteInstagramGraphConnectionStoreResult> {
  return input.store.completeInstagramGraphConnection({
    astrologerUserId: required(input.astrologerUserId, "Astrologer user id is required"),
    connectionId: identifier(input.connectionId, "Channel connection id is required"),
    instagramAccountId: bounded(input.instagramAccountId, 1, 200, "Instagram account id is required"),
    instagramUserId: bounded(input.instagramUserId, 1, 200, "Instagram user id is required"),
    instagramUsername: optionalSnapshot(input.instagramUsername),
    instagramDisplayName: optionalSnapshot(input.instagramDisplayName),
    encryptedAccessToken: encryptedSecret(input.encryptedAccessToken),
    tokenExpiresAt: input.tokenExpiresAt ? normalizeIsoInstant(input.tokenExpiresAt) : null,
    now: input.now.toISOString()
  });
}

export async function startTelegramMtprotoConnection(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly phoneNumberLast4: string;
  readonly maskedPhoneNumber: string;
  readonly encryptedPhoneNumber: EncryptedMessagingSecret;
  readonly encryptedPhoneCodeHash: EncryptedMessagingSecret;
  readonly consentAccepted: true;
  readonly idGenerator?: () => string;
  readonly now: Date;
}): Promise<{
  readonly connectionId: string;
  readonly loginStep: "code_required";
  readonly maskedPhoneNumber: string;
}> {
  if (input.consentAccepted !== true) {
    throw new MessagingValidationError("Telegram Account access consent is required");
  }
  return input.store.startTelegramMtprotoConnection({
    connectionId: identifier(
      input.idGenerator?.() ?? randomUUID(),
      "Channel connection id is required"
    ),
    astrologerUserId: required(input.astrologerUserId, "Astrologer user id is required"),
    phoneNumberLast4: phoneLast4(input.phoneNumberLast4),
    maskedPhoneNumber: bounded(input.maskedPhoneNumber, 3, 32, "Masked phone number is invalid"),
    encryptedPhoneNumber: encryptedSecret(input.encryptedPhoneNumber),
    encryptedPhoneCodeHash: encryptedSecret(input.encryptedPhoneCodeHash),
    consentAccepted: true,
    now: input.now.toISOString()
  });
}

export async function requireTelegramMtprotoLoginSession(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly connectionId: string;
  readonly expectedLoginState: "code_required" | "password_required";
}): Promise<TelegramMtprotoLoginSession> {
  const session = await input.store.findTelegramMtprotoLoginSession({
    astrologerUserId: required(input.astrologerUserId, "Astrologer user id is required"),
    connectionId: identifier(input.connectionId, "Channel connection id is required")
  });
  if (!session) throw new MessagingThreadNotFoundError();
  if (session.loginState !== input.expectedLoginState) {
    throw new MessagingValidationError("Telegram Account login step is invalid");
  }
  return {
    ...session,
    maskedPhoneNumber: bounded(session.maskedPhoneNumber, 3, 32, "Masked phone number is invalid"),
    encryptedPhoneNumber: encryptedSecret(session.encryptedPhoneNumber),
    encryptedPhoneCodeHash: encryptedSecret(session.encryptedPhoneCodeHash),
    encryptedSession: session.encryptedSession ? encryptedSecret(session.encryptedSession) : null
  };
}

export async function recordTelegramMtprotoCodeResult(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly connectionId: string;
  readonly loginStep: "password_required" | "connected";
  readonly encryptedSession: EncryptedMessagingSecret;
  readonly telegramUserId: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly now: Date;
}): Promise<TelegramMtprotoLoginResultStoreResult> {
  return input.store.recordTelegramMtprotoCodeResult({
    astrologerUserId: required(input.astrologerUserId, "Astrologer user id is required"),
    connectionId: identifier(input.connectionId, "Channel connection id is required"),
    loginStep: telegramMtprotoLoginStep(input.loginStep),
    encryptedSession: encryptedSecret(input.encryptedSession),
    telegramUserId: optionalSnapshot(input.telegramUserId),
    username: optionalSnapshot(input.username),
    displayName: optionalSnapshot(input.displayName),
    now: input.now.toISOString()
  });
}

export async function recordTelegramMtprotoPasswordResult(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly connectionId: string;
  readonly encryptedSession: EncryptedMessagingSecret;
  readonly telegramUserId: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly now: Date;
}): Promise<TelegramMtprotoLoginResultStoreResult> {
  return input.store.recordTelegramMtprotoPasswordResult({
    astrologerUserId: required(input.astrologerUserId, "Astrologer user id is required"),
    connectionId: identifier(input.connectionId, "Channel connection id is required"),
    encryptedSession: encryptedSecret(input.encryptedSession),
    telegramUserId: bounded(input.telegramUserId, 1, 200, "Telegram user id is required"),
    username: optionalSnapshot(input.username),
    displayName: optionalSnapshot(input.displayName),
    now: input.now.toISOString()
  });
}

export async function recordTelegramBusinessMessage(input: {
  readonly store: MessagingStore;
  readonly updateId: string;
  readonly businessConnectionId: string;
  readonly providerMessageId: string;
  readonly providerChatId: string;
  readonly providerUserId: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly chatUsername: string | null;
  readonly chatDisplayName: string | null;
  readonly contentType?: MessagingMessageContentType;
  readonly text: string;
  readonly mediaAttachment?: TelegramBusinessMediaAttachment | null;
  readonly providerSentAt: string;
  readonly now: Date;
}): Promise<InboundMessageRecordResult | { readonly kind: "unmatched" }> {
  return input.store.recordTelegramBusinessMessage({
    updateId: bounded(input.updateId, 1, 200, "Telegram update id is required"),
    businessConnectionId: bounded(
      input.businessConnectionId,
      1,
      200,
      "Telegram business connection id is required"
    ),
    providerMessageId: bounded(input.providerMessageId, 1, 200, "Telegram message id is required"),
    providerChatId: bounded(input.providerChatId, 1, 200, "Telegram chat id is required"),
    providerUserId: optionalSnapshot(input.providerUserId),
    username: optionalSnapshot(input.username),
    displayName: optionalSnapshot(input.displayName),
    chatUsername: optionalSnapshot(input.chatUsername),
    chatDisplayName: optionalSnapshot(input.chatDisplayName),
    contentType: normalizeMessageContentType(input.contentType ?? "text"),
    text: bounded(input.text, 1, 4000, "Message text is invalid"),
    mediaAttachment: normalizeTelegramMediaAttachment(input.mediaAttachment ?? null),
    providerSentAt: normalizeIsoInstant(input.providerSentAt),
    now: input.now.toISOString()
  });
}

export async function recordInstagramGraphMessage(input: {
  readonly store: MessagingStore;
  readonly instagramAccountId: string;
  readonly providerMessageId: string;
  readonly senderId: string;
  readonly recipientId: string;
  readonly text: string;
  readonly providerSentAt: string;
  readonly now: Date;
}): Promise<InboundMessageRecordResult | { readonly kind: "unmatched" }> {
  return input.store.recordInstagramGraphMessage({
    instagramAccountId: bounded(
      input.instagramAccountId,
      1,
      200,
      "Instagram account id is required"
    ),
    providerMessageId: bounded(input.providerMessageId, 1, 200, "Instagram message id is required"),
    senderId: bounded(input.senderId, 1, 200, "Instagram sender id is required"),
    recipientId: bounded(input.recipientId, 1, 200, "Instagram recipient id is required"),
    text: bounded(input.text, 1, 4000, "Message text is invalid"),
    providerSentAt: normalizeIsoInstant(input.providerSentAt),
    now: input.now.toISOString()
  });
}

export async function recordTelegramMtprotoMessage(input: {
  readonly store: MessagingStore;
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
  readonly cursor?: {
    readonly pts?: number | null;
    readonly qts?: number | null;
    readonly dateCursor?: string | null;
    readonly seq?: number | null;
  } | null;
  readonly now: Date;
}): Promise<InboundMessageRecordResult | { readonly kind: "unmatched" }> {
  return input.store.recordTelegramMtprotoMessage({
    channelConnectionId: identifier(input.channelConnectionId, "Channel connection id is required"),
    leaseOwner: bounded(input.leaseOwner, 1, 200, "Telegram MTProto lease owner is required"),
    providerMessageId: bounded(input.providerMessageId, 1, 200, "Telegram message id is required"),
    providerChatId: bounded(input.providerChatId, 1, 200, "Telegram chat id is required"),
    providerUserId: optionalSnapshot(input.providerUserId),
    username: optionalSnapshot(input.username),
    displayName: optionalSnapshot(input.displayName),
    isOutgoing: input.isOutgoing,
    text: bounded(input.text, 1, 4000, "Message text is invalid"),
    providerSentAt: normalizeIsoInstant(input.providerSentAt),
    cursor: normalizeTelegramMtprotoCursor(input.cursor ?? null),
    now: input.now.toISOString()
  });
}

export async function recordTelegramBusinessDeletedMessages(input: {
  readonly store: MessagingStore;
  readonly businessConnectionId: string;
  readonly providerChatId: string;
  readonly providerMessageIds: readonly string[];
  readonly now: Date;
}) {
  if (input.providerMessageIds.length === 0) {
    throw new MessagingValidationError("Telegram deleted message ids are required");
  }
  return input.store.recordTelegramBusinessDeletedMessages({
    businessConnectionId: bounded(
      input.businessConnectionId,
      1,
      200,
      "Telegram business connection id is required"
    ),
    providerChatId: bounded(input.providerChatId, 1, 200, "Telegram chat id is required"),
    providerMessageIds: input.providerMessageIds.map((messageId) =>
      bounded(messageId, 1, 200, "Telegram message id is required")
    ),
    now: input.now.toISOString()
  });
}

export async function recordTelegramBusinessEditedMessage(input: {
  readonly store: MessagingStore;
  readonly updateId: string;
  readonly businessConnectionId: string;
  readonly providerMessageId: string;
  readonly providerChatId: string;
  readonly text: string;
  readonly providerSentAt: string;
  readonly providerEditedAt: string;
  readonly now: Date;
}) {
  return input.store.recordTelegramBusinessEditedMessage({
    updateId: bounded(input.updateId, 1, 200, "Telegram update id is required"),
    businessConnectionId: bounded(
      input.businessConnectionId,
      1,
      200,
      "Telegram business connection id is required"
    ),
    providerMessageId: bounded(input.providerMessageId, 1, 200, "Telegram message id is required"),
    providerChatId: bounded(input.providerChatId, 1, 200, "Telegram chat id is required"),
    text: bounded(input.text, 1, 4000, "Message text is invalid"),
    providerSentAt: normalizeIsoInstant(input.providerSentAt),
    providerEditedAt: normalizeIsoInstant(input.providerEditedAt),
    now: input.now.toISOString()
  });
}

export async function linkThreadToClient(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly clientUserId: string;
  readonly idempotencyKey: string;
  readonly now: Date;
}): Promise<MessagingThread> {
  const astrologerUserId = required(input.astrologerUserId, "Astrologer user id is required");
  const thread = await requireThread(input.store, astrologerUserId, input.threadId);
  const clientUserId = required(input.clientUserId, "Client user id is required");
  const now = input.now.toISOString();
  return input.store.linkThreadToClient({
    astrologerUserId,
    threadId: thread.id,
    clientUserId,
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    requestHash: hashThreadClientRequest({ clientUserId, threadId: thread.id }),
    now,
    expiresAt: idempotencyExpiry(input.now)
  });
}

export async function createClientFromThread(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly displayName: string;
  readonly idempotencyKey: string;
  readonly now: Date;
}): Promise<MessagingThread> {
  const astrologerUserId = required(input.astrologerUserId, "Astrologer user id is required");
  const thread = await requireThread(input.store, astrologerUserId, input.threadId);
  const now = input.now.toISOString();
  const displayName = bounded(input.displayName, 1, 200, "Client display name is invalid");
  return input.store.createClientFromThread({
    astrologerUserId,
    threadId: thread.id,
    displayName,
    idempotencyKey: idempotencyKey(input.idempotencyKey),
    requestHash: hashThreadClientRequest({ displayName, threadId: thread.id }),
    now,
    expiresAt: idempotencyExpiry(input.now)
  });
}

export async function markThreadRead(input: {
  readonly store: MessagingStore;
  readonly astrologerUserId: string;
  readonly threadId: string;
  readonly now: Date;
}): Promise<MessagingThread> {
  const astrologerUserId = required(input.astrologerUserId, "Astrologer user id is required");
  const thread = await requireThread(input.store, astrologerUserId, input.threadId);
  const now = input.now.toISOString();
  const result = await input.store.markThreadRead({
    astrologerUserId,
    threadId: thread.id,
    now,
    realtimeEvent: normalizeRealtimeEventDraft({
      astrologerUserId,
      type: messagingThreadUpdatedEventType,
      occurredAt: now,
      threadId: thread.id,
      channelConnectionId: thread.channelConnectionId,
      externalIdentityId: thread.externalIdentityId
    })
  });
  return result.thread;
}

export function normalizeRealtimeEvent(input: {
  readonly eventId: string;
  readonly astrologerUserId: string;
  readonly type: MessagingRealtimeEventType;
  readonly occurredAt: string;
  readonly threadId?: string | null;
  readonly messageId?: string | null;
  readonly channelConnectionId?: string | null;
  readonly externalIdentityId?: string | null;
}): MessagingRealtimeEvent {
  return {
    eventId: bounded(input.eventId, 1, 200, "Realtime event id is required"),
    ...normalizeRealtimeEventDraft(input)
  };
}

function normalizeRealtimeEventDraft(input: {
  readonly astrologerUserId: string;
  readonly type: MessagingRealtimeEventType;
  readonly occurredAt: string;
  readonly threadId?: string | null;
  readonly messageId?: string | null;
  readonly channelConnectionId?: string | null;
  readonly externalIdentityId?: string | null;
}): MessagingRealtimeEventDraft {
  if (!messagingRealtimeEventTypes.includes(input.type)) {
    throw new MessagingValidationError("Messaging realtime event type is invalid");
  }
  return {
    astrologerUserId: required(input.astrologerUserId, "Astrologer user id is required"),
    type: input.type,
    occurredAt: normalizeIsoInstant(input.occurredAt),
    threadId: optional(input.threadId),
    messageId: optional(input.messageId),
    channelConnectionId: optional(input.channelConnectionId),
    externalIdentityId: optional(input.externalIdentityId)
  };
}

function createDeliveryRequestedEvent(input: {
  readonly id: string;
  readonly messageId: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly occurredAt: string;
}): MessagingMessageDeliveryRequestedEvent {
  return {
    id: input.id,
    type: messagingMessageDeliveryRequestedEventType,
    occurredAt: input.occurredAt,
    payload: {
      messageId: input.messageId,
      threadId: input.threadId,
      channelConnectionId: input.channelConnectionId,
      astrologerUserId: input.astrologerUserId
    }
  };
}

async function requireThread(
  store: MessagingStore,
  astrologerUserId: string,
  threadId: string
): Promise<MessagingThread> {
  const thread = await store.findThreadForAstrologer({
    astrologerUserId,
    threadId: required(threadId, "Messaging thread id is required")
  });
  if (!thread) throw new MessagingThreadNotFoundError();
  return thread;
}

async function requireThreadExternalIdentity(
  store: MessagingStore,
  input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly externalIdentityId: string;
  }
) {
  const identity = await store.findExternalIdentityForThread(input);
  if (!identity) {
    throw new MessagingValidationError("External identity does not belong to the messaging thread");
  }
  return identity;
}

function resolveChannelConnectionId(
  thread: MessagingThread,
  value: string | null | undefined
): string {
  const channelConnectionId = optional(value) ?? thread.channelConnectionId;
  if (channelConnectionId !== thread.channelConnectionId) {
    throw new MessagingValidationError(
      "Channel connection does not belong to the messaging thread"
    );
  }
  return channelConnectionId;
}

function hashRequest(input: {
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly text: string;
}): `sha256:${string}` {
  const canonical = JSON.stringify({
    channelConnectionId: input.channelConnectionId,
    text: input.text,
    threadId: input.threadId
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function hashThreadClientRequest(input: {
  readonly threadId: string;
  readonly clientUserId?: string;
  readonly displayName?: string;
}): `sha256:${string}` {
  const canonical = JSON.stringify({
    clientUserId: input.clientUserId,
    displayName: input.displayName,
    threadId: input.threadId
  });
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function idempotencyExpiry(now: Date): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function idempotencyKey(value: string): string {
  const normalized = required(value, "Idempotency key is required");
  if (normalized.length < 8 || normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new MessagingValidationError("Idempotency key is invalid");
  }
  return normalized;
}

function normalizeIsoInstant(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new MessagingValidationError("Realtime event timestamp is invalid");
  return date.toISOString();
}

function required(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new MessagingValidationError(message);
  return normalized;
}

function optional(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeMessageContentType(
  value: MessagingMessageContentType
): MessagingMessageContentType {
  if (["text", "image", "file", "voice", "video_note", "video", "unsupported"].includes(value))
    return value;
  throw new MessagingValidationError("Message content type is unsupported");
}

function normalizeTelegramMediaAttachment(
  value: TelegramBusinessMediaAttachment | null
): TelegramBusinessMediaAttachment | undefined {
  if (!value) return undefined;
  const kind = normalizeTelegramMediaKind(value.kind);
  return {
    kind,
    providerFileId: bounded(value.providerFileId, 1, 500, "Telegram media file id is required"),
    providerFileUniqueId: bounded(
      value.providerFileUniqueId,
      1,
      500,
      "Telegram media unique file id is required"
    ),
    durationSeconds:
      value.durationSeconds === null
        ? null
        : nonNegativeInteger(value.durationSeconds, "Telegram media duration is invalid"),
    width:
      value.width === null ? null : positiveInteger(value.width, "Telegram media width is invalid"),
    height:
      value.height === null
        ? null
        : positiveInteger(value.height, "Telegram media height is invalid"),
    providerMimeType: optionalSnapshot(value.providerMimeType),
    providerSizeBytes:
      value.providerSizeBytes === null
        ? null
        : nonNegativeInteger(value.providerSizeBytes, "Telegram media size is invalid")
  };
}

function normalizeTelegramMediaKind(
  value: TelegramBusinessMediaAttachment["kind"]
): TelegramBusinessMediaAttachment["kind"] {
  if (value === "voice" || value === "image" || value === "video_note" || value === "video")
    return value;
  throw new MessagingValidationError("Telegram media kind is unsupported");
}

function normalizeTelegramMtprotoCursor(
  value: {
    readonly pts?: number | null;
    readonly qts?: number | null;
    readonly dateCursor?: string | null;
    readonly seq?: number | null;
  } | null
) {
  if (!value) return null;
  return {
    pts: nullableNonNegativeInteger(value.pts ?? null, "Telegram MTProto pts cursor is invalid"),
    qts: nullableNonNegativeInteger(value.qts ?? null, "Telegram MTProto qts cursor is invalid"),
    dateCursor:
      value.dateCursor === null || value.dateCursor === undefined
        ? null
        : normalizeIsoInstant(value.dateCursor),
    seq: nullableNonNegativeInteger(value.seq ?? null, "Telegram MTProto seq cursor is invalid")
  };
}

function nullableNonNegativeInteger(value: number | null, message: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new MessagingValidationError(message);
  return value;
}

function optionalSnapshot(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.length > 200 ? normalized.slice(0, 200) : normalized;
}

function bounded(value: string, minimum: number, maximum: number, message: string): string {
  const normalized = required(value, message);
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new MessagingValidationError(message);
  }
  return normalized;
}

function nonNegativeInteger(value: number, message: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MessagingValidationError(message);
  }
  return value;
}

function positiveInteger(value: number, message: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MessagingValidationError(message);
  }
  return value;
}

function identifier(value: string, message: string): string {
  return required(value, message);
}

function phoneLast4(value: string): string {
  const normalized = required(value, "Phone number last4 is required");
  if (!/^[0-9]{4}$/.test(normalized)) {
    throw new MessagingValidationError("Phone number last4 is invalid");
  }
  return normalized;
}

function telegramMtprotoLoginStep(
  value: "password_required" | "connected"
): "password_required" | "connected" {
  if (value === "password_required" || value === "connected") return value;
  throw new MessagingValidationError("Telegram Account login step is invalid");
}

function encryptedSecret(value: EncryptedMessagingSecret): EncryptedMessagingSecret {
  if (value.algorithm !== "aes-256-gcm") {
    throw new MessagingValidationError("Encrypted secret algorithm is unsupported");
  }
  return {
    algorithm: value.algorithm,
    keyId: bounded(value.keyId, 1, 100, "Encrypted secret key id is required"),
    iv: bounded(value.iv, 1, 500, "Encrypted secret iv is required"),
    authTag: bounded(value.authTag, 1, 500, "Encrypted secret auth tag is required"),
    ciphertext: bounded(value.ciphertext, 1, 20_000, "Encrypted secret ciphertext is required")
  };
}
