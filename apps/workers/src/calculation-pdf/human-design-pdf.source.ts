import { humanDesignResultSchema } from "@elevenhouse/contracts";
import {
  selectCurrentApprovedCalculationInterpretation,
  type CalculationPdfJob,
  type CalculationStore
} from "@elevenhouse/domain";
import type { HumanDesignPdfDocument } from "./calculation-pdf.documents";
import { CalculationPdfPermanentError } from "./calculation-pdf.registry";

export type HumanDesignPdfSource = {
  readonly load: (job: CalculationPdfJob) => Promise<HumanDesignPdfDocument>;
};

export function createHumanDesignPdfSource(
  calculationStore: CalculationStore
): HumanDesignPdfSource {
  return {
    load: async (job) => {
      if (
        job.module !== "human_design" ||
        job.methodCode !== "human_design_classic" ||
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
      const result = humanDesignResultSchema.safeParse(calculation.resultData);
      if (
        !result.success ||
        result.data.methodCode !== calculation.methodCode ||
        result.data.mode !== calculation.mode
      ) {
        throw new CalculationPdfPermanentError(
          "invalid_source",
          "Human Design PDF source result is invalid"
        );
      }
      const currentInterpretation = selectCurrentApprovedCalculationInterpretation(
        calculation.interpretations
      );
      if ((currentInterpretation?.id ?? null) !== job.sourceLocator.interpretationId) {
        throw staleSource();
      }
      return {
        kind: "human_design",
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
  return new CalculationPdfPermanentError("stale_source", "Human Design PDF source is stale");
}
