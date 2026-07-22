import type { MatrixReportContent } from "@elevenhouse/domain";
import type { NumerologyResult, StoredChartCalculationPayload } from "@elevenhouse/contracts";

export type MatrixPdfDocument = {
  readonly kind: "matrix";
  readonly locale: "ru" | "en";
  readonly createdAt: string;
  readonly content: MatrixReportContent;
};

export type NumerologyPdfDocument = {
  readonly kind: "numerology";
  readonly locale: "ru" | "en";
  readonly createdAt: string;
  readonly calculationTitle: string;
  readonly approvedInterpretation: string | null;
  readonly result: NumerologyResult;
};

export type ChartPdfDocument = {
  readonly kind: "chart";
  readonly locale: "ru" | "en";
  readonly createdAt: string;
  readonly calculationTitle: string;
  readonly result: StoredChartCalculationPayload;
};
