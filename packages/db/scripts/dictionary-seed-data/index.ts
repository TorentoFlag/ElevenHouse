export type { DictionarySeedCategory, DictionarySeedPlatformEntry } from "./types";
export { dictionarySeedCategories } from "./categories";

import { aspectSeedPlatformEntries } from "./aspects";
import { houseMeaningSeedPlatformEntries } from "./house-meanings";
import { planetAspectSeedPlatformEntries } from "./planet-aspects";
import { planetSeedPlatformEntries } from "./planets";
import { planetHouseSeedPlatformEntries } from "./planets-in-houses";
import { planetSignSeedPlatformEntries } from "./planets-in-signs";
import { zodiacSignSeedPlatformEntries } from "./zodiac-signs";
import type { DictionarySeedPlatformEntry } from "./types";

export const dictionarySeedPlatformEntries = [
  ...planetSeedPlatformEntries,
  ...zodiacSignSeedPlatformEntries,
  ...planetSignSeedPlatformEntries,
  ...aspectSeedPlatformEntries,
  ...planetAspectSeedPlatformEntries,
  ...houseMeaningSeedPlatformEntries,
  ...planetHouseSeedPlatformEntries
] satisfies readonly DictionarySeedPlatformEntry[];
