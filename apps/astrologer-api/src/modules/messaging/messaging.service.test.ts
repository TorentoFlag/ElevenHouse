import {
  MessagingClientRelationshipError,
  type MessagingMessage,
  type MessagingReadStore,
  type MessagingStore,
  type MessagingThread
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { MessagingService } from "./messaging.service";

const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const threadId = "33333333-3333-4333-8333-333333333333";
const clientUserId = "44444444-4444-4444-8444-444444444444";
const messageId = "55555555-5555-4555-8555-555555555555";
const connectionId = "66666666-6666-4666-8666-666666666666";
const identityId = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-07-22T10:00:00.000Z");

describe("MessagingService", () => {
  it("lists threads for the current astrologer session", async () => {
    const readStore = createReadStore();
    const service = createService({ readStore });

    await expect(service.listThreads({}, request())).resolves.toMatchObject({
      threads: [{ id: threadId }]
    });
    expect(readStore.listThreads).toHaveBeenCalledWith({
      astrologerUserId,
      limit: 50,
      offset: 0
    });
  });

  it("requests the complete persisted thread detail when no pagination is explicit", async () => {
    const readStore = createReadStore();
    const service = createService({ readStore });

    await expect(service.getThread(threadId, {}, request())).resolves.toMatchObject({
      thread: { id: threadId },
      messages: [{ id: messageId }]
    });
    expect(readStore.getThread).toHaveBeenCalledWith({
      astrologerUserId,
      threadId,
      offset: 0
    });
  });

  it("starts Telegram Business connection and returns the public bot link", async () => {
    const store = createStore();
    const service = createService({
      store,
      readStore: createReadStore({ connectionStatus: "connecting" }),
      telegramBusinessBotUsername: "ElevenHouseTestBot"
    });

    await expect(service.startTelegramBusinessConnection(request())).resolves.toMatchObject({
      channelConnection: {
        id: connectionId,
        provider: "telegram",
        mode: "telegram_business_bot",
        status: "connecting"
      },
      telegramBotUsername: "ElevenHouseTestBot",
      telegramBotUrl: "https://t.me/ElevenHouseTestBot"
    });
    expect(
      (store as unknown as { startTelegramBusinessConnection: ReturnType<typeof vi.fn> })
        .startTelegramBusinessConnection
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId,
        now: now.toISOString()
      })
    );
  });

  it("validates a send request and persists it with the supplied idempotency key", async () => {
    const store = createStore();
    const service = createService({ store });

    await expect(
      service.sendMessage(threadId, { text: "Здравствуйте" }, "message:request-1", request())
    ).resolves.toMatchObject({ message: { id: messageId, text: "Здравствуйте" } });
    expect(store.createOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        astrologerUserId,
        threadId,
        idempotencyKey: "message:request-1",
        text: "Здравствуйте"
      })
    );
    await expect(
      service.sendMessage(threadId, { text: "" }, "message:request-2", request())
    ).rejects.toMatchObject({ status: 400 });
  });

  it("maps an unrelated client relationship to a safe validation error", async () => {
    const store = createStore();
    vi.mocked(store.linkThreadToClient).mockRejectedValue(new MessagingClientRelationshipError());
    const service = createService({ store });

    await expect(
      service.linkClient(threadId, { clientUserId }, "thread-link:unrelated", request())
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({ code: "messaging_client_relationship_error" })
    });
  });

  it("creates and returns the real client linked to the thread", async () => {
    const service = createService({
      readStore: createReadStore({ clientUserId })
    });

    await expect(
      service.createClient(
        threadId,
        { displayName: "Марина" },
        "thread-create:request-1",
        request()
      )
    ).resolves.toMatchObject({
      clientUserId,
      thread: {
        id: threadId,
        clientUserId,
        primaryIdentity: { linkedClientUserId: clientUserId, linkStatus: "linked" }
      }
    });
  });

  it("forwards idempotency keys to link-client and create-client commands", async () => {
    const store = createStore();
    const service = createService({ store, readStore: createReadStore({ clientUserId }) });

    await expect(
      service.linkClient(threadId, { clientUserId }, "thread-link:request-1", request())
    ).resolves.toMatchObject({ clientUserId });
    await expect(
      service.createClient(
        threadId,
        { displayName: "Марина" },
        "thread-create:request-1",
        request()
      )
    ).resolves.toMatchObject({ clientUserId });

    expect(store.linkThreadToClient).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "thread-link:request-1" })
    );
    expect(
      (store as unknown as { createClientFromThread: ReturnType<typeof vi.fn> })
        .createClientFromThread
    ).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "thread-create:request-1" }));
  });

  it("marks an owned thread read", async () => {
    const store = createStore();
    const service = createService({ store, readStore: createReadStore({ unreadCount: 0 }) });

    await expect(service.markRead(threadId, request())).resolves.toMatchObject({
      thread: { id: threadId, unreadCount: 0 }
    });
    expect(store.markThreadRead).toHaveBeenCalledWith(
      expect.objectContaining({ astrologerUserId, threadId })
    );
  });

  it("rejects invalid identifiers and a missing astrologer session", async () => {
    const service = createService();

    await expect(service.getThread("not-a-uuid", {}, request())).rejects.toMatchObject({
      status: 400
    });
    await expect(service.listThreads({}, {} as never)).rejects.toMatchObject({ status: 401 });
  });
});

function request() {
  return { currentAstrologerAccount: { account: { id: astrologerUserId } } } as never;
}

function createService(
  overrides: {
    store?: MessagingStore;
    readStore?: MessagingReadStore;
    telegramBusinessBotUsername?: string | null;
  } = {}
) {
  return new MessagingService(
    overrides.store ?? createStore(),
    overrides.readStore ?? createReadStore(),
    { now: () => now },
    {
      get: (key: string) =>
        key === "astrologerApi.telegramBusinessBotUsername"
          ? (overrides.telegramBusinessBotUsername ?? null)
          : undefined
    } as never
  );
}

function createStore(): MessagingStore {
  const thread = domainThread();
  return {
    findThreadForAstrologer: vi.fn(async () => thread),
    findExternalIdentityForThread: vi.fn(async () => ({
      id: identityId,
      channelConnectionId: connectionId
    })),
    findOutboundMessageByIdempotencyKey: vi.fn(async () => null),
    createOutboundMessage: vi.fn(async (input) => domainMessage(input.text)),
    recordInboundProviderMessage: vi.fn(async () => ({
      kind: "created" as const,
      message: domainMessage("inbound")
    })),
    recordTelegramBusinessConnection: vi.fn(async () => ({ kind: "recorded" as const })),
    recordTelegramBusinessMessage: vi.fn(async () => ({
      kind: "created" as const,
      message: domainMessage("inbound")
    })),
    startTelegramBusinessConnection: vi.fn(async () => ({ connectionId })),
    linkThreadToClient: vi.fn(async (input) => ({ ...thread, clientUserId: input.clientUserId })),
    createClientFromThread: vi.fn(async () => ({ ...thread, clientUserId })),
    markThreadRead: vi.fn(async () => ({
      thread: { ...thread, unreadAstrologerCount: 0 },
      realtimeEvent: realtimeEvent()
    })),
    appendRealtimeEvent: vi.fn(async () => realtimeEvent())
  };
}

function createReadStore(
  overrides: {
    clientUserId?: string | null;
    connectionStatus?: ReturnType<typeof channelConnection>["status"];
    unreadCount?: number;
  } = {}
): MessagingReadStore {
  return {
    listChannelConnections: vi.fn(async () => ({
      channelConnections: [channelConnection({ status: overrides.connectionStatus })]
    })),
    listThreads: vi.fn(async () => ({ threads: [readThread(overrides)], nextCursor: null })),
    getThread: vi.fn(async () => ({
      thread: readThread(overrides),
      messages: [readMessage()],
      nextCursor: null
    })),
    listRealtimeEvents: vi.fn(async () => ({ events: [] }))
  };
}

function domainThread(): MessagingThread {
  return {
    id: threadId,
    astrologerUserId,
    clientUserId: null,
    channelConnectionId: connectionId,
    externalIdentityId: identityId,
    status: "open",
    lastMessageAt: now.toISOString(),
    unreadAstrologerCount: 3,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function domainMessage(text: string): MessagingMessage {
  return {
    id: messageId,
    threadId,
    channelConnectionId: connectionId,
    externalIdentityId: null,
    direction: "outbound",
    text,
    status: "queued",
    providerMessageId: null,
    idempotencyKey: "message:request-1",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function channelConnection(overrides: { status?: "connecting" | "active" } = {}) {
  return {
    id: connectionId,
    provider: "telegram" as const,
    mode: "telegram_business_bot" as const,
    status: overrides.status ?? "active" as const,
    displayName: "Telegram",
    username: "telegram",
    capabilities: {
      canSend: true,
      canReceive: true,
      canRead: true,
      supportsHistoryImport: false,
      supportsMessageEdits: false,
      supportsMessageDeletes: false,
      supportsAttachments: false
    },
    connectedAt: overrides.status === "connecting" ? null : now.toISOString(),
    lastSyncedAt: overrides.status === "connecting" ? null : now.toISOString(),
    lastErrorCode: null
  };
}

function readThread(overrides: { clientUserId?: string | null; unreadCount?: number } = {}) {
  return {
    id: threadId,
    clientUserId: overrides.clientUserId ?? null,
    status: "open" as const,
    primaryIdentity: {
      id: identityId,
      channelConnectionId: connectionId,
      provider: "telegram" as const,
      providerUserId: "123",
      providerChatId: "456",
      username: "marina",
      displayName: "Марина",
      avatarMediaId: null,
      linkedClientUserId: overrides.clientUserId ?? null,
      linkStatus: overrides.clientUserId ? ("linked" as const) : ("unlinked" as const),
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString()
    },
    lastMessage: readMessage(),
    lastMessageAt: now.toISOString(),
    unreadCount: overrides.unreadCount ?? 3,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function readMessage() {
  return {
    id: messageId,
    threadId,
    channelConnectionId: connectionId,
    externalIdentityId: null,
    direction: "outbound" as const,
    senderKind: "astrologer" as const,
    contentType: "text" as const,
    text: "Здравствуйте",
    mediaAssetId: null,
    status: "queued" as const,
    failureCode: null,
    providerSentAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function realtimeEvent() {
  return {
    eventId: "event-1",
    astrologerUserId,
    type: "thread.updated" as const,
    occurredAt: now.toISOString(),
    threadId,
    messageId: undefined,
    channelConnectionId: connectionId,
    externalIdentityId: identityId
  };
}
