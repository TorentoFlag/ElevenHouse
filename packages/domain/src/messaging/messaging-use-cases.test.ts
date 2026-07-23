import { describe, expect, it } from "vitest";
import {
  MessagingClientRelationshipError,
  MessagingIdempotencyConflictError,
  MessagingValidationError
} from "./messaging-errors";
import {
  messagingMessageDeliveryRequestedEventType,
  messagingMessageReceivedEventType,
  messagingThreadUpdatedEventType
} from "./messaging-events";
import type {
  AppendMessagingRealtimeEventInput,
  CreateClientFromThreadStoreInput,
  CreateOutboundMessageStoreInput,
  InboundMessageRecordResult,
  LinkThreadToClientStoreInput,
  MarkThreadReadStoreInput,
  MarkThreadReadStoreResult,
  MessagingStore,
  RecordTelegramBusinessConnectionStoreInput,
  RecordTelegramBusinessMessageStoreInput,
  RecordInboundProviderMessageStoreInput
} from "./messaging-store";
import type {
  MessagingMessage,
  MessagingMessageWithRequestHash,
  MessagingOutboxEvent,
  MessagingRealtimeEvent,
  MessagingThread
} from "./messaging-types";
import {
  createClientFromThread,
  createOutboundMessage,
  linkThreadToClient,
  markThreadRead,
  normalizeRealtimeEvent,
  recordInboundProviderMessage
} from "./messaging-use-cases";

const now = new Date("2026-07-21T10:00:00.000Z");
const astrologerUserId = "astrologer-1";

describe("Messaging use cases", () => {
  it("normalizes an opaque persisted realtime cursor as eventId", () => {
    expect(
      normalizeRealtimeEvent({
        eventId: "00000000000000000042",
        astrologerUserId,
        type: messagingThreadUpdatedEventType,
        occurredAt: now.toISOString(),
        threadId: "thread-1"
      })
    ).toMatchObject({ eventId: "00000000000000000042", type: messagingThreadUpdatedEventType });

    expect(() =>
      normalizeRealtimeEvent({
        eventId: "   ",
        astrologerUserId,
        type: messagingThreadUpdatedEventType,
        occurredAt: now.toISOString()
      })
    ).toThrow(MessagingValidationError);
  });

  it("returns the realtime event with its persisted cursor", async () => {
    const store = new InMemoryMessagingStore();

    const event = await store.appendRealtimeEvent({
      astrologerUserId,
      type: messagingThreadUpdatedEventType,
      occurredAt: now.toISOString(),
      threadId: "thread-1",
      messageId: undefined,
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1"
    });

    expect(event).toMatchObject({ eventId: "00000000000000000001" });
    expect(store.realtimeEvents).toEqual([event]);
  });

  it("persists one queued outbound message and identifier-only delivery event across an idempotent replay", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      text: "  Hello, client.  ",
      idempotencyKey: "send-message-001",
      idGenerator: createIdGenerator(),
      now
    };

    const created = await createOutboundMessage(input);
    const replayed = await createOutboundMessage({ ...input, text: "Hello, client." });

    expect(created).toMatchObject({ replayed: false, message: { text: "Hello, client.", status: "queued" } });
    expect(replayed).toMatchObject({ message: { id: created.message.id }, replayed: true });
    expect(store.messages).toHaveLength(1);
    expect(store.outboxEvents).toEqual([
      expect.objectContaining({
        type: messagingMessageDeliveryRequestedEventType,
        payload: {
          messageId: created.message.id,
          threadId: "thread-1",
          channelConnectionId: "connection-1",
          astrologerUserId
        }
      })
    ]);
    expect(store.outboxEvents[0]?.payload).not.toHaveProperty("text");
  });

  it("rejects an outbound send to a thread owned by another astrologer", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      createOutboundMessage({
        store,
        astrologerUserId: "astrologer-2",
        threadId: "thread-1",
        channelConnectionId: "connection-1",
        text: "Unauthorized send",
        idempotencyKey: "send-message-foreign",
        now
      })
    ).rejects.toMatchObject({ code: "messaging_thread_not_found" });

    expect(store.messages).toHaveLength(0);
    expect(store.outboxEvents).toHaveLength(0);
  });

  it("rejects an idempotency-key replay with different normalized content without a second persisted message", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      idempotencyKey: "send-message-001",
      now
    };
    await createOutboundMessage({ ...input, text: "Original" });

    await expect(createOutboundMessage({ ...input, text: "Changed" })).rejects.toBeInstanceOf(
      MessagingIdempotencyConflictError
    );
    expect(store.messages).toHaveLength(1);
    expect(store.outboxEvents).toHaveLength(1);
  });

  it("deduplicates inbound provider messages without persisting a second message or realtime event", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1",
      providerMessageId: "telegram-100",
      text: "Hello from Telegram",
      idGenerator: createIdGenerator(),
      now
    };

    const created = await recordInboundProviderMessage(input);
    const duplicate = await recordInboundProviderMessage(input);

    expect(created.duplicate).toBe(false);
    expect(duplicate).toEqual({ message: created.message, duplicate: true });
    expect(store.messages).toHaveLength(1);
    expect(store.realtimeEvents).toHaveLength(1);
    expect(store.realtimeEvents[0]).toMatchObject({
      eventId: "00000000000000000001",
      type: messagingMessageReceivedEventType,
      messageId: created.message.id
    });
  });

  it("deduplicates inbound provider messages per external identity", async () => {
    const store = new InMemoryMessagingStore();

    const first = await recordInboundProviderMessage({
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1",
      providerMessageId: "chat-scoped-100",
      text: "First chat",
      idGenerator: createIdGenerator(),
      now
    });
    const second = await recordInboundProviderMessage({
      store,
      astrologerUserId,
      threadId: "thread-2",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-2",
      providerMessageId: "chat-scoped-100",
      text: "Second chat",
      idGenerator: createIdGenerator("second"),
      now
    });
    const duplicateFirst = await recordInboundProviderMessage({
      store,
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1",
      providerMessageId: "chat-scoped-100",
      text: "First chat",
      idGenerator: createIdGenerator("duplicate"),
      now
    });

    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ duplicate: false, message: { text: "Second chat" } });
    expect(duplicateFirst).toEqual({ message: first.message, duplicate: true });
    expect(store.messages).toHaveLength(2);
  });

  it("rejects an inbound external identity that is not attached to the target thread", async () => {
    const store = new InMemoryMessagingStore();

    await expect(
      recordInboundProviderMessage({
        store,
        astrologerUserId,
        threadId: "thread-1",
        channelConnectionId: "connection-1",
        externalIdentityId: "identity-2",
        providerMessageId: "telegram-foreign-identity",
        text: "Wrong thread",
        now
      })
    ).rejects.toBeInstanceOf(MessagingValidationError);

    expect(store.messages).toHaveLength(0);
    expect(store.realtimeEvents).toHaveLength(0);
  });

  it("rejects linking a thread to a client without an active relationship", async () => {
    await expect(
      linkThreadToClient({
        store: new InMemoryMessagingStore(),
        astrologerUserId,
        threadId: "thread-1",
        clientUserId: "unrelated-client",
        idempotencyKey: "thread-link:unrelated-client",
        now
      })
    ).rejects.toBeInstanceOf(MessagingClientRelationshipError);
  });

  it("creates a manual client through the Clients port and persists the resulting thread link", async () => {
    const store = new InMemoryMessagingStore();

    const linked = await createClientFromThread({
      store,
      astrologerUserId,
      threadId: "thread-1",
      displayName: "  Telegram contact  ",
      idempotencyKey: "thread-create:manual-client",
      now
    });

    expect(store.createClientCommands).toEqual([
      expect.objectContaining({ astrologerUserId, displayName: "Telegram contact", now: now.toISOString() })
    ]);
    expect(linked.clientUserId).toBe("client-created");
    expect(store.thread("thread-1")?.clientUserId).toBe("client-created");
  });

  it("passes a normalized idempotent link-client command to the store", async () => {
    const store = new InMemoryMessagingStore();

    await linkThreadToClient({
      store,
      astrologerUserId,
      threadId: " thread-1 ",
      clientUserId: " client-existing ",
      idempotencyKey: "thread-link:request-1",
      now
    });

    expect(store.linkClientCommands).toEqual([
      expect.objectContaining({
        astrologerUserId,
        threadId: "thread-1",
        clientUserId: "client-existing",
        idempotencyKey: "thread-link:request-1",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      })
    ]);
  });

  it("creates and links a manual client through one idempotent store command", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      displayName: "  Telegram contact  ",
      idempotencyKey: "thread-create:request-1",
      now
    };

    const created = await createClientFromThread(input);
    const replayed = await createClientFromThread(input);

    expect(created.clientUserId).toBe("client-created");
    expect(replayed).toEqual(created);
    expect(store.createClientCommands).toEqual([
      expect.objectContaining({
        astrologerUserId,
        threadId: "thread-1",
        displayName: "Telegram contact",
        idempotencyKey: "thread-create:request-1",
        requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      })
    ]);
  });

  it("rejects a thread-client idempotency key reused for a different normalized request", async () => {
    const store = new InMemoryMessagingStore();
    const input = {
      store,
      astrologerUserId,
      threadId: "thread-1",
      clientUserId: "client-existing",
      idempotencyKey: "thread-link:request-1",
      now
    };

    await linkThreadToClient(input);

    await expect(
      linkThreadToClient({ ...input, clientUserId: "client-other" })
    ).rejects.toBeInstanceOf(MessagingIdempotencyConflictError);
  });

  it("persists mark-read state and its thread-updated realtime event", async () => {
    const store = new InMemoryMessagingStore();

    const updated = await markThreadRead({
      store,
      astrologerUserId,
      threadId: "thread-1",
      now
    });

    expect(updated.unreadAstrologerCount).toBe(0);
    expect(store.thread("thread-1")?.unreadAstrologerCount).toBe(0);
    expect(store.markReadCommands).toEqual([
      expect.objectContaining({
        realtimeEvent: expect.objectContaining({
          type: messagingThreadUpdatedEventType,
          threadId: "thread-1",
          channelConnectionId: "connection-1",
          externalIdentityId: "identity-1"
        })
      })
    ]);
    expect(store.realtimeEvents).toEqual([
      expect.objectContaining({
        type: messagingThreadUpdatedEventType,
        eventId: "00000000000000000001",
        threadId: "thread-1",
        channelConnectionId: "connection-1",
        externalIdentityId: "identity-1"
      })
    ]);
  });
});

class InMemoryMessagingStore implements MessagingStore {
  readonly messages: MessagingMessage[] = [];
  readonly outboxEvents: MessagingOutboxEvent<Record<string, string>>[] = [];
  readonly realtimeEvents: MessagingRealtimeEvent[] = [];
  readonly markReadCommands: MarkThreadReadStoreInput[] = [];
  readonly linkClientCommands: Array<
    LinkThreadToClientStoreInput & { readonly idempotencyKey?: string; readonly requestHash?: string }
  > = [];
  readonly createClientCommands: Array<{
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly displayName: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly now: string;
  }> = [];
  readonly #threads = new Map<string, MessagingThread>([
    ["thread-1", createThread()],
    ["thread-2", createThread({ id: "thread-2", externalIdentityId: "identity-2" })]
  ]);
  readonly #requestHashes = new Map<string, `sha256:${string}`>();
  readonly #providerMessages = new Map<string, MessagingMessage>();
  readonly #threadClientRequests = new Map<string, { readonly requestHash: string; readonly thread: MessagingThread }>();
  readonly #activeClientUserIds = new Set(["client-existing"]);
  #nextRealtimeEventId = 1;

  thread(threadId: string): MessagingThread | undefined {
    return this.#threads.get(threadId);
  }

  async findThreadForAstrologer(input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
  }): Promise<MessagingThread | null> {
    const thread = this.#threads.get(input.threadId);
    return thread?.astrologerUserId === input.astrologerUserId ? thread : null;
  }

  async findOutboundMessageByIdempotencyKey(input: {
    readonly threadId: string;
    readonly idempotencyKey: string;
  }): Promise<MessagingMessageWithRequestHash | null> {
    const message = this.messages.find(
      (candidate) => candidate.threadId === input.threadId && candidate.idempotencyKey === input.idempotencyKey
    );
    if (!message) return null;
    return { ...message, requestHash: this.#requestHashes.get(`${input.threadId}:${input.idempotencyKey}`)! };
  }

  async createOutboundMessage(input: CreateOutboundMessageStoreInput): Promise<MessagingMessage> {
    const message = createMessage({
      id: input.messageId,
      threadId: input.threadId,
      channelConnectionId: input.channelConnectionId,
      text: input.text,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
      updatedAt: input.now
    });
    this.messages.push(message);
    this.#requestHashes.set(`${input.threadId}:${input.idempotencyKey}`, input.requestHash);
    this.outboxEvents.push(input.deliveryRequestedEvent);
    return message;
  }

  async recordInboundProviderMessage(input: RecordInboundProviderMessageStoreInput): Promise<InboundMessageRecordResult> {
    const key = `${input.channelConnectionId}:${input.externalIdentityId}:${input.providerMessageId}`;
    const existing = this.#providerMessages.get(key);
    if (existing) return { kind: "duplicate", message: existing };
    const message = createMessage({
      id: input.messageId,
      threadId: input.threadId,
      channelConnectionId: input.channelConnectionId,
      externalIdentityId: input.externalIdentityId,
      direction: "inbound",
      text: input.text,
      status: "received",
      providerMessageId: input.providerMessageId,
      idempotencyKey: null,
      createdAt: input.now,
      updatedAt: input.now
    });
    this.messages.push(message);
    this.#providerMessages.set(key, message);
    this.persistRealtimeEvent(input.receivedEvent);
    return { kind: "created", message };
  }

  async recordTelegramBusinessConnection(
    input: RecordTelegramBusinessConnectionStoreInput
  ): Promise<{ readonly kind: "recorded" }> {
    void input;
    return { kind: "recorded" };
  }

  async recordTelegramBusinessMessage(
    input: RecordTelegramBusinessMessageStoreInput
  ): Promise<InboundMessageRecordResult> {
    return this.recordInboundProviderMessage({
      messageId: "message-telegram-business",
      astrologerUserId,
      threadId: "thread-1",
      channelConnectionId: "connection-1",
      externalIdentityId: "identity-1",
      providerMessageId: input.providerMessageId,
      text: input.text,
      now: input.now,
      receivedEvent: {
        astrologerUserId,
        type: messagingMessageReceivedEventType,
        occurredAt: input.now,
        threadId: "thread-1",
        messageId: "message-telegram-business",
        channelConnectionId: "connection-1",
        externalIdentityId: "identity-1"
      }
    });
  }

  async linkThreadToClient(input: LinkThreadToClientStoreInput): Promise<MessagingThread> {
    const existing = this.#threadClientRequests.get(input.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new MessagingIdempotencyConflictError();
      return existing.thread;
    }
    if (!this.#activeClientUserIds.has(input.clientUserId)) throw new MessagingClientRelationshipError();
    this.linkClientCommands.push(input);
    const thread = this.#threads.get(input.threadId)!;
    const updated = { ...thread, clientUserId: input.clientUserId, updatedAt: input.now };
    this.#threads.set(updated.id, updated);
    this.#threadClientRequests.set(input.idempotencyKey, { requestHash: input.requestHash, thread: updated });
    return updated;
  }

  async createClientFromThread(input: CreateClientFromThreadStoreInput): Promise<MessagingThread> {
    const existing = this.#threadClientRequests.get(input.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== input.requestHash) throw new MessagingIdempotencyConflictError();
      return existing.thread;
    }
    const thread = this.#threads.get(input.threadId)!;
    const updated = { ...thread, clientUserId: "client-created", updatedAt: input.now };
    this.#threads.set(updated.id, updated);
    this.createClientCommands.push(input);
    this.#activeClientUserIds.add("client-created");
    this.#threadClientRequests.set(input.idempotencyKey, { requestHash: input.requestHash, thread: updated });
    return updated;
  }

  async markThreadRead(input: MarkThreadReadStoreInput): Promise<MarkThreadReadStoreResult> {
    const thread = this.#threads.get(input.threadId)!;
    const updated = { ...thread, unreadAstrologerCount: 0, updatedAt: input.now };
    this.#threads.set(updated.id, updated);
    this.markReadCommands.push(input);
    return { thread: updated, realtimeEvent: this.persistRealtimeEvent(input.realtimeEvent) };
  }

  async appendRealtimeEvent(input: AppendMessagingRealtimeEventInput): Promise<MessagingRealtimeEvent> {
    return this.persistRealtimeEvent(input);
  }

  async findExternalIdentityForThread(input: {
    readonly astrologerUserId: string;
    readonly threadId: string;
    readonly externalIdentityId: string;
  }): Promise<{ readonly id: string; readonly channelConnectionId: string } | null> {
    const thread = await this.findThreadForAstrologer(input);
    if (thread?.externalIdentityId !== input.externalIdentityId) return null;
    return { id: input.externalIdentityId, channelConnectionId: thread.channelConnectionId };
  }

  private persistRealtimeEvent(input: AppendMessagingRealtimeEventInput): MessagingRealtimeEvent {
    const event = {
      ...input,
      eventId: this.#nextRealtimeEventId.toString().padStart(20, "0")
    };
    this.#nextRealtimeEventId += 1;
    this.realtimeEvents.push(event);
    return event;
  }
}

function createThread(overrides: Partial<MessagingThread> = {}): MessagingThread {
  return {
    id: "thread-1",
    astrologerUserId,
    clientUserId: null,
    channelConnectionId: "connection-1",
    externalIdentityId: "identity-1",
    status: "open",
    lastMessageAt: null,
    unreadAstrologerCount: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function createMessage(overrides: Partial<MessagingMessage> = {}): MessagingMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    channelConnectionId: "connection-1",
    externalIdentityId: "identity-1",
    direction: "outbound",
    text: "Hello, client.",
    status: "queued",
    providerMessageId: null,
    idempotencyKey: "send-message-001",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function createIdGenerator(prefix = "id"): () => string {
  let index = 0;
  return () => `${prefix}-${++index}`;
}
