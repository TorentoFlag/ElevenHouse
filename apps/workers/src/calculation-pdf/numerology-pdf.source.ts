import { numerologyResultSchema } from "@elevenhouse/contracts";
import {
  selectCurrentApprovedCalculationInterpretation,
  type CalculationPdfJob,
  type CalculationStore
} from "@elevenhouse/domain";
import type { NumerologyPdfDocument } from "./calculation-pdf.documents";
import { CalculationPdfPermanentError } from "./calculation-pdf.registry";

export type NumerologyPdfSource = {
  readonly load: (job: CalculationPdfJob) => Promise<NumerologyPdfDocument>;
};

export function createNumerologyPdfSource(calculationStore: CalculationStore): NumerologyPdfSource {
  return {
    load: async (job) => {
      if (
        job.module !== "numerology" ||
        job.methodCode !== "pythagorean" ||
        job.sourceLocator.kind !== "approved_interpretation"
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
      const result = numerologyResultSchema.safeParse(calculation.resultData);
      if (
        !result.success ||
        result.data.methodCode !== calculation.methodCode ||
        result.data.mode !== calculation.mode
      ) {
        throw new CalculationPdfPermanentError(
          "invalid_source",
          "Numerology PDF source result is invalid"
        );
      }
      const currentInterpretation = selectCurrentApprovedCalculationInterpretation(
        calculation.interpretations
      );
      if ((currentInterpretation?.id ?? null) !== job.sourceLocator.interpretationId) {
        throw staleSource();
      }
      return {
        kind: "numerology",
        locale: job.locale,
        createdAt: job.createdAt,
        calculationTitle: calculation.title,
        approvedInterpretation: currentInterpretation?.text ?? null,
        result: result.data
      };
    }
  };
}

function staleSource(): CalculationPdfPermanentError {
  return new CalculationPdfPermanentError("stale_source", "Numerology PDF source is stale");
}
