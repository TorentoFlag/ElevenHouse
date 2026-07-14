import { ladini22Engine } from "./ladini-22/engine";
import { UnsupportedMatrixMethodError } from "./matrix-errors";
import type { MatrixMethodEngine } from "./matrix-types";

const engines = { ladini_22: ladini22Engine } as const;

export function resolveMatrixMethod(code: string): MatrixMethodEngine {
  const engine = engines[code as keyof typeof engines];
  if (!engine) throw new UnsupportedMatrixMethodError(code);
  return engine;
}
