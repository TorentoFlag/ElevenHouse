import type {
  ChartHoraryQuestionCategory,
  ChartHoraryQuestionSnapshot,
  ChartTransitMoment
} from "@elevenhouse/contracts";

export type ChartTransitMomentInput = ChartTransitMoment;

export type ChartHoraryQuestionInput = Omit<
  ChartHoraryQuestionSnapshot,
  "category" | "latitude" | "longitude"
> & {
  readonly category: ChartHoraryQuestionCategory;
  readonly latitude: string | number;
  readonly longitude: string | number;
};
