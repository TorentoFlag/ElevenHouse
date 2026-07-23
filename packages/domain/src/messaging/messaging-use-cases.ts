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
  RecordTelegramBusinessConnectionStoreResult,
  TelegramBusinessConnectionRights
} from "./messaging-store";
import type {
  MessagingMessage,
  MessagingRealtimeEvent,
  MessagingRealtimeEventDraft,
  MessagingRealtimeEventType,
  MessagingThread,
  NormalizedSendMessageInput
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
    businessConnectionId: bounded(input.businessConnectionId, 1, 200, "Telegram business connection id is required"),
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

export async function recordTelegramBusinessMessage(input: {
  readonly store: MessagingStore;
  readonly updateId: string;
  readonly businessConnectionId: string;
  readonly providerMessageId: string;
  readonly providerChatId: string;
  readonly providerUserId: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly text: string;
  readonly providerSentAt: string;
  readonly now: Date;
}): Promise<InboundMessageRecordResult | { readonly kind: "unmatched" }> {
  return input.store.recordTelegramBusinessMessage({
    updateId: bounded(input.updateId, 1, 200, "Telegram update id is required"),
    businessConnectionId: bounded(input.businessConnectionId, 1, 200, "Telegram business connection id is required"),
    providerMessageId: bounded(input.providerMessageId, 1, 200, "Telegram message id is required"),
    providerChatId: bounded(input.providerChatId, 1, 200, "Telegram chat id is required"),
    providerUserId: optionalSnapshot(input.providerUserId),
    username: optionalSnapshot(input.username),
    displayName: optionalSnapshot(input.displayName),
    text: bounded(input.text, 1, 4000, "Message text is invalid"),
    providerSentAt: normalizeIsoInstant(input.providerSentAt),
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

function identifier(value: string, message: string): string {
  return required(value, message);
}
