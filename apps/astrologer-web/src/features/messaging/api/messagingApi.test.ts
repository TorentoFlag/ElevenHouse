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
  startInstagramGraphConnection,
  startTelegramBusinessConnection,
  startTelegramMtprotoConnection,
  submitTelegramMtprotoCode,
  submitTelegramMtprotoPassword
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

  it("starts Instagram Graph connection with csrf and parses the Meta authorization URL", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue({
      channelConnection: channelConnection({
        provider: "instagram",
        mode: "instagram_graph",
        status: "connecting"
      }),
      authorizationUrl: "https://www.facebook.com/v25.0/dialog/oauth?client_id=123"
    });

    await expect(startInstagramGraphConnection()).resolves.toMatchObject({
      channelConnection: { id: connectionId, provider: "instagram", mode: "instagram_graph" },
      authorizationUrl: "https://www.facebook.com/v25.0/dialog/oauth?client_id=123"
    });

    expect(post).toHaveBeenCalledWith(
      "/messaging/channel-connections/instagram/graph/start",
      undefined,
      { csrf: true }
    );
  });

  it("runs Telegram MTProto login steps through csrf-protected endpoints", async () => {
    const post = vi
      .spyOn(application.http, "post")
      .mockResolvedValueOnce({
        channelConnection: channelConnection({
          mode: "telegram_mtproto_account",
          status: "connecting"
        }),
        loginStep: "code_required",
        maskedPhoneNumber: "+7******3535",
        retryAfterSeconds: null
      })
      .mockResolvedValueOnce({
        channelConnection: channelConnection({
          mode: "telegram_mtproto_account",
          status: "connecting"
        }),
        loginStep: "password_required",
        maskedPhoneNumber: "+7******3535",
        retryAfterSeconds: null
      })
      .mockResolvedValueOnce({
        channelConnection: channelConnection({
          mode: "telegram_mtproto_account",
          status: "active"
        }),
        loginStep: "connected",
        maskedPhoneNumber: "+7******3535",
        retryAfterSeconds: null
      });

    await expect(
      startTelegramMtprotoConnection({
        phoneNumber: " +7 800 555 35 35 ",
        consentAccepted: true
      })
    ).resolves.toMatchObject({
      loginStep: "code_required",
      channelConnection: { id: connectionId, mode: "telegram_mtproto_account" }
    });
    await expect(
      submitTelegramMtprotoCode({
        channelConnectionId: connectionId,
        code: " 777777 "
      })
    ).resolves.toMatchObject({ loginStep: "password_required" });
    await expect(
      submitTelegramMtprotoPassword({
        channelConnectionId: connectionId,
        password: "2fa-password"
      })
    ).resolves.toMatchObject({ loginStep: "connected" });

    expect(post).toHaveBeenNthCalledWith(
      1,
      "/messaging/channel-connections/telegram/mtproto/start",
      { phoneNumber: "+7 800 555 35 35", consentAccepted: true },
      { csrf: true }
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/messaging/channel-connections/telegram/mtproto/code",
      { channelConnectionId: connectionId, code: "777777" },
      { csrf: true }
    );
    expect(post).toHaveBeenNthCalledWith(
      3,
      "/messaging/channel-connections/telegram/mtproto/password",
      { channelConnectionId: connectionId, password: "2fa-password" },
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

function channelConnection(
  overrides: {
    readonly provider?: "telegram" | "instagram";
    readonly mode?: "telegram_business_bot" | "telegram_mtproto_account" | "instagram_graph";
    readonly status?: "connecting" | "active";
  } = {}
) {
  return {
    id: connectionId,
    provider: overrides.provider ?? "telegram",
    mode: overrides.mode ?? "telegram_business_bot",
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
