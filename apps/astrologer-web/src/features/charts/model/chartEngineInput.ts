import type {
  ChartHoraryQuestionCategory,
  ChartHoraryQuestionSnapshot
} from "@elevenhouse/contracts";
import type { ChartDstOccurrence } from "./chartCivilTimeOccurrence";

export type ChartTransitMomentInput = {
  readonly date: string;
  readonly time: string;
  readonly dstOccurrence?: ChartDstOccurrence;
};

export type ChartHoraryQuestionInput = Omit<
  ChartHoraryQuestionSnapshot,
  "category" | "latitude" | "longitude"
> & {
  readonly category: ChartHoraryQuestionCategory;
  readonly latitude: string | number;
  readonly longitude: string | number;
};
