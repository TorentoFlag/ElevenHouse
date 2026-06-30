import { describe, expect, it } from "vitest";
import {
  normalizeDictionaryEntrySourceFilter,
  normalizeDictionaryLocale
} from "./dictionary-normalization";

describe("dictionary normalization", () => {
  it("normalizes supported dictionary locales", () => {
    expect(normalizeDictionaryLocale(" ru ")).toBe("ru");
  });

  it("rejects unsupported dictionary locales", () => {
    expect(() => normalizeDictionaryLocale("de")).toThrow("Unsupported dictionary locale: de");
  });

  it("defaults blank source filters to all", () => {
    expect(normalizeDictionaryEntrySourceFilter(undefined)).toBe("all");
    expect(normalizeDictionaryEntrySourceFilter("   ")).toBe("all");
  });

  it("normalizes supported source filters", () => {
    expect(normalizeDictionaryEntrySourceFilter(" modified ")).toBe("modified");
  });

  it("rejects unsupported source filters", () => {
    expect(() => normalizeDictionaryEntrySourceFilter("external")).toThrow(
      "Unsupported dictionary entry source filter: external"
    );
  });
});
