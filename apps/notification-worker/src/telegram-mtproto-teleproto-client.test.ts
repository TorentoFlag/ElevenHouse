import { describe, expect, it } from "vitest";
import {
  createTeleprotoMtprotoSessionClientFactory,
  TeleprotoMtprotoClient
} from "./telegram-mtproto-teleproto-client";

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

  it("creates connected session clients from saved StringSession values", async () => {
    const createdClients: FakeTelegramClient[] = [];
    const factory = createTeleprotoMtprotoSessionClientFactory({
      apiId: 12345,
      apiHash: "0123456789abcdef0123456789abcdef",
      TelegramClientCtor: class extends FakeTelegramClient {
        constructor(session: unknown, apiId: number, apiHash: string, options: unknown) {
          super(session, apiId, apiHash, options);
          createdClients.push(this);
        }
      },
      StringSessionCtor: FakeStringSession
    });

    const client = await factory({
      channelConnectionId: "connection-1",
      session: "session:encrypted"
    });
    await client.connect();
    await client.disconnect();

    expect(createdClients).toHaveLength(1);
    expect(createdClients[0]).toMatchObject({
      session: new FakeStringSession("session:encrypted"),
      apiId: 12345,
      apiHash: "0123456789abcdef0123456789abcdef",
      options: { connectionRetries: 5 },
      connected: true,
      disconnected: true
    });
  });

  it("subscribes to Teleproto NewMessage events and normalizes text message fields", async () => {
    let eventHandler: ((event: unknown) => void) | null = null;
    let eventBuilder: unknown = null;
    const createdClients: FakeTelegramClient[] = [];
    const factory = createTeleprotoMtprotoSessionClientFactory({
      apiId: 12345,
      apiHash: "0123456789abcdef0123456789abcdef",
      TelegramClientCtor: class extends FakeTelegramClient {
        constructor(session: unknown, apiId: number, apiHash: string, options: unknown) {
          super(session, apiId, apiHash, options);
          createdClients.push(this);
        }

        override addEventHandler(handler: (event: unknown) => void, builder: unknown): void {
          eventHandler = handler;
          eventBuilder = builder;
        }
      },
      StringSessionCtor: FakeStringSession
    });
    const messages: unknown[] = [];

    const client = await factory({
      channelConnectionId: "connection-1",
      session: "session:encrypted"
    });
    const unsubscribe = client.onNewMessage?.((message) => {
      messages.push(message);
    });
    const registeredEventHandler = eventHandler as ((event: unknown) => void) | null;
    if (!registeredEventHandler) throw new Error("Expected Teleproto event handler to be registered");
    registeredEventHandler({
      message: {
        id: 4401,
        peerId: { userId: new FakeBigInteger(777) },
        fromId: { userId: new FakeBigInteger(555) },
        out: false,
        message: "Хочу записаться",
        date: 1_785_233_040
      },
      originalUpdate: {
        pts: 128,
        qts: null,
        date: 1_785_233_041,
        seq: 9
      }
    });
    unsubscribe?.();

    expect(eventBuilder?.constructor.name).toBe("NewMessage");
    expect(messages).toEqual([
      {
        providerMessageId: "4401",
        providerChatId: "777",
        providerUserId: "555",
        username: null,
        displayName: null,
        isOutgoing: false,
        text: "Хочу записаться",
        providerSentAt: "2026-07-28T10:04:00.000Z",
        cursor: {
          pts: 128,
          qts: null,
          dateCursor: "2026-07-28T10:04:01.000Z",
          seq: 9
        }
      }
    ]);
    expect(createdClients[0]?.removedEventHandler).toEqual({
      handler: eventHandler,
      builder: eventBuilder
    });
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

class FakeStringSession {
  constructor(readonly value: string) {}
}

class FakeBigInteger {
  #value: number;

  constructor(value: number) {
    this.#value = value;
  }

  toString(): string {
    return String(this.#value);
  }
}

class FakeTelegramClient {
  connected = false;
  disconnected = false;
  removedEventHandler: { readonly handler: unknown; readonly builder: unknown } | null = null;

  constructor(
    readonly session: unknown,
    readonly apiId: number,
    readonly apiHash: string,
    readonly options: unknown
  ) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
  }

  async invoke(): Promise<unknown> {
    return { id: 991 };
  }

  addEventHandler(handler: (event: unknown) => void, builder: unknown): void {
    void handler;
    void builder;
  }

  removeEventHandler(handler: unknown, builder: unknown): void {
    this.removedEventHandler = { handler, builder };
  }
}
