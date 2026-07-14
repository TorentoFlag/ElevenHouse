import { describe, expect, it } from "vitest";
import { calculateLadini22Compatibility } from "./compatibility";

const first = { displayName: "Марина Краснова", birthDate: "1990-03-14" } as const;
const second = { displayName: "Иван Петров", birthDate: "2000-01-01" } as const;

describe("Ladini 22 compatibility Matrix", () => {
  it("builds the composite from two complete individual matrices", () => {
    const result = calculateLadini22Compatibility({ first, second });
    expect(result.mode).toBe("compatibility");
    expect(result.participants).toEqual({ first, second });
    expect(result.individuals[0].matrix.points.E).toBe(9);
    expect(result.individuals[1].matrix.points.E).toBe(8);
    expect(result.composite.points).toEqual({
      A: 15,
      B: 4,
      C: 21,
      D: 13,
      E: 17,
      tl: 19,
      tr: 7,
      br: 16,
      bl: 10,
      A1: 14,
      B1: 21,
      C1: 20,
      D1: 3,
      tl1: 18,
      tr1: 15,
      br1: 6,
      bl1: 9
    });
    expect(result.composite.purposes).toEqual({
      earth: 9,
      sky: 17,
      male: 17,
      female: 17,
      personal: 8,
      social: 7,
      spiritual: 15
    });
    expect(result.composite.zones).toEqual({
      purpose: 8,
      money: 6,
      love: 9,
      energy: 21
    });
  });

  it("preserves participant display order", () => {
    const direct = calculateLadini22Compatibility({ first, second });
    const reversed = calculateLadini22Compatibility({ first: second, second: first });
    expect(direct.participants.first).toEqual(first);
    expect(reversed.participants.first).toEqual(second);
    expect(reversed.composite).toEqual(direct.composite);
  });
});
