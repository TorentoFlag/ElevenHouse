import { describe, expect, it } from "vitest";
import {
  MessagingChannelConnectionResponseSchema,
  MessagingChannelModeSchema,
  MessagingThreadDetailQuerySchema,
  MessagingProviderSchema,
  MessagingRealtimeEventSchema,
  StartTelegramBusinessConnectionResponseSchema,
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
});
