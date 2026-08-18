// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { AstroDiaryTimelineItem } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { astrologerCopyByLocale } from "../../../common/i18n/astrologerCopy";
import { AstroDiaryTimeline } from "./AstroDiaryTimeline";

afterEach(cleanup);

describe("AstroDiaryTimeline", () => {
  it("keeps loaded items and appends a retry row when the next page fails", () => {
    const onLoadMore = vi.fn();
    render(
      <AstroDiaryTimeline
        copy={astrologerCopyByLocale.en.astroDiary}
        locale="en"
        items={[timelineItem]}
        status="ready"
        hasMore={true}
        isLoadingMore={false}
        loadMoreError={true}
        onRetry={vi.fn()}
        onLoadMore={onLoadMore}
      />
    );

    expect(screen.getByText("Existing journal entry")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load more entries");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading entries" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

const timelineItem = {
  id: "11111111-1111-4111-8111-111111111111",
  journalId: "21111111-1111-4111-8111-111111111111",
  cycleId: "31111111-1111-4111-8111-111111111111",
  authorUserId: "41111111-1111-4111-8111-111111111111",
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
} satisfies AstroDiaryTimelineItem;
