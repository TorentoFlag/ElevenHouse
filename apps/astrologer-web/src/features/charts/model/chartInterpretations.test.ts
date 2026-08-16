import { describe, expect, it } from "vitest";
import type {
  StoredChartCalculationPayload,
  StoredChartAstrocartographyCalculationPayload,
  StoredChartCompositeCalculationPayload,
  StoredChartHoraryCalculationPayload,
  StoredChartNatalCalculationPayload,
  StoredChartProgressionCalculationPayload,
  StoredChartSolarReturnCalculationPayload,
  StoredChartSynastryCalculationPayload
} from "@elevenhouse/contracts";
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

  it("derives deterministic dictionary anchors for transit aspects to natal points", () => {
    const anchors = buildChartInterpretationAnchors(transitResult());

    expect(getChartInterpretationLookupCodes(anchors)).toContain("transit_mars_sun_opposition");
    expect(anchors.map((anchor) => `${anchor.group}:${anchor.label}`)).toContain(
      "aspects:Транзитный Марс — Солнце"
    );
    expect(anchors.find((anchor) => anchor.code === "transit_mars_sun_opposition")).toMatchObject({
      categoryCode: "planet_aspects",
      meta: "Транзит к наталу",
      position: "Оппозиция · орбис 1.20°"
    });
  });

  it("derives deterministic dictionary anchors for solar return aspects to natal points", () => {
    const anchors = buildChartInterpretationAnchors(solarReturnResult());

    expect(getChartInterpretationLookupCodes(anchors)).toContain(
      "solar_return.mars.opposition.sun"
    );
    expect(anchors.map((anchor) => `${anchor.group}:${anchor.label}`)).toContain(
      "aspects:Солярный Марс — Солнце"
    );
    expect(
      anchors.find((anchor) => anchor.code === "solar_return.mars.opposition.sun")
    ).toMatchObject({
      categoryCode: "planet_aspects",
      meta: "Соляр к наталу",
      position: "Оппозиция · орбис 1.20°"
    });
  });

  it("derives deterministic dictionary anchors for progression aspects to natal points", () => {
    const anchors = buildChartInterpretationAnchors(progressionResult());

    expect(getChartInterpretationLookupCodes(anchors)).toContain("progression.mars.opposition.sun");
    expect(anchors.map((anchor) => `${anchor.group}:${anchor.label}`)).toContain(
      "aspects:Прогрессивный Марс — Солнце"
    );
    expect(
      anchors.find((anchor) => anchor.code === "progression.mars.opposition.sun")
    ).toMatchObject({
      categoryCode: "planet_aspects",
      meta: "Прогрессия к наталу",
      position: "Оппозиция · орбис 1.20°"
    });
  });

  it("derives deterministic dictionary anchors for synastry result-only interpretations", () => {
    const anchors = buildChartInterpretationAnchors(synastryResult());

    expect(getChartInterpretationLookupCodes(anchors)).toEqual(
      expect.arrayContaining([
        "synastry.aspect.sun.opposition.mars",
        "synastry.overlay.primary.venus.partner_house.7",
        "synastry.overlay.partner.mars.primary_house.4",
        "synastry.score.very_important"
      ])
    );
    expect(
      anchors.map((anchor) => `${anchor.code}:${anchor.categoryCode}:${anchor.label}`)
    ).toEqual(
      expect.arrayContaining([
        "synastry.aspect.sun.opposition.mars:planet_aspects:Солнце — Марс партнёра",
        "synastry.overlay.primary.venus.partner_house.7:planets_in_houses:Венера клиента · VII дом партнёра",
        "synastry.overlay.partner.mars.primary_house.4:planets_in_houses:Марс партнёра · IV дом клиента",
        "synastry.score.very_important:aspects:Оценка совместимости"
      ])
    );
  });

  it("derives composite-specific dictionary anchors instead of natal lookup codes", () => {
    const anchors = buildChartInterpretationAnchors(compositeResult());

    expect(getChartInterpretationLookupCodes(anchors)).toEqual(
      expect.arrayContaining([
        "composite.sun.cancer",
        "composite.sun.house.11",
        "composite.house.1",
        "composite.aspect.sun.square.moon"
      ])
    );
    expect(getChartInterpretationLookupCodes(anchors)).not.toContain("sun_cancer");
    expect(anchors.map((anchor) => `${anchor.code}:${anchor.categoryCode}:${anchor.meta}`)).toEqual(
      expect.arrayContaining([
        "composite.sun.cancer:planets_in_signs:Композит · планета в знаке",
        "composite.aspect.sun.square.moon:planet_aspects:Композит · аспект"
      ])
    );
  });

  it("derives child-specific dictionary anchors from natal result without natal fallback", () => {
    const anchors = buildChartInterpretationAnchors(chartResult(), { mode: "child" });

    expect(getChartInterpretationLookupCodes(anchors)).toEqual(
      expect.arrayContaining([
        "child.sun.cancer",
        "child.sun.house.11",
        "child.house.1",
        "child.aspect.sun.square.moon"
      ])
    );
    expect(getChartInterpretationLookupCodes(anchors)).not.toContain("sun_cancer");
    expect(getChartInterpretationLookupCodes(anchors)).not.toContain("sun_house_11");
    expect(anchors.map((anchor) => `${anchor.code}:${anchor.categoryCode}:${anchor.meta}`)).toEqual(
      expect.arrayContaining([
        "child.sun.cancer:planets_in_signs:Детская карта · планета в знаке",
        "child.sun.house.11:planets_in_houses:Детская карта · планета в доме",
        "child.house.1:house_meanings:Детская карта · значение дома",
        "child.aspect.sun.square.moon:planet_aspects:Детская карта · аспект"
      ])
    );
  });

  it("derives horary-specific dictionary anchors without natal fallback", () => {
    const anchors = buildChartInterpretationAnchors(horaryResult());

    expect(getChartInterpretationLookupCodes(anchors)).toEqual(
      expect.arrayContaining([
        "horary.sun.cancer",
        "horary.sun.house.11",
        "horary.house.1",
        "horary.aspect.sun.square.moon",
        "horary.question.career"
      ])
    );
    expect(getChartInterpretationLookupCodes(anchors)).not.toContain("sun_cancer");
    expect(getChartInterpretationLookupCodes(anchors)).not.toContain("sun_house_11");
    expect(anchors.map((anchor) => `${anchor.code}:${anchor.categoryCode}:${anchor.meta}`)).toEqual(
      expect.arrayContaining([
        "horary.sun.cancer:planets_in_signs:Хорар · планета в знаке",
        "horary.sun.house.11:planets_in_houses:Хорар · планета в доме",
        "horary.house.1:house_meanings:Хорар · значение дома",
        "horary.aspect.sun.square.moon:planet_aspects:Хорар · аспект",
        "horary.question.career:aspects:Хорар · категория вопроса"
      ])
    );
  });

  it("derives astrocartography line anchors without natal fallback", () => {
    const anchors = buildChartInterpretationAnchors(astrocartographyResult());

    expect(getChartInterpretationLookupCodes(anchors)).toEqual([
      "astrocartography.sun.mc",
      "astrocartography.moon.asc"
    ]);
    expect(anchors.map((anchor) => `${anchor.code}:${anchor.categoryCode}:${anchor.meta}`)).toEqual(
      [
        "astrocartography.sun.mc:planet_aspects:Астрография · линия планеты",
        "astrocartography.moon.asc:planet_aspects:Астрография · линия планеты"
      ]
    );
    expect(anchors.map((anchor) => `${anchor.group}:${anchor.label}`)).toEqual([
      "aspects:Солнце MC",
      "aspects:Луна Asc"
    ]);
  });
});

function chartResult(): StoredChartNatalCalculationPayload {
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

function transitResult(): StoredChartCalculationPayload {
  const natal = chartResult().result;

  return {
    schemaVersion: "chart-result.v1",
    method: "transit",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: chartResult().settings,
    inputSnapshot: chartResult().inputSnapshot,
    transitSnapshot: {
      date: "2026-07-22",
      time: "14:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964
    },
    result: {
      natal,
      transit: {
        ...natal,
        points: [
          {
            id: "mars",
            label: "Mars",
            longitude: 293.4,
            sign: "capricorn",
            signDegree: 23.4,
            house: 4,
            retrograde: false
          }
        ],
        aspects: [],
        warnings: []
      },
      aspectsToNatal: [
        {
          transitPoint: "mars",
          natalPoint: "sun",
          type: "opposition",
          angle: 180,
          orb: 1.2,
          applying: true
        }
      ],
      warnings: []
    }
  };
}

function synastryResult(): StoredChartSynastryCalculationPayload {
  const primary = chartResult().result;
  const partner = {
    ...chartResult().result,
    points: [
      {
        id: "mars",
        label: "Mars",
        longitude: 293.4,
        sign: "capricorn",
        signDegree: 23.4,
        house: 4,
        retrograde: false
      }
    ],
    aspects: []
  };

  return {
    schemaVersion: "chart-result.v1",
    method: "synastry",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: chartResult().settings,
    inputSnapshot: chartResult().inputSnapshot,
    partnerInputSnapshot: {
      birthDate: "1992-08-11",
      birthTime: "08:15",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      birthTimePrecision: "exact"
    },
    relationshipSnapshot: {
      primaryClientId: "11111111-1111-4111-8111-111111111111",
      partnerClientId: "22222222-2222-4222-8222-222222222222"
    },
    result: {
      primary,
      partner,
      aspectsBetween: [
        {
          primaryPoint: "sun",
          partnerPoint: "mars",
          type: "opposition",
          angle: 180,
          orb: 1.2,
          applying: true
        }
      ],
      houseOverlays: [
        {
          owner: "primary",
          point: "venus",
          projectedHouseOwner: "partner",
          projectedHouse: 7
        },
        {
          owner: "partner",
          point: "mars",
          projectedHouseOwner: "primary",
          projectedHouse: 4
        }
      ],
      relationshipScore: {
        value: 18,
        label: "very_important",
        breakdown: [{ code: "venus_mars_trine", points: 4 }]
      },
      warnings: []
    }
  };
}

function compositeResult(): StoredChartCompositeCalculationPayload {
  const natal = chartResult();

  return {
    schemaVersion: "chart-result.v1",
    method: "composite",
    provider: natal.provider,
    settings: natal.settings,
    inputSnapshot: natal.inputSnapshot,
    partnerInputSnapshot: {
      birthDate: "1992-08-11",
      birthTime: "08:15",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      birthTimePrecision: "exact"
    },
    relationshipSnapshot: {
      primaryClientId: "22222222-2222-4222-8222-222222222222",
      partnerClientId: "55555555-5555-4555-8555-555555555555"
    },
    result: natal.result
  };
}

function horaryResult(): StoredChartHoraryCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "horary",
    provider: chartResult().provider,
    settings: chartResult().settings,
    questionSnapshot: {
      question: "Стоит ли принимать предложение?",
      category: "career",
      date: "2026-07-23",
      time: "14:30",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173
    },
    result: chartResult().result
  };
}

function astrocartographyResult(): StoredChartAstrocartographyCalculationPayload {
  return {
    schemaVersion: "chart-result.v1",
    method: "astrocartography",
    provider: chartResult().provider,
    settings: chartResult().settings,
    inputSnapshot: chartResult().inputSnapshot,
    result: {
      lines: [
        {
          id: "sun_mc",
          point: "sun",
          angle: "mc",
          label: "Солнце MC",
          path: [
            { latitude: -66, longitude: 10 },
            { latitude: 66, longitude: 10 }
          ]
        },
        {
          id: "moon_asc",
          point: "moon",
          angle: "asc",
          label: "Луна Asc",
          path: [
            { latitude: -20, longitude: -30 },
            { latitude: 20, longitude: 30 }
          ]
        }
      ],
      warnings: []
    }
  };
}

function solarReturnResult(): StoredChartSolarReturnCalculationPayload {
  const natal = chartResult().result;

  return {
    schemaVersion: "chart-result.v1",
    method: "solar_return",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: chartResult().settings,
    inputSnapshot: chartResult().inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar",
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      resolvedAt: "2026-07-15T01:20:01.000Z"
    },
    result: {
      natal,
      solarReturn: {
        ...natal,
        points: [
          {
            id: "mars",
            label: "Mars",
            longitude: 293.4,
            sign: "capricorn",
            signDegree: 23.4,
            house: 4,
            retrograde: false
          }
        ],
        aspects: [],
        warnings: []
      },
      aspectsToNatal: [
        {
          solarReturnPoint: "mars",
          natalPoint: "sun",
          type: "opposition",
          angle: 180,
          orb: 1.2,
          applying: true
        }
      ],
      warnings: []
    }
  };
}

function progressionResult(): StoredChartProgressionCalculationPayload {
  const natal = chartResult().result;

  return {
    schemaVersion: "chart-result.v1",
    method: "progression",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: chartResult().settings,
    inputSnapshot: chartResult().inputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary",
      calculationBasis: {
        symbolicDate: "1990-08-20",
        ageDays: 36,
        dayForYearRatio: 1
      }
    },
    result: {
      natal,
      progressed: {
        ...natal,
        points: [
          {
            id: "mars",
            label: "Mars",
            longitude: 293.4,
            sign: "capricorn",
            signDegree: 23.4,
            house: 4,
            retrograde: false
          }
        ],
        aspects: [],
        warnings: []
      },
      aspectsToNatal: [
        {
          progressedPoint: "mars",
          natalPoint: "sun",
          type: "opposition",
          angle: 180,
          orb: 1.2,
          applying: true
        }
      ],
      warnings: []
    }
  };
}
