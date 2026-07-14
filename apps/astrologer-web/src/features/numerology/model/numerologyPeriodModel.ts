import type { NumerologyCalculationMode, NumerologyPeriodRequest } from "@elevenhouse/contracts";

export const MIN_NUMEROLOGY_YEAR = 1000;
export const MAX_NUMEROLOGY_YEAR = 9999;

export type NumerologyPeriodSelection = {
  readonly selectedYear: number;
  readonly isVisible: boolean;
};

export type NumerologyYearDraftResult = {
  readonly value: number | null;
  readonly error: string | null;
};

export type LatestPreviewGuard = {
  begin(): number;
  invalidate(): void;
  isCurrent(requestId: number): boolean;
};

export function parseNumerologyYearDraft(value: string): NumerologyYearDraftResult {
  if (!/^\d{4}$/.test(value)) {
    return { value: null, error: "Введите год четырьмя цифрами" };
  }

  const year = Number(value);
  if (year < MIN_NUMEROLOGY_YEAR || year > MAX_NUMEROLOGY_YEAR) {
    return { value: null, error: "Год должен быть от 1000 до 9999" };
  }

  return { value: year, error: null };
}

export function toNumerologyPreviewPeriodRequest(
  mode: NumerologyCalculationMode,
  selection: NumerologyPeriodSelection
): NumerologyPeriodRequest {
  if (mode !== "individual" || !selection.isVisible) {
    return { kind: "current_year" };
  }

  return {
    kind: "explicit",
    personalYear: { year: selection.selectedYear },
    personalMonths: { year: selection.selectedYear }
  };
}

export function createLatestPreviewGuard(): LatestPreviewGuard {
  let latestRequestId = 0;

  return {
    begin: () => ++latestRequestId,
    invalidate: () => {
      latestRequestId += 1;
    },
    isCurrent: (requestId) => requestId === latestRequestId
  };
}
