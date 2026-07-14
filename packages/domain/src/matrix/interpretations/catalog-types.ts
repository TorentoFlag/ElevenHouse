export const MATRIX_INTERPRETATION_CATALOG_REVISION = 1 as const;
export const MATRIX_INTERPRETATION_LOCALES = ["ru", "en"] as const;
export const MATRIX_INTERPRETATION_CONTEXTS = [
  "portrait",
  "talent",
  "karmic",
  "relationship",
  "money",
  "lineage",
  "purpose",
  "energy",
  "compatibility",
  "forecast"
] as const;

export type MatrixInterpretationLocale = (typeof MATRIX_INTERPRETATION_LOCALES)[number];
export type MatrixInterpretationContext = (typeof MATRIX_INTERPRETATION_CONTEXTS)[number];
export type MatrixInterpretationEntry = {
  readonly catalogRevision: typeof MATRIX_INTERPRETATION_CATALOG_REVISION;
  readonly locale: MatrixInterpretationLocale;
  readonly arcana: number;
  readonly context: MatrixInterpretationContext;
  readonly title: string;
  readonly constructive: string;
  readonly shadow: string;
  readonly reflectionQuestions: readonly string[];
  readonly practicalRecommendations: readonly string[];
  readonly reportSummary: string;
};

export type MatrixArcanaContent = {
  readonly title: string;
  readonly constructive: string;
  readonly shadow: string;
  readonly summary: string;
};

export type MatrixContextContent = {
  readonly title: string;
  readonly constructive: string;
  readonly shadow: string;
  readonly question: string;
  readonly recommendation: string;
  readonly summary: string;
};
