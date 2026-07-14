import type { MatrixReportContent, MatrixReportLocale } from "./report-types";

export const MATRIX_PDF_REQUESTED_EVENT = "matrix.pdf.requested.v1" as const;

export type MatrixPdfJobStatus = "queued" | "processing" | "ready" | "failed";

export type MatrixPdfJob = {
  readonly id: string;
  readonly calculationId: string;
  readonly ownerUserId: string;
  readonly reportId: string;
  readonly reportRevision: number;
  readonly resultChecksum: string;
  readonly locale: MatrixReportLocale;
  readonly status: MatrixPdfJobStatus;
  readonly artifactId: string;
  readonly mediaAssetId: string;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MatrixPdfRequestedPayload = {
  readonly jobId: string;
  readonly ownerUserId: string;
  readonly calculationId: string;
};

export type MatrixPdfRenderClaim = {
  readonly job: MatrixPdfJob;
  readonly report: {
    readonly content: MatrixReportContent;
    readonly plainText: string;
  };
  readonly storageBucket: string;
  readonly storageKey: string;
  readonly originalFileName: string;
};
