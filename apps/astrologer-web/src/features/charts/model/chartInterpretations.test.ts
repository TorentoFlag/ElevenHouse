import { describe, expect, it } from "vitest";
import type { StoredChartCalculationPayload } from "@elevenhouse/contracts";
import {
  buildChartInterpretationAnchors,
  getChartInterpretationLookupCodes
} from "./chartInterpretations";

describe("chartInterpretations", () => {
  it("derives deterministic dictionary anchors from natal points, houses and aspects", () => {
    const anchors = buildChartInterpretationAnchors(chartResult());

    expect(getChartInterpretationLookupCodes(anchors)).toEqual([
      "sun_cancer",
      "sun_house_11",
      "moon_aries",
      "moon_house_8",
      "pluto_scorpio",
      "pluto_house_7",
      "house_1",
      "house_7",
      "square",
      "trine",
      "sun_moon",
      "moon_pluto"
    ]);
    expect(anchors.map((anchor) => `${anchor.group}:${anchor.label}`)).toEqual([
      "points:Солнце в Раке",
      "points:Солнце · XI дом",
      "points:Луна в Овне",
      "points:Луна · VIII дом",
      "points:Плутон в Скорпионе",
      "points:Плутон · VII дом",
      "houses:I дом",
      "houses:VII дом",
      "aspects:Квадрат",
      "aspects:Тригон",
      "aspects:Солнце — Луна",
      "aspects:Луна — Плутон"
    ]);
    expect(anchors.map((anchor) => `${anchor.code}:${anchor.categoryCode}`)).toEqual([
      "sun_cancer:planets_in_signs",
      "sun_house_11:planets_in_houses",
      "moon_aries:planets_in_signs",
      "moon_house_8:planets_in_houses",
      "pluto_scorpio:planets_in_signs",
      "pluto_house_7:planets_in_houses",
      "house_1:house_meanings",
      "house_7:house_meanings",
      "square:aspects",
      "trine:aspects",
      "sun_moon:planet_aspects",
      "moon_pluto:planet_aspects"
    ]);
  });
});

function chartResult(): StoredChartCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    },
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: {
      points: [
        {
          id: "sun",
          label: "Sun",
          longitude: 113.1,
          sign: "cancer",
          signDegree: 22.6,
          house: 11,
          retrograde: false
        },
        {
          id: "moon",
          label: "Moon",
          longitude: 21.2,
          sign: "aries",
          signDegree: 21.22,
          house: 8,
          retrograde: false
        },
        {
          id: "pluto",
          label: "Pluto",
          longitude: 225,
          sign: "scorpio",
          signDegree: 15,
          house: 7,
          retrograde: true
        }
      ],
      houses: [
        { number: 1, longitude: 166.61, sign: "virgo", signDegree: 16.61 },
        { number: 7, longitude: 346.61, sign: "pisces", signDegree: 16.61 }
      ],
      aspects: [
        { pointA: "moon", pointB: "sun", type: "square", angle: 90, orb: 1.4, applying: true },
        { pointA: "moon", pointB: "pluto", type: "trine", angle: 120, orb: 2.1, applying: true }
      ],
      distributions: {
        elements: { fire: 2, earth: 4, air: 1, water: 3 },
        modalities: { cardinal: 6, fixed: 3, mutable: 1 },
        polarity: { masculine: 3, feminine: 7 }
      },
      warnings: []
    }
  };
}
