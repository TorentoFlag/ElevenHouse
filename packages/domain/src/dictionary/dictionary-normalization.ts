import { normalizeOptionalString, normalizeRequiredString } from "../shared";
import {
  dictionaryEntrySourceValues,
  dictionaryLocaleValues,
  type DictionaryEntrySourceFilter,
  type DictionaryLocale
} from "./dictionary-types";

const dictionaryLocaleSet = new Set<string>(dictionaryLocaleValues);
const dictionaryEntrySourceFilterSet = new Set<string>([
  "all",
  ...dictionaryEntrySourceValues
]);

export function normalizeDictionaryLocale(value: string): DictionaryLocale {
  const normalized = normalizeRequiredString(value, "Dictionary locale is required");
  if (!dictionaryLocaleSet.has(normalized)) {
    throw new Error(`Unsupported dictionary locale: ${normalized}`);
  }

  return normalized as DictionaryLocale;
}

export function normalizeDictionaryEntrySourceFilter(
  value: string | undefined
): DictionaryEntrySourceFilter {
  const normalized = normalizeOptionalString(value) ?? "all";
  if (!dictionaryEntrySourceFilterSet.has(normalized)) {
    throw new Error(`Unsupported dictionary entry source filter: ${normalized}`);
  }

  return normalized as DictionaryEntrySourceFilter;
}

