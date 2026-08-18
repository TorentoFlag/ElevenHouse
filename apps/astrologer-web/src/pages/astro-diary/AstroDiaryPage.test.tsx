// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { AstroDiaryJournalSummaryResponse } from "@elevenhouse/contracts";
import { I18nProvider } from "@elevenhouse/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../common/http/HttpError";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstroDiaryPage } from "./AstroDiaryPage";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
}));

vi.mock("../../Application", () => ({ application: { http } }));

afterEach(cleanup);

describe("AstroDiaryPage reply recovery", () => {
  let journalReads: number;
  let latestJournalRead: Deferred<AstroDiaryJournalSummaryResponse> | null;
  let serverDraft: { draftId: string; version: number; body: string } | null;
  let timelineFirstPage: {
    items: readonly [typeof timelineItem] | readonly [];
    nextCursor: number | null;
    visibleMaxCursor: number;
    hasMore: boolean;
  };
  let failNextTimelinePage: boolean;

  beforeEach(() => {
    journalReads = 0;
    latestJournalRead = null;
    serverDraft = null;
    timelineFirstPage = { items: [], nextCursor: null, visibleMaxCursor: 0, hasMore: false };
    failNextTimelinePage = false;
    http.get.mockReset();
    http.post.mockReset();
    http.put.mockReset();
    http.get.mockImplementation(async (path: string) => {
      if (path === "/astro-diary/journals") {
        return { journals: [activeSummary], total: 1 };
      }
      if (path === `/astro-diary/journals/${journalId}`) {
        journalReads += 1;
        return journalReads === 1 || !latestJournalRead ? activeSummary : latestJournalRead.promise;
      }
      if (path.startsWith(`/astro-diary/journals/${journalId}/timeline?`)) {
        if (path.includes("afterCursor=0")) return timelineFirstPage;
        if (failNextTimelinePage) throw new Error("Next timeline page failed");
        return { items: [], nextCursor: null, visibleMaxCursor: 1, hasMore: false };
      }
      if (path === `/astro-diary/journals/${journalId}/astrologer-reply/draft`) {
        return { draft: serverDraft };
      }
      if (path === "/astrologer-profile/me") {
        return { profile: null, integrityIssues: [] };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
  });

  it("keeps an unsaved reply buffer through a stale latest-version refetch", async () => {
    latestJournalRead = deferred<AstroDiaryJournalSummaryResponse>();
    http.post.mockRejectedValueOnce(new HttpError(409, { code: "stale_version" }));
    renderPage(createQueryClient());

    fireEvent.click(await screen.findByRole("button", { name: "Write reply" }));
    const textbox = screen.getByRole("textbox", { name: "Reply text" });
    fireEvent.change(textbox, { target: { value: "Unsaved text survives refresh" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed in another session");

    fireEvent.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(journalReads).toBe(2));
    latestJournalRead.resolve(activeSummary);

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Reply text" })).toHaveValue(
        "Unsaved text survives refresh"
      )
    );
  });

  it("hydrates the acknowledged server draft after a fresh route mount and updates it", async () => {
    serverDraft = { draftId, version: 3, body: "Saved on the server" };
    http.put.mockImplementation(async (_path: string, body: { body: string }) => {
      serverDraft = { draftId, version: 4, body: body.body };
      return { outcome: "applied", draftId, version: 4 };
    });

    const first = renderPage(createQueryClient());
    expect(await screen.findByRole("textbox", { name: "Reply text" })).toHaveValue(
      "Saved on the server"
    );
    first.unmount();

    renderPage(createQueryClient());
    const rehydrated = await screen.findByRole("textbox", { name: "Reply text" });
    expect(rehydrated).toHaveValue("Saved on the server");
    fireEvent.change(rehydrated, { target: { value: "Updated after navigation" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(http.put).toHaveBeenCalledTimes(1));
    expect(http.post).not.toHaveBeenCalled();
    expect(http.put).toHaveBeenCalledWith(
      `/astro-diary/journals/${journalId}/astrologer-reply/drafts/${draftId}`,
      expect.objectContaining({ expectedDraftVersion: 3, body: "Updated after navigation" }),
      expect.anything()
    );
  });

  it("keeps loaded timeline entries visible when the next page fails", async () => {
    timelineFirstPage = {
      items: [timelineItem],
      nextCursor: 1,
      visibleMaxCursor: 2,
      hasMore: true
    };
    failNextTimelinePage = true;
    renderPage(createQueryClient());

    expect(await screen.findByText("Existing journal entry")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show newer entries" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load more entries");
    expect(screen.getByText("Existing journal entry")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry loading entries" })).toBeVisible();
  });
});

function renderPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider
        dictionaries={astrologerCopyByLocale}
        initialLocale="en"
        storage={null}
        documentElement={null}
      >
        <AstroDiaryPage />
      </I18nProvider>
    </QueryClientProvider>
  );
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}>;

const journalId = "11111111-1111-4111-8111-111111111111";
const draftId = "21111111-1111-4111-8111-111111111111";

const timelineItem = {
  id: "c1111111-1111-4111-8111-111111111111",
  journalId,
  cycleId: "71111111-1111-4111-8111-111111111111",
  authorUserId: "61111111-1111-4111-8111-111111111111",
  revision: 1,
  occurredAt: "2026-08-18T10:00:00.000Z",
  cursor: 1,
  kind: "client_entry",
  authorRole: "client",
  body: "Existing journal entry",
  attachmentIds: [],
  editedAt: null,
  moodId: "calm",
  contextStatus: "pending",
  correctsItemId: null
} as const;

const activeSummary = {
  journal: {
    id: journalId,
    relationshipId: "31111111-1111-4111-8111-111111111111",
    journalEpochId: "41111111-1111-4111-8111-111111111111",
    astrologerUserId: "51111111-1111-4111-8111-111111111111",
    clientUserId: "61111111-1111-4111-8111-111111111111",
    state: "active",
    version: 4,
    createdAt: "2026-08-18T10:00:00.000Z"
  },
  currentCycle: {
    id: "71111111-1111-4111-8111-111111111111",
    journalId,
    openingPeriodId: "81111111-1111-4111-8111-111111111111",
    openingAllowanceReservationId: null,
    awaitingClientPromptItemId: null,
    clientResponseDueAt: null,
    clientResponseWindowCalendarDays: null,
    clientResponseTimezone: null,
    state: "awaiting_astrologer_response",
    version: 2,
    openedAt: "2026-08-18T10:00:00.000Z",
    closedAt: null,
    closeReason: null
  },
  currentObligation: {
    id: "91111111-1111-4111-8111-111111111111",
    journalId,
    cycleId: "71111111-1111-4111-8111-111111111111",
    triggerItemId: "a1111111-1111-4111-8111-111111111111",
    state: "open",
    version: 1,
    openedAt: "2026-08-18T10:00:00.000Z",
    dueAt: "2026-08-20T10:00:00.000Z",
    responseSlaWorkingDays: 2,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "Europe/Moscow",
    resolvedDueLocal: "2026-08-20T13:00:00",
    resolvedDueOffset: "+03:00",
    satisfiedByItemId: null,
    closedAt: null
  },
  access: {
    mode: "active",
    subscriptionId: "b1111111-1111-4111-8111-111111111111",
    subscriptionState: "active",
    currentPeriod: {
      id: "81111111-1111-4111-8111-111111111111",
      sequence: 1,
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z"
    },
    allowance: {
      periodId: "81111111-1111-4111-8111-111111111111",
      total: 2,
      available: 1,
      reserved: 0,
      consumed: 1,
      released: 0
    }
  },
  unreadCount: 1,
  visibleMaxCursor: 1
} satisfies AstroDiaryJournalSummaryResponse;
