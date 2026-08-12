import { describe, expect, it } from "vitest";
import { astroDiaryMoodCatalog, projectAstroDiaryMoodTrend } from "./astro-diary-mood";

describe("AstroDiary mood projection", () => {
  it("keeps emoji and internal score stable without a streak", () => {
    expect(astroDiaryMoodCatalog).toEqual({
      inspired: { emoji: "✨", score: 2 },
      joy: { emoji: "😊", score: 2 },
      calm: { emoji: "😌", score: 1 },
      tired: { emoji: "😮‍💨", score: -1 },
      anxious: { emoji: "😟", score: -1 },
      sad: { emoji: "😢", score: -2 }
    });
    expect(astroDiaryMoodCatalog).not.toHaveProperty("streak");
  });

  it("derives distribution and change from ordered non-erased client entries", () => {
    expect(
      projectAstroDiaryMoodTrend([
        { moodId: "sad", occurredAt: "2026-08-01T00:00:00Z", erased: false },
        { moodId: "calm", occurredAt: "2026-08-02T00:00:00Z", erased: false },
        { moodId: "joy", occurredAt: "2026-08-03T00:00:00Z", erased: false },
        { moodId: "anxious", occurredAt: "2026-08-04T00:00:00Z", erased: true },
        { moodId: null, occurredAt: "2026-08-05T00:00:00Z", erased: false }
      ])
    ).toEqual({
      enoughData: true,
      sampleSize: 3,
      distribution: { sad: 1, calm: 1, joy: 1 },
      scoreChange: 4
    });
  });
});
