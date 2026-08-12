import type { AstroDiaryMoodId } from "@elevenhouse/contracts";

export const astroDiaryMoodCatalog = Object.freeze({
  inspired: Object.freeze({ emoji: "✨", score: 2 }),
  joy: Object.freeze({ emoji: "😊", score: 2 }),
  calm: Object.freeze({ emoji: "😌", score: 1 }),
  tired: Object.freeze({ emoji: "😮‍💨", score: -1 }),
  anxious: Object.freeze({ emoji: "😟", score: -1 }),
  sad: Object.freeze({ emoji: "😢", score: -2 })
}) satisfies Readonly<Record<AstroDiaryMoodId, Readonly<{ emoji: string; score: number }>>>;

export type AstroDiaryMoodTrend = Readonly<{
  enoughData: boolean;
  sampleSize: number;
  distribution: Readonly<Partial<Record<AstroDiaryMoodId, number>>>;
  scoreChange: number | null;
}>;

export function projectAstroDiaryMoodTrend(
  entries: readonly Readonly<{
    moodId: AstroDiaryMoodId | null;
    occurredAt: string;
    erased: boolean;
  }>[]
): AstroDiaryMoodTrend {
  const samples = entries.filter(
    (
      entry
    ): entry is Readonly<{
      moodId: AstroDiaryMoodId;
      occurredAt: string;
      erased: boolean;
    }> => !entry.erased && entry.moodId !== null
  );
  samples.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const distribution: Partial<Record<AstroDiaryMoodId, number>> = {};
  for (const sample of samples) {
    distribution[sample.moodId] = (distribution[sample.moodId] ?? 0) + 1;
  }
  return Object.freeze({
    enoughData: samples.length >= 3,
    sampleSize: samples.length,
    distribution: Object.freeze(distribution),
    scoreChange:
      samples.length < 2
        ? null
        : astroDiaryMoodCatalog[samples.at(-1)!.moodId].score -
          astroDiaryMoodCatalog[samples[0]!.moodId].score
  });
}
