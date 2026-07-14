import type { MatrixMethodEngine } from "../matrix-types";
import { MATRIX_ENGINE_REVISION, MATRIX_METHOD_CODE } from "../matrix-types";
import { calculateLadini22Compatibility } from "./compatibility";
import { calculateLadini22Individual } from "./individual";
import { calculateLadini22Projection } from "./projection";

export const ladini22Engine: MatrixMethodEngine = {
  methodCode: MATRIX_METHOD_CODE,
  engineRevision: MATRIX_ENGINE_REVISION,
  calculateIndividual: calculateLadini22Individual,
  calculateCompatibility: calculateLadini22Compatibility,
  calculateProjection: calculateLadini22Projection
};
