import type {
  MatrixReportContent,
  MatrixReportDraft,
  MatrixReportLocale,
  MatrixReportSource,
  MatrixReportStatus
} from "./report-types";

export type MatrixReportStore = {
  readonly findByCalculation: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
  }) => Promise<MatrixReportDraft | null>;
  /**
   * Inserts the first report or atomically updates the current row and increments revision.
   * The adapter must preserve the existing id and createdAt when the calculation already has a report.
   */
  readonly upsert: (input: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly source: MatrixReportSource;
    readonly status: MatrixReportStatus;
    readonly locale: MatrixReportLocale;
    readonly content: MatrixReportContent;
    readonly plainText: string;
    readonly expectedResultChecksum: string;
    readonly resultChecksum: string;
    readonly modelId: string | null;
    readonly promptVersion: string | null;
    readonly now: string;
  }) => Promise<MatrixReportDraft | null>;
};
