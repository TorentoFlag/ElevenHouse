import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAstroDiaryTimeline, listAstroDiaryJournals } from "./astroDiaryApi";

const get = vi.hoisted(() => vi.fn());

vi.mock("../../../Application", () => ({
  application: {
    http: { get }
  }
}));

describe("astroDiaryApi", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("loads the authenticated astrologer's journal summaries", async () => {
    get.mockResolvedValueOnce({ journals: [], total: 0 });

    await expect(listAstroDiaryJournals()).resolves.toEqual({ journals: [], total: 0 });
    expect(get).toHaveBeenCalledWith("/astro-diary/journals");
  });

  it("loads a bounded timeline page for a journal", async () => {
    get.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      visibleMaxCursor: 0,
      hasMore: false
    });

    await expect(
      getAstroDiaryTimeline({
        journalId: "22222222-2222-4222-8222-222222222222",
        afterCursor: 3,
        limit: 25
      })
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
      visibleMaxCursor: 0,
      hasMore: false
    });
    expect(get).toHaveBeenCalledWith(
      "/astro-diary/journals/22222222-2222-4222-8222-222222222222/timeline?afterCursor=3&limit=25"
    );
  });
});
