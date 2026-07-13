import { UnsupportedNumerologyMethodError } from "./numerology-errors";
import type { NumerologyMethodCode, NumerologyMethodEngine } from "./numerology-types";
import { pythagoreanRuEngine } from "./methods/pythagorean-ru/engine";

const engines = {
  pythagorean: pythagoreanRuEngine
} as const satisfies Record<NumerologyMethodCode, NumerologyMethodEngine>;

export function resolveNumerologyMethod(code: string): NumerologyMethodEngine {
  const engine = engines[code as NumerologyMethodCode];
  if (!engine) throw new UnsupportedNumerologyMethodError(code);
  return engine;
}
