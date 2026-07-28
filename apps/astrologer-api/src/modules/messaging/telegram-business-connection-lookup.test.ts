import { describe, expect, it, vi } from "vitest";
import { TelegramBusinessBotApiConnectionLookup } from "./telegram-business-connection-lookup";

describe("TelegramBusinessBotApiConnectionLookup", () => {
  it("loads and normalizes a Telegram Business connection", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: "bc_123",
            user: {
              id: 987654321,
              first_name: "Alisa",
              last_name: "Moon",
              username: "alisa_astro"
            },
            user_chat_id: 123456789,
            date: 1784714400,
            is_enabled: true,
            rights: {
              can_reply: true,
              can_read_messages: true,
              can_delete_sent_messages: true
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const lookup = new TelegramBusinessBotApiConnectionLookup(
      { botToken: "telegram-token", botApiBaseUrl: "https://telegram.test/" },
      fetchFn as never
    );

    await expect(lookup.findBusinessConnection("bc_123")).resolves.toEqual(
      expect.objectContaining({
        businessConnectionId: "bc_123",
        userId: "987654321",
        userChatId: "123456789",
        username: "alisa_astro",
        displayName: "Alisa Moon",
        connectedAt: "2026-07-22T10:00:00.000Z",
        enabled: true,
        rights: expect.objectContaining({
          canReply: true,
          canReadMessages: true,
          canDeleteSentMessages: true,
          canDeleteAllMessages: false
        })
      })
    );
    expect(fetchFn).toHaveBeenCalledWith("https://telegram.test/bottelegram-token/getBusinessConnection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ business_connection_id: "bc_123" })
    });
  });

  it("treats permanent Telegram lookup failures as an unavailable connection", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error_code: 403 }), {
        status: 403,
        headers: { "content-type": "application/json" }
      })
    );
    const lookup = new TelegramBusinessBotApiConnectionLookup(
      { botToken: "telegram-token", botApiBaseUrl: "https://telegram.test" },
      fetchFn as never
    );

    await expect(lookup.findBusinessConnection("bc_123")).resolves.toBeNull();
  });
});
