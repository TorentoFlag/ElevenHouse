import { describe, expect, it, vi } from "vitest";
import {
  astroDiaryQueryKeys,
  getNextAstroDiaryTimelinePageParam,
  invalidateAstroDiaryJournal,
  invalidateAstroDiaryReplyDraftSave
} from "./astroDiaryQueries";

describe("astroDiaryQueries", () => {
  it("takes the next page cursor only from validated server metadata", () => {
    expect(
      getNextAstroDiaryTimelinePageParam({
        items: [],
        nextCursor: null,
        visibleMaxCursor: 0,
        hasMore: false
      })
    ).toBeUndefined();
    expect(
      getNextAstroDiaryTimelinePageParam({
        items: [],
        nextCursor: 7,
        visibleMaxCursor: 12,
        hasMore: true
      })
    ).toBe(7);
  });

  it("invalidates only the list, selected summary, and selected timeline after a mutation", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const journalId = "11111111-1111-4111-8111-111111111111";

    await invalidateAstroDiaryJournal({ invalidateQueries }, journalId);

    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: astroDiaryQueryKeys.journals(), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.journal(journalId), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.timeline(journalId), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.replyDraft(journalId), exact: true }]
    ]);
  });

  it("does not refetch an unchanged timeline after a private draft save", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const journalId = "11111111-1111-4111-8111-111111111111";

    await invalidateAstroDiaryReplyDraftSave({ invalidateQueries }, journalId);

    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: astroDiaryQueryKeys.journals(), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.journal(journalId), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.replyDraft(journalId), exact: true }]
    ]);
  });
});
