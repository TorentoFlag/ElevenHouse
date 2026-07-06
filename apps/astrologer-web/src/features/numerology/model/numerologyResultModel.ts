import type { NumerologyCalculationResponse } from "@elevenhouse/contracts";

export type NumerologyKeyNumber = {
  readonly code: string;
  readonly label: string;
  readonly value: number | null;
};

export type PythagoreanMatrixCell = {
  readonly digit: string;
  readonly value: string;
  readonly count: number;
};

const keyNumberLabels: Record<string, string> = {
  lifePath: "Жизненный путь",
  birthday: "День рождения",
  personalYear: "Личный год",
  personalMonth: "Личный месяц",
  personalDay: "Личный день",
  expression: "Выражение",
  soul: "Душа",
  personality: "Личность"
};

const matrixDigits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function getNumerologyKeyNumbers(
  response: NumerologyCalculationResponse | null
): readonly NumerologyKeyNumber[] {
  const snapshot = response?.resultSnapshot as { keyNumbers?: Record<string, unknown> } | null;
  const keyNumbers = snapshot?.keyNumbers ?? {};

  return Object.entries(keyNumberLabels)
    .map(([code, label]) => ({
      code,
      label,
      value: typeof keyNumbers[code] === "number" ? keyNumbers[code] : null
    }))
    .filter((item) => item.value !== null);
}

export function getPythagoreanMatrixCells(
  response: NumerologyCalculationResponse | null
): readonly PythagoreanMatrixCell[] {
  const snapshot = response?.resultSnapshot as
    | { psychomatrix?: { cells?: Record<string, unknown> } }
    | null;
  const cells = snapshot?.psychomatrix?.cells ?? {};

  return matrixDigits.map((digit) => {
    const value = typeof cells[digit] === "string" ? cells[digit] : "";

    return {
      digit,
      value,
      count: value.length
    };
  });
}

export function getCompatibilityPairNumber(
  response: NumerologyCalculationResponse | null
): number | null {
  const snapshot = response?.resultSnapshot as { pairNumber?: unknown } | null;

  return typeof snapshot?.pairNumber === "number" ? snapshot.pairNumber : null;
}

export function getLatestInterpretationText(response: NumerologyCalculationResponse | null): string {
  const latestVersionId = response?.currentVersion.id;
  const interpretation = [...(response?.calculation.interpretations ?? [])]
    .reverse()
    .find((item) => item.versionId === latestVersionId);

  return interpretation?.text ?? "";
}
