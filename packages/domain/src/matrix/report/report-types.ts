export type MatrixReportLocale = "ru" | "en";
export type MatrixReportStatus = "draft" | "ready";
export type MatrixReportSource = "manual" | "ai";

export type MatrixReportContent = {
  readonly overview: string;
  readonly corePortrait: string;
  readonly strengthsAndTalents: string;
  readonly growthAreas: string;
  readonly moneyAndRealization: string;
  readonly relationships: string;
  readonly lineageThemes: string;
  readonly purposes: string;
  readonly yearProjection: string | null;
  readonly reflectionQuestions: readonly string[];
  readonly practicalSteps: readonly string[];
  readonly disclaimer: string;
};

export type MatrixReportDraft = {
  readonly id: string;
  readonly calculationId: string;
  readonly ownerUserId: string;
  readonly source: MatrixReportSource;
  readonly status: MatrixReportStatus;
  readonly locale: MatrixReportLocale;
  readonly content: MatrixReportContent;
  readonly plainText: string;
  readonly resultChecksum: string;
  readonly revision: number;
  readonly modelId: string | null;
  readonly promptVersion: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};
