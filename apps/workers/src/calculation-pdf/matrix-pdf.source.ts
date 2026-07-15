import { matrixReportContentSchema } from "@elevenhouse/contracts";
import type { CalculationPdfJob, CalculationStore, MatrixReportStore } from "@elevenhouse/domain";
import type { MatrixPdfDocument } from "./calculation-pdf.documents";
import { CalculationPdfPermanentError } from "./calculation-pdf.registry";

export type MatrixPdfSource = {
  readonly load: (job: CalculationPdfJob) => Promise<MatrixPdfDocument>;
};

export function createMatrixPdfSource(
  calculationStore: CalculationStore,
  reportStore: MatrixReportStore
): MatrixPdfSource {
  return {
    load: async (job) => {
      if (
        job.module !== "matrix" ||
        job.methodCode !== "ladini_22" ||
        job.sourceLocator.kind !== "matrix_report"
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
      const report = await reportStore.findByCalculation({
        ownerUserId: job.ownerUserId,
        calculationId: job.calculationId
      });
      const locator = job.sourceLocator;
      if (
        !report ||
        report.status !== "ready" ||
        report.id !== locator.reportId ||
        report.revision !== locator.reportRevision ||
        report.resultChecksum !== locator.reportResultChecksum ||
        report.resultChecksum !== job.resultChecksum ||
        report.locale !== job.locale
      ) {
        throw staleSource();
      }
      const parsedContent = matrixReportContentSchema.safeParse(report.content);
      if (!parsedContent.success) {
        throw new CalculationPdfPermanentError(
          "invalid_source",
          "Matrix PDF source content is invalid"
        );
      }
      return {
        kind: "matrix",
        locale: job.locale,
        createdAt: job.createdAt,
        content: parsedContent.data
      };
    }
  };
}

function staleSource(): CalculationPdfPermanentError {
  return new CalculationPdfPermanentError("stale_source", "Matrix PDF source is stale");
}
