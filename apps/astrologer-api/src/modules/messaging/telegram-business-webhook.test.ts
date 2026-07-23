import { describe, expect, it } from "vitest";
import { parseTelegramBusinessWebhookUpdate } from "./telegram-business-webhook";

describe("parseTelegramBusinessWebhookUpdate", () => {
  it("accepts business_connection updates with rights and enabled state", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1001,
        business_connection: {
          id: "bc_123",
          user: {
            id: 987654321,
            is_bot: false,
            first_name: "Alisa",
            username: "alisa_astro"
          },
          user_chat_id: 123456789,
          date: 1784700000,
          rights: {
            can_reply: true,
            can_read_messages: true,
            can_delete_sent_messages: true
          },
          is_enabled: true
        }
      })
    ).toEqual({
      kind: "business_connection",
      updateId: "1001",
      businessConnectionId: "bc_123",
      userId: "987654321",
      userChatId: "123456789",
      username: "alisa_astro",
      displayName: "Alisa",
      connectedAt: "2026-07-22T06:00:00.000Z",
      enabled: true,
      rights: {
        canReply: true,
        canReadMessages: true,
        canDeleteSentMessages: true,
        canDeleteAllMessages: false,
        canEditName: false,
        canEditBio: false,
        canEditProfilePhoto: false,
        canEditUsername: false,
        canChangeGiftSettings: false,
        canViewGiftsAndStars: false,
        canConvertGiftsToStars: false,
        canTransferAndUpgradeGifts: false,
        canTransferStars: false,
        canManageStories: false
      }
    });
  });

  it("accepts business_message text updates", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1002,
        business_message: {
          message_id: 345,
          business_connection_id: "bc_123",
          from: {
            id: 555,
            is_bot: false,
            first_name: "Marina",
            last_name: "Solar",
            username: "marina_solar"
          },
          chat: {
            id: 777,
            type: "private",
            first_name: "Marina",
            last_name: "Solar",
            username: "marina_solar"
          },
          date: 1784700060,
          text: "Здравствуйте"
        }
      })
    ).toEqual({
      kind: "business_message",
      updateId: "1002",
      businessConnectionId: "bc_123",
      providerMessageId: "345",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina Solar",
      providerSentAt: "2026-07-22T06:01:00.000Z",
      contentType: "text",
      text: "Здравствуйте"
    });
  });

  it("maps unsupported business messages without throwing", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1003,
        business_message: {
          message_id: 346,
          business_connection_id: "bc_123",
          chat: { id: 777, type: "private" },
          date: 1784700060,
          sticker: { file_id: "sticker-1", file_unique_id: "unique-1", type: "regular", width: 128, height: 128, is_animated: false, is_video: false }
        }
      })
    ).toMatchObject({
      kind: "business_message",
      contentType: "unsupported",
      text: null
    });
  });

  it("rejects payloads missing required Telegram business identifiers", () => {
    expect(() =>
      parseTelegramBusinessWebhookUpdate({
        update_id: 1004,
        business_message: {
          message_id: 347,
          chat: { id: 777, type: "private" },
          date: 1784700060,
          text: "No business connection"
        }
      })
    ).toThrow("Telegram business message is missing required identifiers");
  });

  it("rejects string identifiers for Telegram integer fields", () => {
    expect(() =>
      parseTelegramBusinessWebhookUpdate({
        update_id: "1005",
        business_message: {
          message_id: 348,
          business_connection_id: "bc_123",
          chat: { id: 777, type: "private" },
          date: 1784700060,
          text: "Malformed update id"
        }
      })
    ).toThrow();

    expect(() =>
      parseTelegramBusinessWebhookUpdate({
        update_id: 1005,
        business_message: {
          message_id: "348",
          business_connection_id: "bc_123",
          chat: { id: 777, type: "private" },
          date: 1784700060,
          text: "Malformed message id"
        }
      })
    ).toThrow();
  });
});
