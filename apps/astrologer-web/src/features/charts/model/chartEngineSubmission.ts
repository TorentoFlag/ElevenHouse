import type {
  ChartCalculationMethod,
  ChartHoraryQuestionSnapshot,
  ChartSettings,
  ChartTransitMoment
} from "@elevenhouse/contracts";
import {
  createAstrocartographyChartJob,
  createCompositeChartJob,
  createHoraryChartJob,
  createNatalChartJob,
  createProgressionChartJob,
  createSolarReturnChartJob,
  createSynastryChartJob,
  createTransitChartJob,
  recalculateChart,
  type ChartJobSubmissionResponse
} from "../api/chartsApi";
import { getChartResultMethodForMode } from "./chartEngineMode";

export type ChartEngineSubmission = {
  readonly calculationId: string | null;
  readonly expectedResultChecksum: string | null;
} & (
  | {
      readonly mode: "natal" | "child_chart";
      readonly clientId: string;
      readonly settings: ChartSettings;
    }
  | {
      readonly mode: "transit";
      readonly clientId: string;
      readonly settings: ChartSettings;
      readonly transit: ChartTransitMoment;
    }
  | {
      readonly mode: "synastry" | "composite";
      readonly clientId: string;
      readonly partnerClientId: string;
      readonly settings: ChartSettings;
    }
  | {
      readonly mode: "solar_return";
      readonly clientId: string;
      readonly settings: ChartSettings;
      readonly year: number;
    }
  | {
      readonly mode: "progression";
      readonly clientId: string;
      readonly settings: ChartSettings;
      readonly targetDate: string;
    }
  | {
      readonly mode: "horary";
      readonly clientId: string;
      readonly settings: ChartSettings;
      readonly question: ChartHoraryQuestionSnapshot;
    }
  | {
      readonly mode: "astrocartography";
      readonly clientId: string;
      readonly settings: ChartSettings;
    }
);

export async function submitChartEngineMode(
  input: ChartEngineSubmission
): Promise<ChartJobSubmissionResponse> {
  return submitTargetedOrNewChart({
    calculationId: input.calculationId,
    expectedResultChecksum: input.expectedResultChecksum,
    expectedMethod: getChartResultMethodForMode(input.mode),
    settings: input.settings,
    recalculate: recalculateChart,
    create: () => {
      switch (input.mode) {
        case "natal":
        case "child_chart":
          return createNatalChartJob({
            clientId: input.clientId,
            interpretationMode: input.mode === "child_chart" ? "child" : "adult_natal",
            settings: input.settings
          });
        case "transit":
          return submitTransitCalculation({ ...input, create: createTransitChartJob });
        case "synastry":
          return submitSynastryCalculation({ ...input, create: createSynastryChartJob });
        case "composite":
          return submitCompositeCalculation({ ...input, create: createCompositeChartJob });
        case "solar_return":
          return submitSolarReturnCalculation({ ...input, create: createSolarReturnChartJob });
        case "progression":
          return submitProgressionCalculation({ ...input, create: createProgressionChartJob });
        case "horary":
          return submitHoraryCalculation({ ...input, create: createHoraryChartJob });
        case "astrocartography":
          return submitAstrocartographyCalculation({
            ...input,
            create: createAstrocartographyChartJob
          });
      }
    }
  });
}

export async function submitChartCalculation(input: {
  readonly clientId: string;
  readonly interpretationMode: "adult_natal" | "child";
  readonly calculationId: string | null;
  readonly expectedResultChecksum: string | null;
  readonly isResultStale: boolean;
  readonly settings: ChartSettings;
  readonly create: typeof createNatalChartJob;
  readonly recalculate: typeof recalculateChart;
}) {
  return submitTargetedOrNewChart({
    calculationId: input.calculationId,
    expectedResultChecksum: input.expectedResultChecksum,
    expectedMethod: "natal",
    settings: input.settings,
    create: () =>
      input.create({
        clientId: input.clientId,
        interpretationMode: input.interpretationMode,
        settings: input.settings
      }),
    recalculate: input.recalculate
  });
}

export async function submitTargetedOrNewChart<T>(input: {
  readonly calculationId: string | null;
  readonly expectedResultChecksum: string | null;
  readonly expectedMethod: ChartCalculationMethod;
  readonly settings: ChartSettings;
  readonly create: () => Promise<T>;
  readonly recalculate: (input: {
    readonly calculationId: string;
    readonly expectedResultChecksum: string;
    readonly expectedMethod: ChartCalculationMethod;
    readonly settings: ChartSettings;
  }) => Promise<T>;
}): Promise<T> {
  if (input.calculationId) {
    if (!input.expectedResultChecksum) {
      throw new Error("CHART_RECALCULATION_CHECKSUM_REQUIRED");
    }
    return input.recalculate({
      calculationId: input.calculationId,
      expectedResultChecksum: input.expectedResultChecksum,
      expectedMethod: input.expectedMethod,
      settings: input.settings
    });
  }
  return input.create();
}

export async function submitTransitCalculation({
  clientId,
  create,
  settings,
  transit
}: {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly transit: ChartTransitMoment;
  readonly create: typeof createTransitChartJob;
}) {
  return create({ clientId, settings, transit });
}

export async function submitSynastryCalculation({
  clientId,
  create,
  partnerClientId,
  settings
}: {
  readonly clientId: string;
  readonly partnerClientId: string;
  readonly settings: ChartSettings;
  readonly create: typeof createSynastryChartJob;
}) {
  return create({ clientId, partnerClientId, settings });
}

export async function submitCompositeCalculation({
  clientId,
  create,
  partnerClientId,
  settings
}: {
  readonly clientId: string;
  readonly partnerClientId: string;
  readonly settings: ChartSettings;
  readonly create: typeof createCompositeChartJob;
}) {
  return create({ clientId, partnerClientId, settings });
}

export async function submitSolarReturnCalculation({
  clientId,
  create,
  settings,
  year
}: {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly year: number;
  readonly create: typeof createSolarReturnChartJob;
}) {
  return create({ clientId, settings, year });
}

export async function submitProgressionCalculation({
  clientId,
  create,
  settings,
  targetDate
}: {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly targetDate: string;
  readonly create: typeof createProgressionChartJob;
}) {
  return create({ clientId, settings, targetDate });
}

export async function submitHoraryCalculation({
  clientId,
  create,
  question,
  settings
}: {
  readonly clientId: string;
  readonly question: ChartHoraryQuestionSnapshot;
  readonly settings: ChartSettings;
  readonly create: typeof createHoraryChartJob;
}) {
  return create({ clientId, settings, question });
}

export async function submitAstrocartographyCalculation({
  clientId,
  create,
  settings
}: {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly create: typeof createAstrocartographyChartJob;
}) {
  return create({ clientId, settings });
}
