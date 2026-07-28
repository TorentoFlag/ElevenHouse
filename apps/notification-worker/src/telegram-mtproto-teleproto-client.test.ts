import { describe, expect, it } from "vitest";
import { TeleprotoMtprotoClient } from "./telegram-mtproto-teleproto-client";

describe("TeleprotoMtprotoClient", () => {
  it("invokes low-level SendMessage with the supplied durable random id", async () => {
    const invokedRequests: unknown[] = [];
    const client = new TeleprotoMtprotoClient(
      {
        invoke: async (request: unknown) => {
          invokedRequests.push(request);
          return { id: 991 };
        }
      },
      { SendMessage: FakeSendMessage }
    );

    await expect(
      client.sendMessage({
        peerId: "777000",
        text: "Hello",
        randomId: 123456789012345678n
      })
    ).resolves.toEqual({ providerMessageId: "991" });

    const request = invokedRequests[0] as FakeSendMessage;
    expect(request).toBeInstanceOf(FakeSendMessage);
    expect(request.peer).toBe("777000");
    expect(request.message).toBe("Hello");
    expect(String(request.randomId)).toBe("123456789012345678");
  });

  it("extracts provider message id from nested update messages", async () => {
    const client = new TeleprotoMtprotoClient(
      {
        invoke: async () => ({
          updates: [
            { className: "updates.Other" },
            { message: { id: 347 } }
          ]
        })
      },
      { SendMessage: FakeSendMessage }
    );

    await expect(
      client.sendMessage({
        peerId: "777000",
        text: "Hello",
        randomId: 123456789012345678n
      })
    ).resolves.toEqual({ providerMessageId: "347" });
  });
});

class FakeSendMessage {
  readonly peer: unknown;
  readonly message: unknown;
  readonly randomId: unknown;

  constructor(input: { readonly peer: unknown; readonly message: unknown; readonly randomId: unknown }) {
    this.peer = input.peer;
    this.message = input.message;
    this.randomId = input.randomId;
  }
}
