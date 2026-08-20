import { describe, expect, it } from "vitest";
import type { MessagingThread } from "@elevenhouse/contracts";

import { filterInboxThreads } from "./inboxThreadFilters";

describe("filterInboxThreads", () => {
  it("matches linked CRM client names", () => {
    expect(
      filterInboxThreads([threadWithLinkedClient], {
        activeFilter: "all",
        search: "codex"
      }).map((thread) => thread.id)
    ).toEqual([threadWithLinkedClient.id]);
  });
});

const threadWithLinkedClient = {
  id: "10000000-0000-4000-8000-000000000010",
  clientUserId: "10000000-0000-4000-8000-000000000020",
  linkedClient: {
    userId: "10000000-0000-4000-8000-000000000020",
    displayName: "Codex AstroDiary Client",
    birthDate: null
  },
  status: "open",
  primaryIdentity: {
    id: "10000000-0000-4000-8000-000000000030",
    channelConnectionId: "10000000-0000-4000-8000-000000000001",
    provider: "telegram",
    providerUserId: "telegram-user-1",
    providerChatId: "telegram-chat-1",
    username: "external_user",
    displayName: "External User",
    avatarMediaId: null,
    linkedClientUserId: "10000000-0000-4000-8000-000000000020",
    linkStatus: "linked",
    firstSeenAt: "2026-08-20T12:00:00.000Z",
    lastSeenAt: "2026-08-20T12:00:00.000Z"
  },
  lastMessage: null,
  lastMessageAt: null,
  unreadCount: 0,
  createdAt: "2026-08-20T12:00:00.000Z",
  updatedAt: "2026-08-20T12:00:00.000Z"
} satisfies MessagingThread;
