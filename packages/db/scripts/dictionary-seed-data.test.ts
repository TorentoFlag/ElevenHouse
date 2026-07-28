import { describe, expect, it } from "vitest";
import {
  dictionarySeedCategories,
  dictionarySeedPlatformEntries
} from "./dictionary-seed-data/index";

describe("dictionary seed data", () => {
  it("defines the base dictionary categories in navigation order", () => {
    expect(dictionarySeedCategories).toEqual([
      { code: "planets", name: "Планеты", order: 10 },
      { code: "zodiac_signs", name: "Знаки зодиака", order: 20 },
      { code: "planets_in_signs", name: "Планеты в знаках", order: 30 },
      { code: "planets_in_houses", name: "Планеты в домах", order: 40 },
      { code: "aspects", name: "Аспекты", order: 50 },
      { code: "planet_aspects", name: "Аспекты планет", order: 60 },
      { code: "house_meanings", name: "Значения домов", order: 70 },
      { code: "calendar", name: "Астрокалендарь", order: 80 }
    ]);
  });

  it("defines Russian platform entries for house meanings", () => {
    expect(Array.isArray(dictionarySeedPlatformEntries)).toBe(true);
    if (!Array.isArray(dictionarySeedPlatformEntries)) {
      return;
    }

    const houseMeaningEntries = dictionarySeedPlatformEntries.filter(
      (entry) => entry.categoryCode === "house_meanings" && entry.locale === "ru"
    );

    expect(houseMeaningEntries).toHaveLength(12);
    expect(houseMeaningEntries.map((entry) => entry.code)).toEqual([
      "house_1",
      "house_2",
      "house_3",
      "house_4",
      "house_5",
      "house_6",
      "house_7",
      "house_8",
      "house_9",
      "house_10",
      "house_11",
      "house_12"
    ]);
    expect(houseMeaningEntries[0]).toMatchObject({
      title: "1 Дом — личность",
      status: "published"
    });
    expect(houseMeaningEntries[0]?.content).toContain(
      "Первый дом показывает то, как человек проявляет себя во внешнем мире"
    );
    expect(houseMeaningEntries[11]).toMatchObject({
      title: "12 Дом — подсознание и внутренний мир",
      status: "published"
    });
    expect(houseMeaningEntries[11]?.content).toContain(
      "Этот дом также связан с духовностью, уединением, периодами изоляции"
    );
  });

  it("defines Russian platform entries for planets", () => {
    const planetEntries = dictionarySeedPlatformEntries.filter(
      (entry) => entry.categoryCode === "planets" && entry.locale === "ru"
    );

    expect(planetEntries).toHaveLength(14);
    expect(planetEntries.map((entry) => entry.code)).toEqual([
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto",
      "personal_planets",
      "social_planets",
      "transpersonal_planets",
      "how_to_read_planet"
    ]);
    expect(planetEntries[0]).toMatchObject({
      title: "Солнце — личность и жизненная энергия",
      status: "published"
    });
    expect(planetEntries[0]?.content).toContain(
      "Солнце показывает центральную часть личности, жизненную силу"
    );
    expect(planetEntries.at(-1)).toMatchObject({
      title: "Как читать планету в карте",
      status: "published"
    });
    expect(planetEntries.at(-1)?.content).toContain(
      "Поэтому планету нельзя трактовать отдельно от всей карты"
    );
  });

  it("defines Russian platform entries for zodiac signs", () => {
    const zodiacSignEntries = dictionarySeedPlatformEntries.filter(
      (entry) => entry.categoryCode === "zodiac_signs" && entry.locale === "ru"
    );

    expect(zodiacSignEntries).toHaveLength(21);
    expect(zodiacSignEntries.map((entry) => entry.code)).toEqual([
      "zodiac_signs_overview",
      "aries",
      "taurus",
      "gemini",
      "cancer",
      "leo",
      "virgo",
      "libra",
      "scorpio",
      "sagittarius",
      "capricorn",
      "aquarius",
      "pisces",
      "fire_signs",
      "earth_signs",
      "air_signs",
      "water_signs",
      "cardinal_signs",
      "fixed_signs",
      "mutable_signs",
      "how_to_read_sign"
    ]);
    expect(zodiacSignEntries[0]).toMatchObject({
      title: "Знаки зодиака",
      status: "published"
    });
    expect(zodiacSignEntries[0]?.content).toContain(
      "Знаки зодиака показывают стиль проявления энергии в натальной карте"
    );
    expect(zodiacSignEntries.at(-1)).toMatchObject({
      title: "Как читать знак в карте",
      status: "published"
    });
    expect(zodiacSignEntries.at(-1)?.content).toContain(
      "Знак показывает не саму сферу жизни, а стиль проявления энергии"
    );
  });

  it("defines Russian platform entries for aspects", () => {
    const aspectEntries = dictionarySeedPlatformEntries.filter(
      (entry) => entry.categoryCode === "aspects" && entry.locale === "ru"
    );

    expect(aspectEntries).toHaveLength(15);
    expect(aspectEntries.map((entry) => entry.code)).toEqual([
      "conjunction",
      "sextile",
      "square",
      "trine",
      "opposition",
      "semisextile",
      "semisquare",
      "sesquiquadrate",
      "quincunx",
      "harmonious_aspects",
      "challenging_aspects",
      "neutral_mixed_aspects",
      "aspect_orb",
      "how_to_read_aspect",
      "aspects_as_development_potential"
    ]);
    expect(aspectEntries[0]).toMatchObject({
      title: "Соединение",
      status: "published"
    });
    expect(aspectEntries[0]?.content).toContain(
      "Соединение возникает, когда две планеты находятся очень близко друг к другу"
    );
    expect(aspectEntries.at(-1)).toMatchObject({
      title: "Аспекты как потенциал развития",
      status: "published"
    });
    expect(aspectEntries.at(-1)?.content).toContain(
      "Аспекты не делят карту на хорошие и плохие элементы"
    );
  });

  it("defines Russian platform entries for planet aspects", () => {
    const planetAspectEntries = dictionarySeedPlatformEntries.filter(
      (entry) => entry.categoryCode === "planet_aspects" && entry.locale === "ru"
    );

    expect(planetAspectEntries).toHaveLength(46);
    expect(planetAspectEntries.map((entry) => entry.code).slice(0, 9)).toEqual([
      "sun_moon",
      "sun_mercury",
      "sun_venus",
      "sun_mars",
      "sun_jupiter",
      "sun_saturn",
      "sun_uranus",
      "sun_neptune",
      "sun_pluto"
    ]);
    expect(planetAspectEntries[0]).toMatchObject({
      title: "Солнце — Луна",
      status: "published"
    });
    expect(planetAspectEntries[0]?.content).toContain(
      "Аспект Солнца и Луны показывает связь между сознательной волей человека"
    );
    expect(planetAspectEntries.at(-1)).toMatchObject({
      code: "how_to_use_planet_aspects",
      title: "Как использовать этот раздел",
      status: "published"
    });
    expect(planetAspectEntries.at(-1)?.content).toContain(
      "Планета 1 + тип аспекта + Планета 2 + знаки + дома"
    );
  });

  it("defines Russian platform entries for planets in signs", () => {
    const planetSignEntries = dictionarySeedPlatformEntries.filter(
      (entry) => entry.categoryCode === "planets_in_signs" && entry.locale === "ru"
    );

    expect(planetSignEntries).toHaveLength(120);
    expect(planetSignEntries.map((entry) => entry.code).slice(0, 12)).toEqual([
      "sun_aries",
      "sun_taurus",
      "sun_gemini",
      "sun_cancer",
      "sun_leo",
      "sun_virgo",
      "sun_libra",
      "sun_scorpio",
      "sun_sagittarius",
      "sun_capricorn",
      "sun_aquarius",
      "sun_pisces"
    ]);
    expect(planetSignEntries[0]).toMatchObject({
      title: "Солнце в Овне",
      status: "published"
    });
    expect(planetSignEntries[0]?.content).toContain(
      "Солнце в Овне делает личность активной, инициативной"
    );
    expect(planetSignEntries.at(-1)).toMatchObject({
      code: "pluto_pisces",
      title: "Плутон в Рыбах",
      status: "published"
    });
    expect(planetSignEntries.at(-1)?.content).toContain(
      "Плутон в Рыбах делает бессознательное, духовность, сострадание"
    );
  });

  it("defines Russian platform entries for planets in houses", () => {
    const planetHouseEntries = dictionarySeedPlatformEntries.filter(
      (entry) => entry.categoryCode === "planets_in_houses" && entry.locale === "ru"
    );

    expect(planetHouseEntries).toHaveLength(168);
    expect(planetHouseEntries.map((entry) => entry.code).slice(0, 12)).toEqual([
      "sun_house_1",
      "sun_house_2",
      "sun_house_3",
      "sun_house_4",
      "sun_house_5",
      "sun_house_6",
      "sun_house_7",
      "sun_house_8",
      "sun_house_9",
      "sun_house_10",
      "sun_house_11",
      "sun_house_12"
    ]);
    expect(planetHouseEntries.at(-1)).toMatchObject({
      code: "south_node_house_12",
      title: "Южный узел в 12 доме",
      status: "published"
    });
    expect(planetHouseEntries[0]).toMatchObject({
      title: "Солнце в 1 доме",
      status: "published"
    });
    expect(planetHouseEntries[0]?.content).toContain(
      "Солнце в первом доме усиливает стремление человека открыто проявлять свою индивидуальность"
    );
    expect(planetHouseEntries.at(-1)?.content).toContain(
      "Южный узел в двенадцатом доме показывает привычную склонность уходить во внутренний мир"
    );
  });
});
