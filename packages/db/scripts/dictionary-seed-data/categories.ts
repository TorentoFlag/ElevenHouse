import type { DictionarySeedCategory } from "./types";

export const dictionarySeedCategories = [
  { code: "planets", name: "Планеты", order: 10 },
  { code: "zodiac_signs", name: "Знаки зодиака", order: 20 },
  { code: "planets_in_signs", name: "Планеты в знаках", order: 30 },
  { code: "planets_in_houses", name: "Планеты в домах", order: 40 },
  { code: "aspects", name: "Аспекты", order: 50 },
  { code: "planet_aspects", name: "Аспекты планет", order: 60 },
  { code: "house_meanings", name: "Значения домов", order: 70 }
] satisfies readonly DictionarySeedCategory[];
