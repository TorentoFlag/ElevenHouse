import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAstroDiaryJournals } from "./astroDiaryApi";

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
});
