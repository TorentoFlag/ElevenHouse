import { MATRIX_ARCANA_CONTENT, MATRIX_CONTEXT_CONTENT } from "./catalog-content";
import {
  MATRIX_INTERPRETATION_CATALOG_REVISION,
  MATRIX_INTERPRETATION_CONTEXTS,
  MATRIX_INTERPRETATION_LOCALES,
  type MatrixInterpretationContext,
  type MatrixInterpretationEntry,
  type MatrixInterpretationLocale
} from "./catalog-types";

export {
  MATRIX_INTERPRETATION_CATALOG_REVISION,
  MATRIX_INTERPRETATION_CONTEXTS,
  MATRIX_INTERPRETATION_LOCALES
} from "./catalog-types";
export type {
  MatrixInterpretationContext,
  MatrixInterpretationEntry,
  MatrixInterpretationLocale
} from "./catalog-types";

export function resolveMatrixInterpretation(input: {
  readonly locale: string;
  readonly arcana: number;
  readonly context: string;
}): MatrixInterpretationEntry {
  if (!isLocale(input.locale) || !isContext(input.context) || !isArcana(input.arcana)) {
    throw new Error("Unsupported Matrix interpretation coordinates");
  }
  const base = MATRIX_ARCANA_CONTENT[input.locale][input.arcana];
  const context = MATRIX_CONTEXT_CONTENT[input.locale][input.context];
  if (!base || !context) throw new Error("Unsupported Matrix interpretation coordinates");
  return {
    catalogRevision: MATRIX_INTERPRETATION_CATALOG_REVISION,
    locale: input.locale,
    arcana: input.arcana,
    context: input.context,
    title: `${base.title} — ${context.title}`,
    constructive: `${base.constructive} ${context.constructive}`,
    shadow: `${base.shadow} ${context.shadow}`,
    reflectionQuestions: [context.question],
    practicalRecommendations: [context.recommendation],
    reportSummary: `${base.summary} ${context.summary}`
  };
}

function isLocale(value: string): value is MatrixInterpretationLocale {
  return (MATRIX_INTERPRETATION_LOCALES as readonly string[]).includes(value);
}

function isContext(value: string): value is MatrixInterpretationContext {
  return (MATRIX_INTERPRETATION_CONTEXTS as readonly string[]).includes(value);
}

function isArcana(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 22;
}
