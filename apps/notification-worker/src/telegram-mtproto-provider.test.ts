import { describe, expect, it } from "vitest";
import {
  TelegramMtprotoMessagingProvider,
  type TelegramMtprotoClientSendInput
} from "./telegram-mtproto-provider";

describe("TelegramMtprotoMessagingProvider", () => {
  it("sends messages with a deterministic provider random id", async () => {
    const sentMessages: TelegramMtprotoClientSendInput[] = [];
    const client = {
      sendMessage: async (input: TelegramMtprotoClientSendInput) => {
        sentMessages.push(input);
        return { providerMessageId: "991" };
      }
    };
    const provider = new TelegramMtprotoMessagingProvider({
      client,
      apiHash: "0123456789abcdef0123456789abcdef",
      sessionDescriptor: "session:connection-1"
    });

    await expect(
      provider.sendMessage({
        messageId: "11111111-1111-4111-8111-111111111111",
        peerId: "777000",
        text: "Hello"
      })
    ).resolves.toEqual({
      provider: "telegram",
      status: "sent",
      retryable: false,
      providerMessageId: "991"
    });
    expect(sentMessages[0]).toEqual({
      peerId: "777000",
      text: "Hello",
      randomId: expect.any(BigInt)
    });

    const firstRandomId = sentMessages[0]?.randomId;
    await provider.sendMessage({
      messageId: "11111111-1111-4111-8111-111111111111",
      peerId: "777000",
      text: "Hello again"
    });
    expect(sentMessages[1]?.randomId).toBe(firstRandomId);
  });

  it("maps Telegram flood waits to retryable failures", async () => {
    const provider = new TelegramMtprotoMessagingProvider({
      client: {
        sendMessage: async () => {
          throw new Error("FLOOD_WAIT_42");
        }
      },
      apiHash: "0123456789abcdef0123456789abcdef",
      sessionDescriptor: "session:connection-1"
    });

    await expect(
      provider.sendMessage({
        messageId: "11111111-1111-4111-8111-111111111111",
        peerId: "777000",
        text: "Hello"
      })
    ).resolves.toEqual({
      provider: "telegram",
      status: "failed",
      retryable: true,
      errorCode: "TELEGRAM_MTPROTO_FLOOD_WAIT",
      errorMessage: "Telegram MTProto flood wait",
      retryAfterSeconds: 42
    });
  });

  it("redacts MTProto credentials from provider errors", async () => {
    const provider = new TelegramMtprotoMessagingProvider({
      client: {
        sendMessage: async () => {
          throw new Error(
            "auth failed for 0123456789abcdef0123456789abcdef using session:connection-1"
          );
        }
      },
      apiHash: "0123456789abcdef0123456789abcdef",
      sessionDescriptor: "session:connection-1"
    });

    const result = await provider.sendMessage({
      messageId: "11111111-1111-4111-8111-111111111111",
      peerId: "777000",
      text: "Hello"
    });

    expect(result).toMatchObject({
      provider: "telegram",
      status: "unknown",
      retryable: true,
      errorCode: "TELEGRAM_MTPROTO_EXCEPTION",
      errorMessage: "auth failed for [telegram-mtproto-api-hash] using [telegram-mtproto-session]"
    });
    expect(JSON.stringify(result)).not.toContain("0123456789abcdef0123456789abcdef");
    expect(JSON.stringify(result)).not.toContain("session:connection-1");
  });
});
