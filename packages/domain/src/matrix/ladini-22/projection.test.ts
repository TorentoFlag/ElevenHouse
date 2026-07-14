import { describe, expect, it } from "vitest";
import { calculateLadini22Individual } from "./individual";
import { calculateLadini22Projection } from "./projection";

const participant = { displayName: "Марина Краснова", birthDate: "1990-03-14" } as const;
const matrix = calculateLadini22Individual({ participant }).matrix;

function projectionFor(birthDate: string, currentDate: string, selectedYear = 2026) {
  const currentParticipant = { ...participant, birthDate };
  return calculateLadini22Projection({
    participant: currentParticipant,
    matrix: calculateLadini22Individual({ participant: currentParticipant }).matrix,
    selectedYear,
    currentDate,
    timezone: "Europe/Moscow"
  });
}

describe("Ladini 22 derived projection", () => {
  it("separates current age cycle from the selected year forecast", () => {
    const projection = calculateLadini22Projection({
      participant,
      matrix,
      selectedYear: 2026,
      currentDate: "2026-03-13",
      timezone: "Europe/Moscow"
    });
    expect(projection).toEqual({
      methodCode: "ladini_22",
      engineRevision: 1,
      timezone: "Europe/Moscow",
      currentDate: "2026-03-13",
      participant,
      ageCycle: { age: 35, cycleAge: 35, decadeIndex: 3, pointCode: "tr", arcana: 22 },
      yearForecast: { year: 2026, personalYear: 9, challenge: 18, resource: 5 }
    });
  });

  it("changes age on the complete birthday and repeats the cycle after 80", () => {
    expect(projectionFor("1990-03-14", "2020-03-13").ageCycle).toMatchObject({
      age: 29,
      cycleAge: 29,
      pointCode: "B"
    });
    expect(projectionFor("1990-03-14", "2020-03-14").ageCycle).toMatchObject({
      age: 30,
      cycleAge: 30,
      pointCode: "tr"
    });
    expect(projectionFor("1941-03-14", "2020-03-14").ageCycle).toMatchObject({
      age: 79,
      cycleAge: 79,
      pointCode: "bl"
    });
    expect(projectionFor("1940-03-14", "2020-03-14").ageCycle).toMatchObject({
      age: 80,
      cycleAge: 0,
      pointCode: "A"
    });
    expect(projectionFor("1931-03-14", "2020-03-14").ageCycle).toMatchObject({
      age: 89,
      cycleAge: 9,
      pointCode: "A"
    });
    expect(projectionFor("1930-03-14", "2020-03-14").ageCycle).toMatchObject({
      age: 90,
      cycleAge: 10,
      pointCode: "tl"
    });
  });

  it("keeps current age independent from the selected forecast year", () => {
    const first = projectionFor("1990-03-14", "2026-07-14", 2026);
    const second = projectionFor("1990-03-14", "2026-07-14", 2027);
    expect(second.ageCycle).toEqual(first.ageCycle);
    expect(second.yearForecast.year).toBe(2027);
    expect(second.yearForecast.personalYear).not.toBe(first.yearForecast.personalYear);
  });

  it("rejects impossible current context", () => {
    expect(() => projectionFor("1990-03-14", "1989-03-14")).toThrow("cannot precede birth date");
    expect(() =>
      calculateLadini22Projection({
        participant,
        matrix,
        selectedYear: 1800,
        currentDate: "2026-07-14",
        timezone: "Europe/Moscow"
      })
    ).toThrow("between 1900 and 2200");
  });
});
