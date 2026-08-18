import { describe, expect, it, vi } from "vitest";
import {
  astroDiaryQueryKeys,
  getNextAstroDiaryTimelinePageParam,
  invalidateClientAstroDiaryDraftSave,
  invalidateClientAstroDiaryPublish
} from "./astroDiaryQueries";

describe("client AstroDiary queries", () => {
  it("uses only the validated server next cursor", () => {
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

  it("invalidates list, selected summary, and the selected saved draft after private save", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateClientAstroDiaryDraftSave({ invalidateQueries }, journalId);
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: astroDiaryQueryKeys.journals(), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.journal(journalId), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.entryDraft(journalId), exact: true }]
    ]);
  });

  it("also invalidates only the selected timeline after publish", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateClientAstroDiaryPublish({ invalidateQueries }, journalId);
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: astroDiaryQueryKeys.journals(), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.journal(journalId), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.entryDraft(journalId), exact: true }],
      [{ queryKey: astroDiaryQueryKeys.timeline(journalId), exact: true }]
    ]);
  });
});

const journalId = "11111111-1111-4111-8111-111111111111";
