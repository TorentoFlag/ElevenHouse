import { describe, expect, it, vi } from "vitest";
import { TelegramBusinessMessagingDeliveryProvider } from "./telegram-business-provider";

describe("TelegramBusinessMessagingDeliveryProvider", () => {
  it("sends Bot API messages with business connection id and chat id", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, {
      ok: true,
      result: { message_id: 12345 }
    }));
    const provider = new TelegramBusinessMessagingDeliveryProvider({
      botToken: "bot-token",
      botApiBaseUrl: "https://telegram.test"
    }, fetchFn);

    await expect(
      provider.sendMessage({
        messageId: "message_1",
        businessConnectionId: "business-1",
        chatId: "chat-1",
        text: "Hello"
      })
    ).resolves.toEqual({
      provider: "telegram",
      status: "sent",
      retryable: false,
      providerStatusCode: 200,
      providerMessageId: "12345"
    });

    expect(fetchFn).toHaveBeenCalledWith("https://telegram.test/botbot-token/sendMessage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        business_connection_id: "business-1",
        chat_id: "chat-1",
        text: "Hello"
      })
    });
  });

  it("maps Telegram ok false responses to safe failure codes", async () => {
    const provider = new TelegramBusinessMessagingDeliveryProvider({
      botToken: "bot-token",
      botApiBaseUrl: "https://telegram.test/"
    }, async () => jsonResponse(200, {
      ok: false,
      error_code: 403,
      description: "Forbidden: bot was blocked by the user"
    }));

    await expect(
      provider.sendMessage({
        messageId: "message_1",
        businessConnectionId: "business-1",
        chatId: "chat-1",
        text: "Hello"
      })
    ).resolves.toEqual({
      provider: "telegram",
      status: "failed",
      retryable: false,
      providerStatusCode: 403,
      errorCode: "TELEGRAM_BUSINESS_API_403",
      errorMessage: "Forbidden: bot was blocked by the user"
    });
  });

  it("classifies rejected business connections as final reauthorization failures", async () => {
    const provider = new TelegramBusinessMessagingDeliveryProvider({
      botToken: "bot-token",
      botApiBaseUrl: "https://telegram.test"
    }, async () => jsonResponse(200, {
      ok: false,
      error_code: 400,
      description: "Bad Request: business connection not found"
    }));

    await expect(
      provider.sendMessage({
        messageId: "message_1",
        businessConnectionId: "business-1",
        chatId: "chat-1",
        text: "Hello"
      })
    ).resolves.toEqual({
      provider: "telegram",
      status: "failed",
      retryable: false,
      providerStatusCode: 400,
      providerMessageId: undefined,
      errorCode: "TELEGRAM_BUSINESS_CONNECTION_REAUTH_REQUIRED",
      errorMessage: "Bad Request: business connection not found",
      connectionStatus: "reauth_required"
    });
  });


  it("maps transport exceptions to unknown retryable results", async () => {
    const provider = new TelegramBusinessMessagingDeliveryProvider({
      botToken: "bot-token",
      botApiBaseUrl: "https://telegram.test"
    }, async () => {
      throw new Error("network timeout");
    });

    await expect(
      provider.sendMessage({
        messageId: "message_1",
        businessConnectionId: "business-1",
        chatId: "chat-1",
        text: "Hello"
      })
    ).resolves.toMatchObject({
      provider: "telegram",
      status: "unknown",
      retryable: true,
      errorCode: "TELEGRAM_BUSINESS_EXCEPTION",
      errorMessage: "network timeout"
    });
  });

  it("redacts Bot API credentials from transport exception messages", async () => {
    const provider = new TelegramBusinessMessagingDeliveryProvider({
      botToken: "bot-token",
      botApiBaseUrl: "https://api.telegram.org"
    }, async () => {
      throw new Error("POST https://api.telegram.org/botbot-token/sendMessage timed out");
    });

    const result = await provider.sendMessage({
      messageId: "message_1",
      businessConnectionId: "business-1",
      chatId: "chat-1",
      text: "Hello"
    });

    expect(result.errorMessage).toBe("POST [telegram-bot-api-url] timed out");
    expect(JSON.stringify(result)).not.toContain("bot-token");
    expect(JSON.stringify(result)).not.toContain("api.telegram.org");
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
