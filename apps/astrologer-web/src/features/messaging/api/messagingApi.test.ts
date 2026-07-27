import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import {
  createMessagingThreadClient,
  getMessagingThread,
  getMessagingMessageMediaSource,
  linkMessagingThreadClient,
  listMessagingChannelConnections,
  listMessagingThreads,
  markMessagingThreadRead,
  sendMessagingMessage,
  startTelegramBusinessConnection
} from "./messagingApi";

const threadId = "44444444-4444-4444-8444-444444444444";
const connectionId = "55555555-5555-4555-8555-555555555555";
const clientUserId = "22222222-2222-4222-8222-222222222222";

describe("messagingApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists messaging channel connections and threads with contract parsing", async () => {
    const get = vi
      .spyOn(application.http, "get")
      .mockResolvedValueOnce({
        channelConnections: [channelConnection()]
      })
      .mockResolvedValueOnce({
        threads: [thread()],
        nextCursor: null
      });

    await expect(listMessagingChannelConnections()).resolves.toMatchObject({
      channelConnections: [{ id: connectionId }]
    });
    await expect(listMessagingThreads({ limit: 25, offset: 50 })).resolves.toMatchObject({
      threads: [{ id: threadId }],
      nextCursor: null
    });

    expect(get).toHaveBeenNthCalledWith(1, "/messaging/channel-connections");
    expect(get).toHaveBeenNthCalledWith(2, "/messaging/threads?limit=25&offset=50");
  });

  it("gets a thread detail response and rejects unsafe provider fields", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue({
      thread: { ...thread(), providerToken: "secret" },
      messages: [],
      nextCursor: null
    });

    await expect(getMessagingThread(threadId)).rejects.toThrow();
    expect(get).toHaveBeenCalledWith(`/messaging/threads/${threadId}`);
  });

  it("gets a private message media source through the owner-scoped endpoint", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue({
      url: "https://storage.example/private/voice.ogg?signed=1",
      expiresAt: "2026-07-22T10:05:00.000Z",
      mimeType: "audio/ogg"
    });

    await expect(getMessagingMessageMediaSource(message().id)).resolves.toEqual({
      url: "https://storage.example/private/voice.ogg?signed=1",
      expiresAt: "2026-07-22T10:05:00.000Z",
      mimeType: "audio/ogg"
    });
    expect(get).toHaveBeenCalledWith(`/messaging/messages/${message().id}/media/source`);
  });

  it("sends outbound messages with csrf and Idempotency-Key", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue({ message: message() });

    await expect(
      sendMessagingMessage(threadId, { text: "  Hello  " }, "message-key-1")
    ).resolves.toMatchObject({ message: { id: "77777777-7777-4777-8777-777777777777" } });

    expect(post).toHaveBeenCalledWith(
      `/messaging/threads/${threadId}/messages`,
      { text: "Hello" },
      { csrf: true, headers: { "idempotency-key": "message-key-1" } }
    );
  });

  it("starts Telegram Business connection with csrf and parses the public bot link", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue({
      channelConnection: channelConnection({ status: "connecting" }),
      telegramBotUsername: "ElevenHouseTestBot",
      telegramBotUrl: "https://t.me/ElevenHouseTestBot"
    });

    await expect(startTelegramBusinessConnection()).resolves.toMatchObject({
      channelConnection: { id: connectionId, status: "connecting" },
      telegramBotUrl: "https://t.me/ElevenHouseTestBot"
    });

    expect(post).toHaveBeenCalledWith(
      "/messaging/channel-connections/telegram/business/start",
      undefined,
      { csrf: true }
    );
  });

  it("links and creates clients with idempotency keys, and marks read with csrf", async () => {
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce({ thread: thread(clientUserId), clientUserId })
      .mockResolvedValueOnce({ thread: thread(clientUserId), clientUserId })
      .mockResolvedValueOnce({ thread: thread(clientUserId) });

    await expect(
      linkMessagingThreadClient(threadId, { clientUserId }, "link-key-1")
    ).resolves.toMatchObject({ clientUserId });
    await expect(
      createMessagingThreadClient(threadId, { displayName: "Марина" }, "create-key-1")
    ).resolves.toMatchObject({ clientUserId });
    await expect(markMessagingThreadRead(threadId)).resolves.toMatchObject({
      thread: { unreadCount: 0 }
    });

    expect(post).toHaveBeenNthCalledWith(
      1,
      `/messaging/threads/${threadId}/link-client`,
      { clientUserId },
      { csrf: true, headers: { "idempotency-key": "link-key-1" } }
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/messaging/threads/${threadId}/create-client`,
      { displayName: "Марина" },
      { csrf: true, headers: { "idempotency-key": "create-key-1" } }
    );
    expect(post).toHaveBeenNthCalledWith(3, `/messaging/threads/${threadId}/read`, undefined, {
      csrf: true
    });
  });
});

function channelConnection(overrides: { status?: "connecting" | "active" } = {}) {
  return {
    id: connectionId,
    provider: "telegram",
    mode: "telegram_business_bot",
    status: overrides.status ?? "active",
    displayName: "Alisa",
    username: "alisa",
    capabilities: {
      canSend: true,
      canReceive: true,
      canRead: true,
      supportsHistoryImport: false,
      supportsMessageEdits: true,
      supportsMessageDeletes: true,
      supportsAttachments: true
    },
    connectedAt: overrides.status === "connecting" ? null : "2026-07-22T10:00:00.000Z",
    lastSyncedAt: null,
    lastErrorCode: null
  };
}

function thread(clientUserIdValue: string | null = null) {
  return {
    id: threadId,
    clientUserId: clientUserIdValue,
    status: "open",
    primaryIdentity: null,
    lastMessage: null,
    lastMessageAt: null,
    unreadCount: clientUserIdValue ? 0 : 2,
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z"
  };
}

function message() {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    threadId,
    channelConnectionId: connectionId,
    externalIdentityId: null,
    direction: "outbound",
    senderKind: "astrologer",
    contentType: "text",
    text: "Hello",
    mediaAssetId: null,
    status: "queued",
    failureCode: null,
    providerSentAt: null,
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z"
  };
}
