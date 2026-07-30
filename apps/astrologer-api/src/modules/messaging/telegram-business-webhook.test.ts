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

  it("accepts Telegram setup start messages with a deep-link token", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1002,
        message: {
          message_id: 11,
          from: {
            id: 987654321,
            is_bot: false,
            first_name: "Alisa",
            last_name: "Star",
            username: "alisa_astro"
          },
          chat: {
            id: 123456789,
            type: "private",
            first_name: "Alisa",
            last_name: "Star",
            username: "alisa_astro"
          },
          date: 1784700060,
          text: "/start 00000000000040008000000000000030_abcDEF123_-xyz"
        }
      })
    ).toEqual({
      kind: "business_setup_start",
      updateId: "1002",
      setupToken: "00000000000040008000000000000030_abcDEF123_-xyz",
      telegramUserId: "987654321",
      userChatId: "123456789",
      username: "alisa_astro",
      displayName: "Alisa Star",
      providerSentAt: "2026-07-22T06:01:00.000Z"
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
      chatUsername: "marina_solar",
      chatDisplayName: "Marina Solar",
      providerSentAt: "2026-07-22T06:01:00.000Z",
      contentType: "text",
      text: "Здравствуйте"
    });
  });

  it("accepts business_message voice updates", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1008,
        business_message: {
          message_id: 349,
          business_connection_id: "bc_123",
          from: {
            id: 555,
            is_bot: false,
            first_name: "Marina",
            username: "marina_solar"
          },
          chat: {
            id: 777,
            type: "private",
            first_name: "Marina",
            username: "marina_solar"
          },
          date: 1784700420,
          voice: {
            file_id: "voice-file-id",
            file_unique_id: "voice-file-unique-id",
            duration: 12,
            mime_type: "audio/ogg",
            file_size: 34567
          }
        }
      })
    ).toEqual({
      kind: "business_message",
      updateId: "1008",
      businessConnectionId: "bc_123",
      providerMessageId: "349",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina",
      providerSentAt: "2026-07-22T06:07:00.000Z",
      contentType: "voice",
      text: "Голосовое сообщение (0:12)",
      mediaAttachment: {
        kind: "voice",
        providerFileId: "voice-file-id",
        providerFileUniqueId: "voice-file-unique-id",
        durationSeconds: 12,
        width: null,
        height: null,
        providerMimeType: "audio/ogg",
        providerSizeBytes: 34567
      }
    });
  });

  it("accepts business_message photo updates using the largest photo size", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1009,
        business_message: {
          message_id: 350,
          business_connection_id: "bc_123",
          from: {
            id: 555,
            is_bot: false,
            first_name: "Marina",
            username: "marina_solar"
          },
          chat: {
            id: 777,
            type: "private",
            first_name: "Marina",
            username: "marina_solar"
          },
          date: 1784700480,
          caption: "Натальная карта",
          photo: [
            {
              file_id: "photo-small-id",
              file_unique_id: "photo-small-unique-id",
              width: 160,
              height: 90,
              file_size: 3000
            },
            {
              file_id: "photo-large-id",
              file_unique_id: "photo-large-unique-id",
              width: 1280,
              height: 720,
              file_size: 123456
            }
          ]
        }
      })
    ).toEqual({
      kind: "business_message",
      updateId: "1009",
      businessConnectionId: "bc_123",
      providerMessageId: "350",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina",
      providerSentAt: "2026-07-22T06:08:00.000Z",
      contentType: "image",
      text: "Натальная карта",
      mediaAttachment: {
        kind: "image",
        providerFileId: "photo-large-id",
        providerFileUniqueId: "photo-large-unique-id",
        durationSeconds: null,
        width: 1280,
        height: 720,
        providerMimeType: null,
        providerSizeBytes: 123456
      }
    });
  });

  it("accepts business_message video-note updates", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1010,
        business_message: {
          message_id: 351,
          business_connection_id: "bc_123",
          from: {
            id: 555,
            is_bot: false,
            first_name: "Marina",
            username: "marina_solar"
          },
          chat: {
            id: 777,
            type: "private",
            first_name: "Marina",
            username: "marina_solar"
          },
          date: 1784700540,
          video_note: {
            file_id: "video-note-file-id",
            file_unique_id: "video-note-file-unique-id",
            length: 384,
            duration: 5,
            file_size: 456789
          }
        }
      })
    ).toEqual({
      kind: "business_message",
      updateId: "1010",
      businessConnectionId: "bc_123",
      providerMessageId: "351",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina",
      providerSentAt: "2026-07-22T06:09:00.000Z",
      contentType: "video_note",
      text: "Видео кружок (0:05)",
      mediaAttachment: {
        kind: "video_note",
        providerFileId: "video-note-file-id",
        providerFileUniqueId: "video-note-file-unique-id",
        durationSeconds: 5,
        width: 384,
        height: 384,
        providerMimeType: "video/mp4",
        providerSizeBytes: 456789
      }
    });
  });

  it("accepts business_message regular video updates", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1012,
        business_message: {
          message_id: 353,
          business_connection_id: "bc_123",
          from: {
            id: 555,
            is_bot: false,
            first_name: "Marina",
            username: "marina_solar"
          },
          chat: {
            id: 777,
            type: "private",
            first_name: "Marina",
            username: "marina_solar"
          },
          date: 1784700660,
          caption: "Расклад по дому",
          video: {
            file_id: "video-file-id",
            file_unique_id: "video-file-unique-id",
            width: 1280,
            height: 720,
            duration: 18,
            file_name: "reading.mp4",
            mime_type: "video/mp4",
            file_size: 7654321
          }
        }
      })
    ).toEqual({
      kind: "business_message",
      updateId: "1012",
      businessConnectionId: "bc_123",
      providerMessageId: "353",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina",
      providerSentAt: "2026-07-22T06:11:00.000Z",
      contentType: "video",
      text: "Расклад по дому",
      mediaAttachment: {
        kind: "video",
        providerFileId: "video-file-id",
        providerFileUniqueId: "video-file-unique-id",
        durationSeconds: 18,
        width: 1280,
        height: 720,
        providerMimeType: "video/mp4",
        providerSizeBytes: 7654321
      }
    });
  });

  it("accepts image documents as image media when Telegram supplies an image MIME", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1011,
        business_message: {
          message_id: 352,
          business_connection_id: "bc_123",
          chat: {
            id: 777,
            type: "private",
            first_name: "Marina"
          },
          date: 1784700600,
          document: {
            file_id: "document-image-id",
            file_unique_id: "document-image-unique-id",
            file_name: "chart.png",
            mime_type: "image/png",
            file_size: 222222,
            thumbnail: {
              file_id: "thumb-id",
              file_unique_id: "thumb-unique-id",
              width: 320,
              height: 200,
              file_size: 12000
            }
          }
        }
      })
    ).toMatchObject({
      kind: "business_message",
      contentType: "image",
      text: "Изображение",
      mediaAttachment: {
        kind: "image",
        providerFileId: "document-image-id",
        providerFileUniqueId: "document-image-unique-id",
        durationSeconds: null,
        width: null,
        height: null,
        providerMimeType: "image/png",
        providerSizeBytes: 222222
      }
    });
  });

  it("accepts deleted_business_messages updates", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1006,
        deleted_business_messages: {
          business_connection_id: "bc_123",
          chat: {
            id: 777,
            type: "private",
            first_name: "Marina",
            username: "marina"
          },
          message_ids: [345, 346]
        }
      })
    ).toEqual({
      kind: "business_messages_deleted",
      updateId: "1006",
      businessConnectionId: "bc_123",
      providerChatId: "777",
      providerMessageIds: ["345", "346"]
    });
  });

  it("accepts edited_business_message text updates", () => {
    expect(
      parseTelegramBusinessWebhookUpdate({
        update_id: 1007,
        edited_business_message: {
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
          edit_date: 1784700360,
          text: "Здравствуйте, исправлено"
        }
      })
    ).toEqual({
      kind: "business_message_edited",
      updateId: "1007",
      businessConnectionId: "bc_123",
      providerMessageId: "345",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina_solar",
      displayName: "Marina Solar",
      chatUsername: "marina_solar",
      chatDisplayName: "Marina Solar",
      providerSentAt: "2026-07-22T06:01:00.000Z",
      providerEditedAt: "2026-07-22T06:06:00.000Z",
      contentType: "text",
      text: "Здравствуйте, исправлено"
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
