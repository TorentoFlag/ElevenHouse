// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";
import { AstroDiaryPage } from "./AstroDiaryPage";

const mocks = vi.hoisted(() => ({
  locale: "ru" as "ru" | "en",
  useDocumentTitle: vi.fn(),
  useAstroDiaryJournalListQuery: vi.fn()
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

describe("AstroDiaryPage", () => {
  it("renders an honest production connection state without fake journal data", () => {
    mocks.locale = "ru";
    mocks.useAstroDiaryJournalListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
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

    render(<AstroDiaryPage />);

    expect(screen.getByText("1 журнал доступен")).toBeTruthy();
    expect(screen.getByText("Маркер доступа: read_only")).toBeTruthy();
  });
});

function journalSummary() {
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
    unreadCount: 0,
    visibleMaxCursor: 0
  };
}
