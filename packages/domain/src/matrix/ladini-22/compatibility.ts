import {
  MATRIX_ENGINE_REVISION,
  MATRIX_INTERPRETATION_REVISION,
  MATRIX_METHOD_CODE,
  MATRIX_POINT_CODES,
  type MatrixCompatibilityBaseResult,
  type MatrixParticipantInput,
  type MatrixPoints,
  type MatrixPurposes
} from "../matrix-types";
import { reduce22 } from "../reduce22";
import { buildMatrixData, calculateLadini22Individual } from "./individual";

const PURPOSE_CODES = [
  "earth",
  "sky",
  "male",
  "female",
  "personal",
  "social",
  "spiritual"
] as const satisfies readonly (keyof MatrixPurposes)[];

export function calculateLadini22Compatibility(input: {
  readonly first: MatrixParticipantInput;
  readonly second: MatrixParticipantInput;
}): MatrixCompatibilityBaseResult {
  const first = calculateLadini22Individual({ participant: input.first });
  const second = calculateLadini22Individual({ participant: input.second });
  const points = Object.fromEntries(
    MATRIX_POINT_CODES.map((code) => [
      code,
      reduce22(first.matrix.points[code] + second.matrix.points[code])
    ])
  ) as MatrixPoints;
  const purposes = Object.fromEntries(
    PURPOSE_CODES.map((code) => [
      code,
      reduce22(first.matrix.purposes[code] + second.matrix.purposes[code])
    ])
  ) as MatrixPurposes;
  return {
    methodCode: MATRIX_METHOD_CODE,
    engineRevision: MATRIX_ENGINE_REVISION,
    interpretationRevision: MATRIX_INTERPRETATION_REVISION,
    mode: "compatibility",
    participants: { first: input.first, second: input.second },
    individuals: [first, second],
    composite: buildMatrixData(points, purposes)
  };
}
