import type { MessagingThread } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { filterInboxThreads } from "./inboxThreadFilters";

describe("filterInboxThreads", () => {
  it("filters threads by unread state and provider without inventing channel data", () => {
    const telegramUnread = threadFixture({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      provider: "telegram",
      unreadCount: 2,
      displayName: "Марина Краснова"
    });
    const telegramRead = threadFixture({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      provider: "telegram",
      unreadCount: 0,
      displayName: "Вера Морозова"
    });
    const instagramUnread = threadFixture({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      provider: "instagram",
      unreadCount: 1,
      displayName: "Алёна Жукова"
    });

    expect(
      filterInboxThreads([telegramUnread, telegramRead, instagramUnread], {
        search: "",
        activeFilter: "unread"
      })
    ).toEqual([telegramUnread, instagramUnread]);
    expect(
      filterInboxThreads([telegramUnread, telegramRead, instagramUnread], {
        search: "",
        activeFilter: "telegram"
      })
    ).toEqual([telegramUnread, telegramRead]);
    expect(
      filterInboxThreads([telegramUnread, telegramRead, instagramUnread], {
        search: "жукова",
        activeFilter: "instagram"
      })
    ).toEqual([instagramUnread]);
  });
});

function threadFixture(input: {
  readonly id: string;
  readonly provider: NonNullable<MessagingThread["primaryIdentity"]>["provider"];
  readonly unreadCount: number;
  readonly displayName: string;
}): MessagingThread {
  return {
    id: input.id,
    clientUserId: null,
    status: "open",
    primaryIdentity: {
      id: input.id.replace("aaaa", "bbbb"),
      channelConnectionId: "11111111-1111-4111-8111-111111111111",
      provider: input.provider,
      providerUserId: "provider-user",
      providerChatId: "provider-chat",
      username: null,
      displayName: input.displayName,
      avatarMediaId: null,
      linkedClientUserId: null,
      linkStatus: "unlinked",
      firstSeenAt: "2026-07-22T09:00:00.000Z",
      lastSeenAt: "2026-07-22T10:00:00.000Z"
    },
    lastMessage: null,
    lastMessageAt: "2026-07-22T10:00:00.000Z",
    unreadCount: input.unreadCount,
    createdAt: "2026-07-22T09:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z"
  };
}
