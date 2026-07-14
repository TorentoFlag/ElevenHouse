import {
  MATRIX_ENGINE_REVISION,
  MATRIX_INTERPRETATION_REVISION,
  MATRIX_METHOD_CODE,
  type MatrixData,
  type MatrixEnergyMap,
  type MatrixIndividualBaseResult,
  type MatrixParticipantInput,
  type MatrixPoints,
  type MatrixPurposes
} from "../matrix-types";
import { reduce22 } from "../reduce22";
import { parseMatrixDate, sumDigits } from "./matrix-date";

export function calculateLadini22Individual(input: {
  readonly participant: MatrixParticipantInput;
}): MatrixIndividualBaseResult {
  const { day, month, year } = parseMatrixDate(input.participant.birthDate);
  const A = reduce22(day);
  const B = reduce22(month);
  const C = reduce22(sumDigits(year));
  const D = reduce22(A + B + C);
  const E = reduce22(A + B + C + D);
  const tl = reduce22(A + B);
  const tr = reduce22(B + C);
  const br = reduce22(C + D);
  const bl = reduce22(D + A);
  const points: MatrixPoints = {
    A,
    B,
    C,
    D,
    E,
    tl,
    tr,
    br,
    bl,
    A1: reduce22(A + E),
    B1: reduce22(B + E),
    C1: reduce22(C + E),
    D1: reduce22(D + E),
    tl1: reduce22(tl + E),
    tr1: reduce22(tr + E),
    br1: reduce22(br + E),
    bl1: reduce22(bl + E)
  };
  return {
    methodCode: MATRIX_METHOD_CODE,
    engineRevision: MATRIX_ENGINE_REVISION,
    interpretationRevision: MATRIX_INTERPRETATION_REVISION,
    mode: "individual",
    participant: input.participant,
    matrix: buildMatrixData(points)
  };
}

export function buildMatrixData(
  points: MatrixPoints,
  purposes = calculatePurposes(points)
): MatrixData {
  return {
    points,
    purposes,
    zones: {
      purpose: purposes.personal,
      money: reduce22(points.E + points.br),
      love: reduce22(points.E + points.bl),
      energy: reduce22(points.E + points.B)
    },
    energyMap: calculateEnergyMap(points)
  };
}

export function calculatePurposes(points: MatrixPoints): MatrixPurposes {
  const earth = reduce22(points.A + points.C);
  const sky = reduce22(points.B + points.D);
  const male = reduce22(points.tl + points.br);
  const female = reduce22(points.tr + points.bl);
  const personal = reduce22(earth + sky);
  const social = reduce22(male + female);
  return {
    earth,
    sky,
    male,
    female,
    personal,
    social,
    spiritual: reduce22(personal + social)
  };
}

function calculateEnergyMap(points: MatrixPoints): MatrixEnergyMap {
  const rows: MatrixEnergyMap["rows"] = [
    energyRow("sahasrara", points.B, points.B1),
    energyRow("ajna", points.tr, points.tr1),
    energyRow("vishuddha", points.C, points.C1),
    energyRow("anahata", points.br, points.br1),
    energyRow("manipura", points.D, points.D1),
    energyRow("svadhisthana", points.bl, points.bl1),
    energyRow("muladhara", points.A, points.A1)
  ];
  const physical = reduce22(rows.reduce((sum, row) => sum + row.physical, 0));
  const energy = reduce22(rows.reduce((sum, row) => sum + row.energy, 0));
  return {
    rows,
    totals: {
      physical,
      energy,
      emotions: reduce22(physical + energy)
    }
  };
}

function energyRow(
  code: MatrixEnergyMap["rows"][number]["code"],
  physical: number,
  energy: number
): MatrixEnergyMap["rows"][number] {
  return { code, physical, energy, emotions: reduce22(physical + energy) };
}
