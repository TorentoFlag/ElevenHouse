import {
  chartResultSchema,
  isReproducibleChartResult,
  type ChartExecutionProfile
} from "@elevenhouse/contracts";
import {
  assertStoredChartCalculationIntegrity,
  selectCurrentApprovedCalculationInterpretation,
  type CalculationPdfJob,
  type CalculationStore,
  type DictionaryStore
} from "@elevenhouse/domain";
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
  dictionaryStore: DictionaryStore,
  expectedExecutionProfile: ChartExecutionProfile
): ChartPdfSource {
  return {
    load: async (job) => {
      if (job.module !== "chart" || job.sourceLocator.kind !== "approved_interpretation") {
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
      const readable = chartResultSchema.safeParse(calculation.resultData);
      if (readable.success && readable.data.schemaVersion === "chart-result.v1") {
        throw new CalculationPdfPermanentError(
          "invalid_source",
          "Legacy chart PDF source must be recalculated"
        );
      }
      let result;
      try {
        result = assertStoredChartCalculationIntegrity({
          calculation,
          expectedExecutionProfile
        });
      } catch {
        throw new CalculationPdfPermanentError(
          "invalid_source",
          "Chart PDF source result is invalid"
        );
      }
      if (!isReproducibleChartResult(result) || result.method !== job.methodCode) {
        throw new CalculationPdfPermanentError(
          "invalid_source",
          "Chart PDF source result is invalid"
        );
      }
      const approvedInterpretation = selectCurrentApprovedCalculationInterpretation(
        calculation.interpretations
      );
      if ((approvedInterpretation?.id ?? null) !== job.sourceLocator.interpretationId) {
        throw staleSource();
      }
      const codes = buildChartPdfInterpretationCodes(result);
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
        result,
        approvedInterpretation: approvedInterpretation?.text ?? null,
        interpretations: buildChartPdfInterpretations({
          result,
          entries: dictionaryEntries
        })
      };
    }
  };
}

function staleSource(): CalculationPdfPermanentError {
  return new CalculationPdfPermanentError("stale_source", "Chart PDF source is stale");
}
