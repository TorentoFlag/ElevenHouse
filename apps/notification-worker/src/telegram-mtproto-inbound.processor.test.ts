import { describe, expect, it, vi } from "vitest";
import type { MessagingStore, RecordTelegramMtprotoMessageStoreInput } from "@elevenhouse/domain";
import { processTelegramMtprotoInboundMessage } from "./telegram-mtproto-inbound.processor";

describe("processTelegramMtprotoInboundMessage", () => {
  it("records normalized MTProto messages through the messaging domain use case", async () => {
    const commands: RecordTelegramMtprotoMessageStoreInput[] = [];
    const store = {
      recordTelegramMtprotoMessage: vi.fn(async (input: RecordTelegramMtprotoMessageStoreInput) => {
        commands.push(input);
        return { kind: "unmatched" as const };
      })
    };

    await expect(
      processTelegramMtprotoInboundMessage({
        store: store as unknown as MessagingStore,
        session: {
          channelConnectionId: "connection-1",
          leaseOwner: "notification-worker:pid-1"
        },
        message: {
          providerMessageId: "4401",
          providerChatId: "777",
          providerUserId: "555",
          username: "marina",
          displayName: "Marina",
          isOutgoing: false,
          text: "Хочу записаться",
          providerSentAt: "2026-07-28T10:04:00.000Z",
          cursor: {
            pts: 128,
            qts: null,
            dateCursor: "2026-07-28T10:04:01.000Z",
            seq: 9
          }
        },
        now: new Date("2026-07-28T10:04:02.000Z")
      })
    ).resolves.toEqual({ kind: "unmatched" });

    expect(commands).toEqual([
      {
        channelConnectionId: "connection-1",
        leaseOwner: "notification-worker:pid-1",
        providerMessageId: "4401",
        providerChatId: "777",
        providerUserId: "555",
        username: "marina",
        displayName: "Marina",
        isOutgoing: false,
        text: "Хочу записаться",
        providerSentAt: "2026-07-28T10:04:00.000Z",
        cursor: {
          pts: 128,
          qts: null,
          dateCursor: "2026-07-28T10:04:01.000Z",
          seq: 9
        },
        now: "2026-07-28T10:04:02.000Z"
      }
    ]);
  });

  it("ignores non-text MTProto events until media ingestion for account sessions exists", async () => {
    const store = {
      recordTelegramMtprotoMessage: vi.fn()
    };

    await expect(
      processTelegramMtprotoInboundMessage({
        store: store as unknown as MessagingStore,
        session: {
          channelConnectionId: "connection-1",
          leaseOwner: "notification-worker:pid-1"
        },
        message: {
          providerMessageId: "4402",
          providerChatId: "777",
          providerUserId: "555",
          username: null,
          displayName: null,
          isOutgoing: false,
          text: "",
          providerSentAt: "2026-07-28T10:04:00.000Z",
          cursor: null
        },
        now: new Date("2026-07-28T10:04:02.000Z")
      })
    ).resolves.toEqual({ kind: "ignored", reason: "empty_text" });

    expect(store.recordTelegramMtprotoMessage).not.toHaveBeenCalled();
  });
});
