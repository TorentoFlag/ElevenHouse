// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { AstroDiaryJournalSummaryResponse } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { AstroDiaryWorkspaceView } from "./AstroDiaryWorkspaceView";

afterEach(cleanup);

describe("AstroDiaryWorkspaceView", () => {
  it("renders stable loading and subscription-neutral empty states", () => {
    const { rerender } = render(
      <AstroDiaryWorkspaceView
        copy={astrologerCopyByLocale.en.astroDiary}
        locale="en"
        state={{ kind: "loading" }}
      />
    );

    expect(screen.getByLabelText("Loading AstroDiary journals")).toHaveAttribute(
      "aria-busy",
      "true"
    );

    rerender(
      <AstroDiaryWorkspaceView
        copy={astrologerCopyByLocale.en.astroDiary}
        locale="en"
        state={{ kind: "empty" }}
      />
    );
    expect(screen.getByText("There are no active AstroDiary subscriptions yet.")).toBeVisible();
    expect(document.body).not.toHaveTextContent("Pro");
  });

  it("selects a journal and keeps archived history read-only", () => {
    const onSelectJournal = vi.fn();
    render(
      <AstroDiaryWorkspaceView
        copy={astrologerCopyByLocale.en.astroDiary}
        locale="en"
        state={{
          kind: "ready",
          journals: [readOnlySummary],
          selectedJournal: readOnlySummary,
          timelineItems: [],
          timelineStatus: "empty",
          hasMoreTimeline: false,
          isLoadingMoreTimeline: false,
          loadMoreTimelineError: false,
          replyDraft: null,
          replyBody: "",
          replyDraftStatus: "ready",
          replyError: null,
          isSavingReply: false,
          isPublishingReply: false,
          mobileDetailOpen: false,
          onSelectJournal,
          onBackToList: vi.fn(),
          onRetryTimeline: vi.fn(),
          onLoadMoreTimeline: vi.fn(),
          onOpenReply: vi.fn(),
          onReplyBodyChange: vi.fn(),
          onRetryReplyDraft: vi.fn(),
          onSaveReply: vi.fn(),
          onPublishReply: vi.fn(),
          onReloadLatest: vi.fn()
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Client 61111111/ }));
    expect(onSelectJournal).toHaveBeenCalledWith(readOnlySummary.journal.id);
    expect(screen.getByText("Subscription ended · history is read-only")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Write reply" })).not.toBeInTheDocument();
  });
});

const readOnlySummary = {
  journal: {
    id: "11111111-1111-4111-8111-111111111111",
    relationshipId: "21111111-1111-4111-8111-111111111111",
    journalEpochId: "31111111-1111-4111-8111-111111111111",
    astrologerUserId: "51111111-1111-4111-8111-111111111111",
    clientUserId: "61111111-1111-4111-8111-111111111111",
    state: "active",
    version: 4,
    createdAt: "2026-08-18T10:00:00.000Z"
  },
  currentCycle: null,
  currentObligation: null,
  access: {
    mode: "read_only",
    subscriptionId: "71111111-1111-4111-8111-111111111111",
    subscriptionState: "ended",
    currentPeriod: null,
    allowance: null
  },
  unreadCount: 0,
  visibleMaxCursor: 0
} satisfies AstroDiaryJournalSummaryResponse;
