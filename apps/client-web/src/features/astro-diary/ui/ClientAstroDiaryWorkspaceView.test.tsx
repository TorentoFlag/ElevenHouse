// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { AstroDiaryJournalSummaryResponse } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientCopyByLocale } from "../../../common/i18n/clientCopy";
import { ClientAstroDiaryWorkspaceView } from "./ClientAstroDiaryWorkspaceView";

afterEach(cleanup);

describe("ClientAstroDiaryWorkspaceView", () => {
  it("renders loading and subscription-neutral no-subscription states", () => {
    const { rerender } = render(
      <MemoryRouter>
        <ClientAstroDiaryWorkspaceView
          copy={clientCopyByLocale.en.astroDiary}
          locale="en"
          state={{ kind: "loading" }}
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("Loading your AstroDiary")).toHaveAttribute("aria-busy", "true");

    rerender(
      <MemoryRouter>
        <ClientAstroDiaryWorkspaceView
          copy={clientCopyByLocale.en.astroDiary}
          locale="en"
          state={{ kind: "no_subscription", astrologerName: "Mira" }}
        />
      </MemoryRouter>
    );
    expect(
      screen.getByText(
        "AstroDiary is not available yet. A one-time purchase with this astrologer unlocks your personal journal for the paid period."
      )
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent("Pro");
  });

  it("keeps archived history readable without mounting a write action", () => {
    render(
      <MemoryRouter>
        <ClientAstroDiaryWorkspaceView
          copy={clientCopyByLocale.en.astroDiary}
          locale="en"
          state={readyState({ selectedJournal: readOnlySummary, journals: [readOnlySummary] })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Paid period ended · history is read-only")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Write an entry" })).not.toBeInTheDocument();
  });

  it("implements mobile list selection and an explicit detail back action", () => {
    const onSelectJournal = vi.fn();
    const onBackToList = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <ClientAstroDiaryWorkspaceView
          copy={clientCopyByLocale.en.astroDiary}
          locale="en"
          state={readyState({ onSelectJournal, onBackToList, mobileDetailOpen: false })}
        />
      </MemoryRouter>
    );
    const workspace = screen.getByTestId("client-astro-diary-workspace");
    expect(workspace).toHaveAttribute("data-mobile-detail", "false");
    fireEvent.click(screen.getByRole("button", { name: /Current journal/ }));
    expect(onSelectJournal).toHaveBeenCalledWith(activeSummary.journal.id);

    rerender(
      <MemoryRouter>
        <ClientAstroDiaryWorkspaceView
          copy={clientCopyByLocale.en.astroDiary}
          locale="en"
          state={readyState({ onSelectJournal, onBackToList, mobileDetailOpen: true })}
        />
      </MemoryRouter>
    );
    expect(workspace).toHaveAttribute("data-mobile-detail", "true");
    fireEvent.click(screen.getByRole("button", { name: "Back to journals" }));
    expect(onBackToList).toHaveBeenCalledTimes(1);
  });

  it("keeps the entry-authority retry action keyboard focusable", () => {
    const onRetryEntryAuthority = vi.fn();
    render(
      <MemoryRouter>
        <ClientAstroDiaryWorkspaceView
          copy={clientCopyByLocale.en.astroDiary}
          locale="en"
          state={readyState({ entryAuthorityStatus: "error", onRetryEntryAuthority })}
        />
      </MemoryRouter>
    );

    const retry = screen.getByRole("button", { name: "Retry" });
    retry.focus();
    expect(retry).toHaveFocus();
    fireEvent.click(retry);
    expect(onRetryEntryAuthority).toHaveBeenCalledTimes(1);
  });
});

function readyState(overrides: Record<string, unknown> = {}) {
  return {
    kind: "ready" as const,
    astrologerName: "Mira",
    journals: [activeSummary],
    selectedJournal: activeSummary,
    timelineItems: [],
    timelineStatus: "empty" as const,
    hasMoreTimeline: false,
    isLoadingMoreTimeline: false,
    loadMoreTimelineError: false,
    entryDraft: null,
    entryBody: "",
    entryMoodId: null,
    entryError: null,
    isSavingEntry: false,
    isPublishingEntry: false,
    mobileDetailOpen: false,
    canWrite: true,
    entryAuthorityStatus: "ready" as const,
    onSelectJournal: vi.fn(),
    onBackToList: vi.fn(),
    onRetryTimeline: vi.fn(),
    onLoadMoreTimeline: vi.fn(),
    onOpenEntry: vi.fn(),
    onRetryEntryAuthority: vi.fn(),
    onEntryBodyChange: vi.fn(),
    onEntryMoodChange: vi.fn(),
    onSaveEntry: vi.fn(),
    onPublishEntry: vi.fn(),
    onReloadLatest: vi.fn(),
    ...overrides
  };
}

const activeSummary = {
  journal: {
    id: "11111111-1111-4111-8111-111111111111",
    relationshipId: "21111111-1111-4111-8111-111111111111",
    journalEpochId: "31111111-1111-4111-8111-111111111111",
    astrologerUserId: "41111111-1111-4111-8111-111111111111",
    clientUserId: "51111111-1111-4111-8111-111111111111",
    state: "active",
    version: 4,
    createdAt: "2026-08-18T10:00:00.000Z"
  },
  currentCycle: null,
  currentObligation: null,
  access: {
    mode: "active",
    subscriptionId: "61111111-1111-4111-8111-111111111111",
    subscriptionState: "active",
    currentPeriod: {
      id: "71111111-1111-4111-8111-111111111111",
      sequence: 1,
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z"
    },
    allowance: {
      periodId: "71111111-1111-4111-8111-111111111111",
      total: 2,
      available: 1,
      reserved: 0,
      consumed: 1,
      released: 0
    }
  },
  unreadCount: 0,
  visibleMaxCursor: 0
} satisfies AstroDiaryJournalSummaryResponse;

const readOnlySummary = {
  ...activeSummary,
  access: {
    mode: "read_only",
    subscriptionId: activeSummary.access.subscriptionId,
    subscriptionState: "ended",
    currentPeriod: null,
    allowance: null
  }
} satisfies AstroDiaryJournalSummaryResponse;
