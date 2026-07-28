import { describe, expect, it } from "vitest";
import {
  MessagingChannelConnectionResponseSchema,
  MessagingChannelModeSchema,
  MessagingMessageMediaSourceResponseSchema,
  MessagingMessageSchema,
  MessagingThreadDetailQuerySchema,
  MessagingProviderSchema,
  MessagingRealtimeEventSchema,
  StartTelegramBusinessConnectionResponseSchema,
  StartTelegramMtprotoConnectionRequestSchema,
  SubmitTelegramMtprotoCodeRequestSchema,
  SubmitTelegramMtprotoPasswordRequestSchema,
  TelegramMtprotoLoginResponseSchema,
  SendMessagingMessageRequestSchema
} from "./messaging";

const channelConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  provider: "telegram",
  mode: "telegram_business_bot",
  status: "active",
  displayName: "Alisa Vega",
  username: "alisa_vega",
  capabilities: {
    canSend: true,
    canReceive: true,
    canRead: true,
    supportsHistoryImport: false,
    supportsMessageEdits: true,
    supportsMessageDeletes: true,
    supportsAttachments: true
  },
  connectedAt: "2026-07-21T10:00:00.000Z",
  lastSyncedAt: null,
  lastErrorCode: null
};

describe("messaging contracts", () => {
  it("accepts current and future messaging providers", () => {
    expect(MessagingProviderSchema.parse("telegram")).toBe("telegram");
    expect(MessagingProviderSchema.parse("instagram")).toBe("instagram");
  });

  it("accepts Telegram Business, Telegram Account, and Instagram channel modes", () => {
    expect(MessagingChannelModeSchema.parse("telegram_business_bot")).toBe("telegram_business_bot");
    expect(MessagingChannelModeSchema.parse("telegram_mtproto_account")).toBe(
      "telegram_mtproto_account"
    );
    expect(MessagingChannelModeSchema.parse("instagram_graph")).toBe("instagram_graph");
  });

  it("trims outbound text and rejects empty messages", () => {
    expect(SendMessagingMessageRequestSchema.parse({ text: "  Привет  " })).toEqual({
      text: "Привет"
    });
    expect(() => SendMessagingMessageRequestSchema.parse({ text: "   " })).toThrow();
  });

  it("does not cap thread detail reads unless pagination is explicit", () => {
    expect(MessagingThreadDetailQuerySchema.parse({})).toEqual({ offset: 0 });
    expect(MessagingThreadDetailQuerySchema.parse({ limit: "250", offset: "25" })).toEqual({
      limit: 250,
      offset: 25
    });
  });

  it("accepts message-received realtime events with a required opaque event id", () => {
    expect(
      MessagingRealtimeEventSchema.parse({
        eventId: "00000000000000000042",
        type: "message.received",
        occurredAt: "2026-07-21T10:00:00.000Z",
        threadId: "22222222-2222-4222-8222-222222222222",
        messageId: "33333333-3333-4333-8333-333333333333"
      })
    ).toMatchObject({ eventId: "00000000000000000042", type: "message.received" });
    expect(() =>
      MessagingRealtimeEventSchema.parse({
        type: "message.received",
        occurredAt: "2026-07-21T10:00:00.000Z"
      })
    ).toThrow();
  });

  it("rejects raw provider credential and session fields from connection responses", () => {
    expect(
      MessagingChannelConnectionResponseSchema.parse({ channelConnections: [channelConnection] })
    ).toMatchObject({ channelConnections: [{ id: channelConnection.id }] });
    expect(() =>
      MessagingChannelConnectionResponseSchema.parse({
        channelConnections: [{ ...channelConnection, providerToken: "secret" }]
      })
    ).toThrow();
    expect(() =>
      MessagingChannelConnectionResponseSchema.parse({
        channelConnections: [{ ...channelConnection, sessionCiphertext: "secret" }]
      })
    ).toThrow();
  });

  it("accepts Telegram Business start responses without exposing provider secrets", () => {
    const response = StartTelegramBusinessConnectionResponseSchema.parse({
      channelConnection: { ...channelConnection, status: "connecting", connectedAt: null },
      telegramBotUsername: "elevenhouse_test_bot",
      telegramBotUrl: "https://t.me/elevenhouse_test_bot"
    });

    expect(response.channelConnection.status).toBe("connecting");
    expect(response.telegramBotUrl).toBe("https://t.me/elevenhouse_test_bot");
    expect(() =>
      StartTelegramBusinessConnectionResponseSchema.parse({
        channelConnection: { ...channelConnection, businessConnectionId: "bc_secret" },
        telegramBotUsername: "elevenhouse_test_bot",
        telegramBotUrl: "https://t.me/elevenhouse_test_bot"
      })
    ).toThrow();
  });

  it("accepts Telegram Account start requests only with explicit account-access consent", () => {
    expect(
      StartTelegramMtprotoConnectionRequestSchema.parse({
        phoneNumber: "  +7 800 555-35-35  ",
        consentAccepted: true
      })
    ).toEqual({
      phoneNumber: "+7 800 555-35-35",
      consentAccepted: true
    });
    expect(() =>
      StartTelegramMtprotoConnectionRequestSchema.parse({
        phoneNumber: "+78005553535",
        consentAccepted: false
      })
    ).toThrow();
  });

  it("accepts Telegram Account code and password steps without exposing session material", () => {
    expect(
      SubmitTelegramMtprotoCodeRequestSchema.parse({
        channelConnectionId: channelConnection.id,
        code: " 777777 "
      })
    ).toEqual({ channelConnectionId: channelConnection.id, code: "777777" });

    expect(
      SubmitTelegramMtprotoPasswordRequestSchema.parse({
        channelConnectionId: channelConnection.id,
        password: " telegram 2fa password "
      })
    ).toEqual({
      channelConnectionId: channelConnection.id,
      password: " telegram 2fa password "
    });
  });

  it("accepts Telegram Account login responses without raw phone, code, password or session", () => {
    const response = TelegramMtprotoLoginResponseSchema.parse({
      channelConnection: {
        ...channelConnection,
        mode: "telegram_mtproto_account",
        status: "connecting",
        connectedAt: null
      },
      loginStep: "code_required",
      maskedPhoneNumber: "+7******3535",
      retryAfterSeconds: null
    });

    expect(response.loginStep).toBe("code_required");
    expect(response.maskedPhoneNumber).toBe("+7******3535");
    expect(() =>
      TelegramMtprotoLoginResponseSchema.parse({
        ...response,
        sessionString: "secret-session"
      })
    ).toThrow();
  });

  it("accepts voice message media state without exposing provider file identifiers", () => {
    const message = MessagingMessageSchema.parse({
      id: "33333333-3333-4333-8333-333333333333",
      threadId: "22222222-2222-4222-8222-222222222222",
      channelConnectionId: "11111111-1111-4111-8111-111111111111",
      externalIdentityId: "44444444-4444-4444-8444-444444444444",
      direction: "inbound",
      senderKind: "client",
      contentType: "voice",
      text: "Голосовое сообщение (0:12)",
      mediaAssetId: null,
      media: {
        mediaAssetId: null,
        kind: "voice",
        status: "pending",
        durationSeconds: 12,
        mimeType: "audio/ogg",
        sizeBytes: 3210
      },
      status: "received",
      failureCode: null,
      providerSentAt: "2026-07-27T10:00:00.000Z",
      createdAt: "2026-07-27T10:00:01.000Z",
      updatedAt: "2026-07-27T10:00:01.000Z"
    });

    expect(message.media).toEqual({
      mediaAssetId: null,
      kind: "voice",
      status: "pending",
      durationSeconds: 12,
      width: null,
      height: null,
      mimeType: "audio/ogg",
      sizeBytes: 3210
    });
    expect(() =>
      MessagingMessageSchema.parse({
        ...message,
        media: { ...message.media, providerFileId: "telegram-file-id" }
      })
    ).toThrow();
  });

  it("accepts image message media state with dimensions", () => {
    const message = MessagingMessageSchema.parse({
      id: "33333333-3333-4333-8333-333333333334",
      threadId: "22222222-2222-4222-8222-222222222222",
      channelConnectionId: "11111111-1111-4111-8111-111111111111",
      externalIdentityId: "44444444-4444-4444-8444-444444444444",
      direction: "inbound",
      senderKind: "client",
      contentType: "image",
      text: "Фото",
      mediaAssetId: "55555555-5555-4555-8555-555555555555",
      media: {
        mediaAssetId: "55555555-5555-4555-8555-555555555555",
        kind: "image",
        status: "ready",
        durationSeconds: null,
        width: 1280,
        height: 720,
        mimeType: "image/jpeg",
        sizeBytes: 123456
      },
      status: "received",
      failureCode: null,
      providerSentAt: "2026-07-27T10:00:00.000Z",
      createdAt: "2026-07-27T10:00:01.000Z",
      updatedAt: "2026-07-27T10:00:01.000Z"
    });

    expect(message.media).toMatchObject({
      kind: "image",
      status: "ready",
      width: 1280,
      height: 720
    });
  });

  it("accepts Telegram video-note message media state with duration and dimensions", () => {
    const message = MessagingMessageSchema.parse({
      id: "33333333-3333-4333-8333-333333333335",
      threadId: "22222222-2222-4222-8222-222222222222",
      channelConnectionId: "11111111-1111-4111-8111-111111111111",
      externalIdentityId: "44444444-4444-4444-8444-444444444444",
      direction: "outbound",
      senderKind: "astrologer",
      contentType: "video_note",
      text: "Видео кружок (0:05)",
      mediaAssetId: null,
      media: {
        mediaAssetId: null,
        kind: "video_note",
        status: "pending",
        durationSeconds: 5,
        width: 384,
        height: 384,
        mimeType: "video/mp4",
        sizeBytes: 654321
      },
      status: "sent",
      failureCode: null,
      providerSentAt: "2026-07-27T10:00:00.000Z",
      createdAt: "2026-07-27T10:00:01.000Z",
      updatedAt: "2026-07-27T10:00:01.000Z"
    });

    expect(message.contentType).toBe("video_note");
    expect(message.media).toMatchObject({
      kind: "video_note",
      durationSeconds: 5,
      width: 384,
      height: 384
    });
  });

  it("accepts Telegram video message media state with duration and dimensions", () => {
    const message = MessagingMessageSchema.parse({
      id: "33333333-3333-4333-8333-333333333336",
      threadId: "22222222-2222-4222-8222-222222222222",
      channelConnectionId: "11111111-1111-4111-8111-111111111111",
      externalIdentityId: "44444444-4444-4444-8444-444444444444",
      direction: "inbound",
      senderKind: "client",
      contentType: "video",
      text: "Расклад по дому",
      mediaAssetId: null,
      media: {
        mediaAssetId: null,
        kind: "video",
        status: "pending",
        durationSeconds: 18,
        width: 1280,
        height: 720,
        mimeType: "video/mp4",
        sizeBytes: 7654321
      },
      status: "received",
      failureCode: null,
      providerSentAt: "2026-07-27T10:00:00.000Z",
      createdAt: "2026-07-27T10:00:01.000Z",
      updatedAt: "2026-07-27T10:00:01.000Z"
    });

    expect(message.contentType).toBe("video");
    expect(message.media).toMatchObject({
      kind: "video",
      durationSeconds: 18,
      width: 1280,
      height: 720
    });
  });

  it("accepts a short-lived voice media source response", () => {
    expect(
      MessagingMessageMediaSourceResponseSchema.parse({
        url: "https://media.example/private/voice.ogg?signature=abc",
        expiresAt: "2026-07-27T10:05:00.000Z",
        mimeType: "audio/ogg"
      })
    ).toEqual({
      url: "https://media.example/private/voice.ogg?signature=abc",
      expiresAt: "2026-07-27T10:05:00.000Z",
      mimeType: "audio/ogg"
    });
  });
});
