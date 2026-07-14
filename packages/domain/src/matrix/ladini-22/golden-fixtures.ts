import type { MatrixIndividualBaseResult } from "../matrix-types";

const participant = { displayName: "Марина Краснова", birthDate: "1990-03-14" } as const;

export const LADINI_22_GOLDEN_FIXTURES = [
  {
    participant,
    expected: {
      methodCode: "ladini_22",
      engineRevision: 1,
      interpretationRevision: 1,
      mode: "individual",
      participant,
      matrix: {
        points: {
          A: 14,
          B: 3,
          C: 19,
          D: 9,
          E: 9,
          tl: 17,
          tr: 22,
          br: 10,
          bl: 5,
          A1: 5,
          B1: 12,
          C1: 10,
          D1: 18,
          tl1: 8,
          tr1: 4,
          br1: 19,
          bl1: 14
        },
        purposes: {
          earth: 6,
          sky: 12,
          male: 9,
          female: 9,
          personal: 18,
          social: 18,
          spiritual: 9
        },
        zones: { purpose: 18, money: 19, love: 14, energy: 12 },
        energyMap: {
          rows: [
            { code: "sahasrara", physical: 3, energy: 12, emotions: 15 },
            { code: "ajna", physical: 22, energy: 4, emotions: 8 },
            { code: "vishuddha", physical: 19, energy: 10, emotions: 11 },
            { code: "anahata", physical: 10, energy: 19, emotions: 11 },
            { code: "manipura", physical: 9, energy: 18, emotions: 9 },
            { code: "svadhisthana", physical: 5, energy: 14, emotions: 19 },
            { code: "muladhara", physical: 14, energy: 5, emotions: 19 }
          ],
          totals: { physical: 10, energy: 10, emotions: 20 }
        }
      }
    } satisfies MatrixIndividualBaseResult
  }
] as const;
