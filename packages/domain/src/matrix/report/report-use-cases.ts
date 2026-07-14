import {
  MatrixReportNotFoundError,
  MatrixReportNotReadyError,
  MatrixReportStaleError,
  MatrixResultChangedError,
  MatrixValidationError
} from "../matrix-errors";
import type { MatrixReportStore } from "./report-store";
import type {
  MatrixReportContent,
  MatrixReportDraft,
  MatrixReportLocale,
  MatrixReportSource,
  MatrixReportStatus
} from "./report-types";

const HEADINGS = {
  ru: {
    overview: "ОБЩАЯ КАРТИНА",
    corePortrait: "ЯДРО ЛИЧНОСТИ",
    strengthsAndTalents: "СИЛЬНЫЕ СТОРОНЫ И ТАЛАНТЫ",
    growthAreas: "ЗОНЫ РОСТА",
    moneyAndRealization: "ДЕНЬГИ И РЕАЛИЗАЦИЯ",
    relationships: "ОТНОШЕНИЯ",
    lineageThemes: "РОДОВЫЕ ТЕМЫ",
    purposes: "ПРЕДНАЗНАЧЕНИЯ",
    yearProjection: "ПРОГНОЗ НА ГОД",
    reflectionQuestions: "ВОПРОСЫ ДЛЯ РЕФЛЕКСИИ",
    practicalSteps: "ПРАКТИЧЕСКИЕ ШАГИ",
    disclaimer: "ВАЖНО"
  },
  en: {
    overview: "OVERVIEW",
    corePortrait: "CORE PORTRAIT",
    strengthsAndTalents: "STRENGTHS AND TALENTS",
    growthAreas: "GROWTH AREAS",
    moneyAndRealization: "MONEY AND REALIZATION",
    relationships: "RELATIONSHIPS",
    lineageThemes: "LINEAGE THEMES",
    purposes: "PURPOSES",
    yearProjection: "YEAR PROJECTION",
    reflectionQuestions: "REFLECTION QUESTIONS",
    practicalSteps: "PRACTICAL STEPS",
    disclaimer: "IMPORTANT"
  }
} as const;

export function getMatrixReport(input: {
  readonly store: MatrixReportStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
}): Promise<MatrixReportDraft | null> {
  return input.store.findByCalculation({
    ownerUserId: required(input.ownerUserId, "Matrix report owner is required"),
    calculationId: required(input.calculationId, "Matrix calculation id is required")
  });
}

export async function saveMatrixReport(input: {
  readonly store: MatrixReportStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly source: MatrixReportSource;
  readonly status: MatrixReportStatus;
  readonly locale: MatrixReportLocale;
  readonly content: MatrixReportContent;
  readonly expectedResultChecksum: string;
  readonly currentResultChecksum: string;
  readonly modelId?: string | null;
  readonly promptVersion?: string | null;
  readonly idGenerator: () => string;
  readonly now: Date;
}): Promise<MatrixReportDraft> {
  const expected = checksum(input.expectedResultChecksum);
  const current = checksum(input.currentResultChecksum);
  if (expected !== current) throw new MatrixResultChangedError();
  if (input.source === "ai" && input.status !== "draft") {
    throw new MatrixValidationError("An AI Matrix report must be saved as a draft");
  }
  const content = normalizeMatrixReportContent(input.content);
  const plainText = toMatrixReportPlainText({ locale: input.locale, content });
  if (plainText.length > 50_000) {
    throw new MatrixValidationError("Matrix report plain text exceeds 50000 characters");
  }
  const report = await input.store.upsert({
    id: required(input.idGenerator(), "Matrix report id is required"),
    ownerUserId: required(input.ownerUserId, "Matrix report owner is required"),
    calculationId: required(input.calculationId, "Matrix calculation id is required"),
    source: input.source,
    status: input.status,
    locale: input.locale,
    content,
    plainText,
    expectedResultChecksum: expected,
    resultChecksum: current,
    modelId: optional(input.modelId),
    promptVersion: optional(input.promptVersion),
    now: input.now.toISOString()
  });
  if (!report) throw new MatrixResultChangedError();
  return report;
}

export function isMatrixReportStale(input: {
  readonly report: MatrixReportDraft;
  readonly currentResultChecksum: string;
}): boolean {
  return input.report.resultChecksum !== checksum(input.currentResultChecksum);
}

export function assertMatrixReportPdfEligible(input: {
  readonly report: MatrixReportDraft | null;
  readonly currentResultChecksum: string;
}): MatrixReportDraft {
  if (!input.report) throw new MatrixReportNotFoundError();
  if (input.report.status !== "ready") throw new MatrixReportNotReadyError();
  if (isMatrixReportStale({ report: input.report, currentResultChecksum: input.currentResultChecksum })) {
    throw new MatrixReportStaleError();
  }
  return input.report;
}

export function normalizeMatrixReportContent(content: MatrixReportContent): MatrixReportContent {
  return {
    overview: section(content.overview, "overview"),
    corePortrait: section(content.corePortrait, "core portrait"),
    strengthsAndTalents: section(content.strengthsAndTalents, "strengths and talents"),
    growthAreas: section(content.growthAreas, "growth areas"),
    moneyAndRealization: section(content.moneyAndRealization, "money and realization"),
    relationships: section(content.relationships, "relationships"),
    lineageThemes: section(content.lineageThemes, "lineage themes"),
    purposes: section(content.purposes, "purposes"),
    yearProjection:
      content.yearProjection === null ? null : section(content.yearProjection, "year projection"),
    reflectionQuestions: list(content.reflectionQuestions, "reflection questions"),
    practicalSteps: list(content.practicalSteps, "practical steps"),
    disclaimer: section(content.disclaimer, "disclaimer", 1_000)
  };
}

export function toMatrixReportPlainText(input: {
  readonly locale: MatrixReportLocale;
  readonly content: MatrixReportContent;
}): string {
  const headings = HEADINGS[input.locale];
  const parts = [
    block(headings.overview, input.content.overview),
    block(headings.corePortrait, input.content.corePortrait),
    block(headings.strengthsAndTalents, input.content.strengthsAndTalents),
    block(headings.growthAreas, input.content.growthAreas),
    block(headings.moneyAndRealization, input.content.moneyAndRealization),
    block(headings.relationships, input.content.relationships),
    block(headings.lineageThemes, input.content.lineageThemes),
    block(headings.purposes, input.content.purposes)
  ];
  if (input.content.yearProjection !== null) {
    parts.push(block(headings.yearProjection, input.content.yearProjection));
  }
  parts.push(
    block(headings.reflectionQuestions, numbered(input.content.reflectionQuestions)),
    block(headings.practicalSteps, numbered(input.content.practicalSteps)),
    block(headings.disclaimer, input.content.disclaimer)
  );
  return parts.join("\n\n");
}

function block(heading: string, body: string): string {
  return `${heading}\n${body}`;
}

function numbered(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function section(value: string, name: string, max = 5_000): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max) {
    throw new MatrixValidationError(`Matrix report ${name} must be between 1 and ${max} characters`);
  }
  return normalized;
}

function list(values: readonly string[], name: string): readonly string[] {
  if (values.length < 1 || values.length > 12) {
    throw new MatrixValidationError(`Matrix report ${name} must contain between 1 and 12 items`);
  }
  return values.map((value) => section(value, name, 500));
}

function optional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return required(value, "Matrix report metadata is invalid");
}

function checksum(value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new MatrixValidationError("Matrix report result checksum is invalid");
  }
  return value;
}

function required(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new MatrixValidationError(message);
  return normalized;
}
