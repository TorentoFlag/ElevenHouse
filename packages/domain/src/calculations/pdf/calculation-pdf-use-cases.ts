import { CalculationResultChangedError, CalculationValidationError } from "../calculation-errors";
import { sha256CanonicalJson } from "../canonical-json";
import type {
  CalculationPdfJob,
  CalculationPdfLocale,
  CalculationPdfSourceLocator
} from "./calculation-pdf-types";

const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function assertCalculationPdfTargetsCurrentResult(input: {
  readonly currentResultChecksum: string;
  readonly expectedResultChecksum: string;
}): string {
  const current = digest(input.currentResultChecksum);
  const expected = digest(input.expectedResultChecksum);
  if (current !== expected) throw new CalculationResultChangedError();
  return current;
}

export function normalizeCalculationPdfSourceLocator(input: unknown): CalculationPdfSourceLocator {
  if (!isPlainObject(input) || typeof input.kind !== "string") {
    throw new CalculationValidationError("Calculation PDF source locator is invalid");
  }
  if (input.kind === "matrix_report") {
    assertExactKeys(input, ["kind", "reportId", "reportRevision", "reportResultChecksum"]);
    if (
      typeof input.reportId !== "string" ||
      input.reportId.trim().length === 0 ||
      !Number.isInteger(input.reportRevision) ||
      (input.reportRevision as number) < 1
    ) {
      throw new CalculationValidationError("Matrix PDF source locator is invalid");
    }
    return {
      kind: "matrix_report",
      reportId: input.reportId.trim(),
      reportRevision: input.reportRevision as number,
      reportResultChecksum: digest(input.reportResultChecksum)
    };
  }
  if (input.kind === "approved_interpretation") {
    assertExactKeys(input, ["kind", "interpretationId"]);
    if (
      input.interpretationId !== null &&
      (typeof input.interpretationId !== "string" || input.interpretationId.trim().length === 0)
    ) {
      throw new CalculationValidationError("Numerology PDF source locator is invalid");
    }
    return {
      kind: "approved_interpretation",
      interpretationId:
        typeof input.interpretationId === "string" ? input.interpretationId.trim() : null
    };
  }
  throw new CalculationValidationError("Calculation PDF source locator kind is unsupported");
}

export function calculationPdfDocumentFingerprint(input: {
  readonly resultChecksum: string;
  readonly locale: CalculationPdfLocale;
  readonly sourceLocator: CalculationPdfSourceLocator;
  readonly renderContract: string;
}): `sha256:${string}` {
  const locale = normalizeLocale(input.locale);
  const sourceLocator = normalizeCalculationPdfSourceLocator(input.sourceLocator);
  const renderContract = required(
    input.renderContract,
    "Calculation PDF render contract is required"
  );
  return sha256CanonicalJson({
    locale,
    renderContract,
    resultChecksum: digest(input.resultChecksum),
    sourceLocator
  });
}

export function isReusableCalculationPdfJob(
  job: CalculationPdfJob,
  identity: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly resultChecksum: string;
    readonly locale: CalculationPdfLocale;
    readonly documentFingerprint: string;
  }
): boolean {
  return (
    job.status !== "failed" &&
    job.ownerUserId === identity.ownerUserId &&
    job.calculationId === identity.calculationId &&
    job.resultChecksum === identity.resultChecksum &&
    job.locale === identity.locale &&
    job.documentFingerprint === identity.documentFingerprint
  );
}

export function publicCalculationPdfFailureReason(job: CalculationPdfJob): string | null {
  return job.status === "failed" ? "PDF generation failed. Please try again." : null;
}

function normalizeLocale(value: string): CalculationPdfLocale {
  if (value !== "ru" && value !== "en") {
    throw new CalculationValidationError("Calculation PDF locale is invalid");
  }
  return value;
}

function digest(value: unknown): string {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new CalculationValidationError("Calculation PDF checksum is invalid");
  }
  return value;
}

function required(value: string, message: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 200) {
    throw new CalculationValidationError(message);
  }
  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(object: Record<string, unknown>, expected: readonly string[]): void {
  const expectedKeys = [...expected].sort();
  const actualKeys = Object.keys(object).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new CalculationValidationError("Calculation PDF source locator is invalid");
  }
}
