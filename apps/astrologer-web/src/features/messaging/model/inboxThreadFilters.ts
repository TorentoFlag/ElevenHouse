import type { MessagingChannelConnection, MessagingThread } from "@elevenhouse/contracts";

export type InboxThreadFilter = "all" | "unread" | MessagingChannelConnection["provider"];

export function filterInboxThreads(
  threads: readonly MessagingThread[],
  input: {
    readonly search: string;
    readonly activeFilter: InboxThreadFilter;
  }
): MessagingThread[] {
  const normalizedSearch = input.search.trim().toLowerCase();

  return threads.filter((thread) => {
    if (!matchesThreadFilter(thread, input.activeFilter)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const identity = thread.primaryIdentity;
    return [
      thread.linkedClient?.displayName,
      identity?.displayName,
      identity?.username,
      identity?.providerChatId,
      thread.lastMessage?.text
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedSearch));
  });
}

function matchesThreadFilter(thread: MessagingThread, filter: InboxThreadFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "unread") {
    return thread.unreadCount > 0;
  }

  return thread.primaryIdentity?.provider === filter;
}
