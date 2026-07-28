import { describe, expect, it, vi } from "vitest";
import {
  TelegramMtprotoSessionDeliveryProvider,
  type TelegramMtprotoLeasedSessionRegistry
} from "./telegram-mtproto-session-delivery-provider";

describe("TelegramMtprotoSessionDeliveryProvider", () => {
  it("sends through the locally leased MTProto session for the connection", async () => {
    const sessionProvider = {
      sendMessage: vi.fn(async () => ({
        provider: "telegram" as const,
        status: "sent" as const,
        retryable: false,
        providerMessageId: "991"
      }))
    };
    const registry: TelegramMtprotoLeasedSessionRegistry = {
      getProvider: vi.fn(() => sessionProvider)
    };
    const provider = new TelegramMtprotoSessionDeliveryProvider({ registry });

    await expect(
      provider.sendMessage({
        messageId: "11111111-1111-4111-8111-111111111111",
        channelConnectionId: "22222222-2222-4222-8222-222222222222",
        peerId: "777000",
        text: "Hello"
      })
    ).resolves.toEqual({
      provider: "telegram",
      status: "sent",
      retryable: false,
      providerMessageId: "991"
    });
    expect(sessionProvider.sendMessage).toHaveBeenCalledWith({
      messageId: "11111111-1111-4111-8111-111111111111",
      peerId: "777000",
      text: "Hello"
    });
  });

  it("returns a retryable lease-miss without creating a second Telegram session", async () => {
    const registry: TelegramMtprotoLeasedSessionRegistry = {
      getProvider: vi.fn(() => null)
    };
    const provider = new TelegramMtprotoSessionDeliveryProvider({ registry });

    await expect(
      provider.sendMessage({
        messageId: "11111111-1111-4111-8111-111111111111",
        channelConnectionId: "22222222-2222-4222-8222-222222222222",
        peerId: "777000",
        text: "Sensitive text"
      })
    ).resolves.toEqual({
      provider: "telegram",
      status: "failed",
      retryable: true,
      errorCode: "TELEGRAM_MTPROTO_SESSION_NOT_OWNED",
      errorMessage: "Telegram MTProto session is not leased by this worker"
    });
  });
});
