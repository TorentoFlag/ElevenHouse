import type { MatrixReportContent } from "@elevenhouse/domain";
import type {
  DictionaryEntrySource,
  HumanDesignResult,
  NumerologyResult,
  ReproducibleChartResult
} from "@elevenhouse/contracts";

export type ChartNatalPdfResult = Extract<ReproducibleChartResult, { readonly method: "natal" }>;

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
  readonly result: ReproducibleChartResult;
  readonly approvedInterpretation: string | null;
  readonly interpretations: readonly ChartPdfInterpretation[];
};

export type HumanDesignPdfDocument = {
  readonly kind: "human_design";
  readonly locale: "ru" | "en";
  readonly createdAt: string;
  readonly calculationTitle: string;
  readonly approvedInterpretation: string | null;
  readonly result: HumanDesignResult;
};

export type ChartPdfInterpretation = {
  readonly code: string;
  readonly group: "points" | "houses" | "aspects";
  readonly label: string;
  readonly meta: string;
  readonly position: string;
  readonly entry: ChartPdfInterpretationEntry | null;
};

export type ChartPdfInterpretationEntry = {
  readonly title: string;
  readonly content: string;
  readonly source: DictionaryEntrySource;
};
