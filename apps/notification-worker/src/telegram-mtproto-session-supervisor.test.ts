import { describe, expect, it, vi } from "vitest";
import type { TelegramMtprotoSessionProcessingStore } from "@elevenhouse/db/messaging";
import {
  TelegramMtprotoSessionSupervisor,
  type TelegramMtprotoSessionCipher,
  type TelegramMtprotoSessionClient
} from "./telegram-mtproto-session-supervisor";
import type { TelegramMtprotoIncomingMessage } from "./telegram-mtproto-inbound.processor";

describe("TelegramMtprotoSessionSupervisor", () => {
  it("claims authorized sessions, decrypts them with owner-scoped AAD, and exposes a local provider", async () => {
    const client = createClient();
    const store = createStore();
    const cipher: TelegramMtprotoSessionCipher = {
      decrypt: vi.fn(() => "session:decrypted")
    };
    const supervisor = new TelegramMtprotoSessionSupervisor({
      store,
      cipher,
      apiHash: "0123456789abcdef0123456789abcdef",
      leaseOwner: "notification-worker:pid-1",
      leaseDurationMs: 60_000,
      claimLimit: 5,
      clientFactory: vi.fn(async (input) => {
        expect(input).toEqual({
          channelConnectionId: "connection-1",
          session: "session:decrypted"
        });
        return client;
      })
    });

    await supervisor.tick(new Date("2026-07-28T10:00:00.000Z"));

    expect(store.claimAvailable).toHaveBeenCalledWith({
      leaseOwner: "notification-worker:pid-1",
      now: new Date("2026-07-28T10:00:00.000Z"),
      leaseDurationMs: 60_000,
      limit: 5
    });
    expect(cipher.decrypt).toHaveBeenCalledWith({
      encrypted: encryptedSession,
      aad: "messaging:telegram_mtproto:astrologer-1:session"
    });
    expect(client.connect).toHaveBeenCalledTimes(1);

    await supervisor.getProvider("connection-1")?.sendMessage({
      messageId: "message-1",
      peerId: "777000",
      text: "Hello"
    });
    expect(client.sendMessage).toHaveBeenCalledWith({
      peerId: "777000",
      text: "Hello",
      randomId: expect.any(BigInt)
    });
  });

  it("heartbeats active sessions without decrypting them again", async () => {
    const store = createStore();
    const cipher: TelegramMtprotoSessionCipher = {
      decrypt: vi.fn(() => "session:decrypted")
    };
    const supervisor = new TelegramMtprotoSessionSupervisor({
      store,
      cipher,
      apiHash: "0123456789abcdef0123456789abcdef",
      leaseOwner: "notification-worker:pid-1",
      leaseDurationMs: 60_000,
      claimLimit: 5,
      clientFactory: vi.fn(async () => createClient())
    });

    await supervisor.tick(new Date("2026-07-28T10:00:00.000Z"));
    await supervisor.tick(new Date("2026-07-28T10:00:30.000Z"));

    expect(cipher.decrypt).toHaveBeenCalledTimes(1);
    expect(store.heartbeat).toHaveBeenCalledWith({
      channelConnectionId: "connection-1",
      leaseOwner: "notification-worker:pid-1",
      now: new Date("2026-07-28T10:00:30.000Z"),
      leaseDurationMs: 60_000
    });
  });

  it("forwards live MTProto messages from a leased session to the inbound handler", async () => {
    let messageHandler: ((message: TelegramMtprotoIncomingMessage) => Promise<void> | void) | null = null;
    const unsubscribe = vi.fn();
    const client = createClient({
      onNewMessage: vi.fn((handler: (message: TelegramMtprotoIncomingMessage) => Promise<void> | void) => {
        messageHandler = handler;
        return unsubscribe;
      })
    });
    const inboundHandler = vi.fn(async () => undefined);
    const inboundNow = new Date("2026-07-28T10:00:03.000Z");
    const supervisor = new TelegramMtprotoSessionSupervisor({
      store: createStore(),
      cipher: { decrypt: vi.fn(() => "session:decrypted") },
      apiHash: "0123456789abcdef0123456789abcdef",
      leaseOwner: "notification-worker:pid-1",
      leaseDurationMs: 60_000,
      claimLimit: 5,
      clientFactory: vi.fn(async () => client),
      nowProvider: () => inboundNow,
      inboundMessageHandler: inboundHandler
    });
    const message: TelegramMtprotoIncomingMessage = {
      providerMessageId: "4401",
      providerChatId: "777",
      providerUserId: "555",
      username: "marina",
      displayName: "Marina",
      isOutgoing: false,
      text: "Хочу записаться",
      providerSentAt: "2026-07-28T10:00:02.000Z",
      cursor: { pts: 128, qts: null, dateCursor: "2026-07-28T10:00:02.000Z", seq: 9 }
    };

    await supervisor.tick(new Date("2026-07-28T10:00:00.000Z"));
    const registeredMessageHandler = messageHandler as
      | ((message: TelegramMtprotoIncomingMessage) => Promise<void> | void)
      | null;
    if (!registeredMessageHandler) throw new Error("Expected MTProto new-message handler to be registered");
    await registeredMessageHandler(message);

    expect(client.onNewMessage).toHaveBeenCalledTimes(1);
    expect(inboundHandler).toHaveBeenCalledWith({
      session: {
        channelConnectionId: "connection-1",
        astrologerUserId: "astrologer-1",
        telegramUserId: "telegram-user-1",
        leaseOwner: "notification-worker:pid-1"
      },
      message,
      now: inboundNow
    });

    await supervisor.shutdown(new Date("2026-07-28T10:01:00.000Z"));
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("disconnects and releases locally owned sessions on shutdown", async () => {
    const client = createClient();
    const store = createStore();
    const supervisor = new TelegramMtprotoSessionSupervisor({
      store,
      cipher: { decrypt: vi.fn(() => "session:decrypted") },
      apiHash: "0123456789abcdef0123456789abcdef",
      leaseOwner: "notification-worker:pid-1",
      leaseDurationMs: 60_000,
      claimLimit: 5,
      clientFactory: vi.fn(async () => client)
    });
    const now = new Date("2026-07-28T10:02:00.000Z");

    await supervisor.tick(new Date("2026-07-28T10:00:00.000Z"));
    await supervisor.shutdown(now);

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(store.release).toHaveBeenCalledWith({
      channelConnectionId: "connection-1",
      leaseOwner: "notification-worker:pid-1",
      now
    });
    expect(supervisor.getProvider("connection-1")).toBeNull();
  });
});

const encryptedSession = {
  algorithm: "aes-256-gcm" as const,
  keyId: "telegram_mtproto_v1",
  iv: "iv",
  authTag: "auth-tag",
  ciphertext: "ciphertext"
};

function createStore(): TelegramMtprotoSessionProcessingStore {
  return {
    claimAvailable: vi.fn(async () => [
      {
        channelConnectionId: "connection-1",
        astrologerUserId: "astrologer-1",
        encryptedSession,
        telegramUserId: "telegram-user-1",
        pts: null,
        qts: null,
        dateCursor: null,
        seq: null
      }
    ]),
    heartbeat: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
    markReauthRequired: vi.fn(async () => undefined),
    updateCursors: vi.fn(async () => undefined)
  };
}

function createClient(
  overrides: Partial<TelegramMtprotoSessionClient> = {}
): TelegramMtprotoSessionClient {
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    sendMessage: vi.fn(async () => ({ providerMessageId: "991" })),
    ...overrides
  };
}
