// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstroDiaryPage } from "./AstroDiaryPage";

const mocks = vi.hoisted(() => ({
  locale: "ru" as "ru" | "en",
  useDocumentTitle: vi.fn(),
  useAstroDiaryJournalListQuery: vi.fn(),
  useAstroDiaryTimelineQuery: vi.fn()
}));

vi.mock("@elevenhouse/i18n", () => ({
  useI18n: () => ({
    locale: mocks.locale,
    dictionary: astrologerCopyByLocale[mocks.locale]
  })
}));

vi.mock("../../common/hooks/useDocumentTitle", () => ({
  useDocumentTitle: mocks.useDocumentTitle
}));

vi.mock("../../features/astro-diary/model/useAstroDiaryJournalListQuery", () => ({
  useAstroDiaryJournalListQuery: mocks.useAstroDiaryJournalListQuery
}));

vi.mock("../../features/astro-diary/model/useAstroDiaryTimelineQuery", () => ({
  useAstroDiaryTimelineQuery: mocks.useAstroDiaryTimelineQuery
}));

afterEach(() => {
  cleanup();
  mocks.useAstroDiaryJournalListQuery.mockReset();
  mocks.useAstroDiaryTimelineQuery.mockReset();
});

describe("AstroDiaryPage", () => {
  it("renders an honest production connection state without fake journal data", () => {
    mocks.locale = "ru";
    mocks.useAstroDiaryJournalListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false
    });
    mocks.useAstroDiaryTimelineQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false
    });

    render(<AstroDiaryPage />);

    expect(mocks.useDocumentTitle).toHaveBeenCalledWith("Астродневник");
    expect(screen.getByRole("heading", { name: "Астродневник" })).toBeTruthy();
    expect(screen.getByText("Журналы клиентов")).toBeTruthy();
    expect(screen.getByText(/Раздел читает реальные журналы из API/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /создать/i })).toBeNull();
  });

  it("renders the server-backed journal count when the read endpoint responds", () => {
    mocks.locale = "ru";
    mocks.useAstroDiaryJournalListQuery.mockReturnValue({
      data: { journals: [journalSummary()], total: 1 },
      isLoading: false,
      isError: false
    });
    mocks.useAstroDiaryTimelineQuery.mockReturnValue({
      data: { items: [], nextCursor: null, visibleMaxCursor: 0, hasMore: false },
      isLoading: false,
      isError: false
    });

    render(<AstroDiaryPage />);

    expect(screen.getByText("1 журнал доступен")).toBeTruthy();
    expect(screen.getByText("Маркер доступа: read_only")).toBeTruthy();
  });

  it("renders read-only journal cards from server summaries", () => {
    mocks.locale = "ru";
    mocks.useAstroDiaryJournalListQuery.mockReturnValue({
      data: { journals: [journalSummary({ unreadCount: 2, visibleMaxCursor: 7 })], total: 1 },
      isLoading: false,
      isError: false
    });
    mocks.useAstroDiaryTimelineQuery.mockReturnValue({
      data: { items: [], nextCursor: null, visibleMaxCursor: 0, hasMore: false },
      isLoading: false,
      isError: false
    });

    render(<AstroDiaryPage />);

    expect(screen.getByText("Клиент 55555555")).toBeTruthy();
    expect(screen.getByText("Непрочитано: 2")).toBeTruthy();
    expect(screen.getByText("Курсор: 7")).toBeTruthy();
    expect(screen.getByText("Доступ: read_only")).toBeTruthy();
  });

  it("renders the first journal timeline from the read endpoint", () => {
    mocks.locale = "ru";
    mocks.useAstroDiaryJournalListQuery.mockReturnValue({
      data: { journals: [journalSummary()], total: 1 },
      isLoading: false,
      isError: false
    });
    mocks.useAstroDiaryTimelineQuery.mockReturnValue({
      data: {
        items: [timelineItem()],
        nextCursor: 1,
        visibleMaxCursor: 1,
        hasMore: false
      },
      isLoading: false,
      isError: false
    });

    render(<AstroDiaryPage />);

    expect(mocks.useAstroDiaryTimelineQuery).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222"
    );
    expect(screen.getByText("Первая запись клиента")).toBeTruthy();
    expect(screen.getByText("client_entry · #1")).toBeTruthy();
  });
});

function journalSummary(
  overrides: Partial<{ readonly unreadCount: number; readonly visibleMaxCursor: number }> = {}
) {
  return {
    journal: {
      id: "22222222-2222-4222-8222-222222222222",
      relationshipId: "33333333-3333-4333-8333-333333333333",
      journalEpochId: "44444444-4444-4444-8444-444444444444",
      astrologerUserId: "11111111-1111-4111-8111-111111111111",
      clientUserId: "55555555-5555-4555-8555-555555555555",
      state: "active",
      version: 1,
      createdAt: "2026-08-12T09:00:00Z"
    },
    currentCycle: null,
    currentObligation: null,
    access: {
      mode: "read_only",
      subscriptionId: "66666666-6666-4666-8666-666666666666",
      subscriptionState: "ended",
      currentPeriod: null,
      allowance: null
    },
    unreadCount: overrides.unreadCount ?? 0,
    visibleMaxCursor: overrides.visibleMaxCursor ?? 0
  };
}

function timelineItem() {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    journalId: "22222222-2222-4222-8222-222222222222",
    cycleId: "88888888-8888-4888-8888-888888888888",
    authorUserId: "55555555-5555-4555-8555-555555555555",
    revision: 1,
    occurredAt: "2026-08-12T10:00:00Z",
    cursor: 1,
    kind: "client_entry",
    authorRole: "client",
    body: "Первая запись клиента",
    attachmentIds: [],
    editedAt: null,
    moodId: null,
    contextStatus: "pending",
    correctsItemId: null
  };
}
