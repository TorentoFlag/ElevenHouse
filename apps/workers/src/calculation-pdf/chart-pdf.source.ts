import { storedChartCalculationPayloadSchema } from "@elevenhouse/contracts";
import type { CalculationPdfJob, CalculationStore, DictionaryStore } from "@elevenhouse/domain";
import type { ChartPdfDocument } from "./calculation-pdf.documents";
import {
  buildChartPdfInterpretationCodes,
  buildChartPdfInterpretations
} from "./chart-pdf.interpretations";
import { CalculationPdfPermanentError } from "./calculation-pdf.registry";

export type ChartPdfSource = {
  readonly load: (job: CalculationPdfJob) => Promise<ChartPdfDocument>;
};

export function createChartPdfSource(
  calculationStore: CalculationStore,
  dictionaryStore: DictionaryStore
): ChartPdfSource {
  return {
    load: async (job) => {
      if (
        job.module !== "chart" ||
        job.methodCode !== "natal" ||
        job.sourceLocator.kind !== "calculation_result"
      ) {
        throw staleSource();
      }
      const calculation = await calculationStore.findByOwnerAndId({
        ownerUserId: job.ownerUserId,
        calculationId: job.calculationId
      });
      if (
        !calculation ||
        calculation.status === "archived" ||
        calculation.module !== job.module ||
        calculation.methodCode !== job.methodCode ||
        calculation.resultChecksum !== job.resultChecksum
      ) {
        throw staleSource();
      }
      const result = storedChartCalculationPayloadSchema.safeParse(calculation.resultData);
      if (!result.success || result.data.method !== "natal") {
        throw new CalculationPdfPermanentError("invalid_source", "Chart PDF source result is invalid");
      }
      const codes = buildChartPdfInterpretationCodes(result.data);
      const dictionaryEntries =
        codes.length === 0
          ? []
          : (
              await dictionaryStore.listEntriesByCodes({
                ownerUserId: job.ownerUserId,
                locale: job.locale,
                codes
              })
            ).entries;

      return {
        kind: "chart",
        locale: job.locale,
        createdAt: job.createdAt,
        calculationTitle: calculation.title,
        result: result.data,
        interpretations: buildChartPdfInterpretations({
          result: result.data,
          entries: dictionaryEntries
        })
      };
    }
  };
}

function staleSource(): CalculationPdfPermanentError {
  return new CalculationPdfPermanentError("stale_source", "Chart PDF source is stale");
}
