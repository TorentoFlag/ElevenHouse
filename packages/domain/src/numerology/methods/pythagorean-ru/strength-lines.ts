import type {
  NumerologyLineLevel,
  PythagoreanPsychomatrixCells,
  PythagoreanStrengthLineResult
} from "../../numerology-types";
import { STRENGTH_LINES } from "./profile";

const LEVEL_LABELS: Readonly<Record<NumerologyLineLevel, string>> = {
  absent: "Линия не выражена",
  weak: "Слабая выраженность",
  moderate: "Умеренная выраженность",
  expressed: "Выраженная линия",
  strong: "Сильная линия"
};

export function calculateStrengthLines(
  cells: PythagoreanPsychomatrixCells
): readonly PythagoreanStrengthLineResult[] {
  return STRENGTH_LINES.map((line) => {
    const value = line.cells.reduce((sum, digit) => sum + cells[digit].length, 0);
    const level = classifyLineLevel(value);
    return { ...line, value, level, levelLabel: LEVEL_LABELS[level] };
  });
}

export function classifyLineLevel(value: number): NumerologyLineLevel {
  if (value === 0) return "absent";
  if (value === 1) return "weak";
  if (value === 2) return "moderate";
  if (value === 3) return "expressed";
  return "strong";
}
