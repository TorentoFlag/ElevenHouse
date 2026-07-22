import type { CalculationModule } from "../calculation-types";

export const CALCULATION_PDF_REQUESTED_EVENT = "calculation.pdf.requested.v1" as const;
export const CALCULATION_PDF_DELETE_REQUESTED_EVENT =
  "calculation.pdf.delete-requested.v1" as const;

export type CalculationPdfLocale = "ru" | "en";
export type CalculationPdfJobStatus = "queued" | "processing" | "ready" | "failed";

export type MatrixReportPdfSourceLocator = {
  readonly kind: "matrix_report";
  readonly reportId: string;
  readonly reportRevision: number;
  readonly reportResultChecksum: string;
};

export type ApprovedInterpretationPdfSourceLocator = {
  readonly kind: "approved_interpretation";
  readonly interpretationId: string | null;
};

export type CalculationResultPdfSourceLocator = {
  readonly kind: "calculation_result";
};

export type CalculationPdfSourceLocator =
  | MatrixReportPdfSourceLocator
  | ApprovedInterpretationPdfSourceLocator
  | CalculationResultPdfSourceLocator;

export type CalculationPdfJob = {
  readonly id: string;
  readonly calculationId: string;
  readonly ownerUserId: string;
  readonly module: CalculationModule;
  readonly methodCode: string;
  readonly resultChecksum: string;
  readonly locale: CalculationPdfLocale;
  readonly sourceLocator: CalculationPdfSourceLocator;
  readonly documentFingerprint: string;
  readonly status: CalculationPdfJobStatus;
  readonly artifactId: string;
  readonly mediaAssetId: string;
  readonly failureCode: string | null;
  readonly failureReason: string | null;
  readonly pageCount: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CalculationPdfRequestedPayload = {
  readonly jobId: string;
};

export type CalculationPdfDeleteRequestedPayload = {
  readonly mediaAssetId: string;
};
