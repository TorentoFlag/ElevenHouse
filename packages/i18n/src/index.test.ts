import { describe, expect, it, vi } from "vitest";
import {
  defaultLocale,
  i18nStorageKey,
  isSupportedLocale,
  localeOptions,
  resolveInitialLocale,
  type LocaleStorage
} from "./index";

describe("isSupportedLocale", () => {
  it("accepts launch locales", () => {
    expect(isSupportedLocale("ru")).toBe(true);
    expect(isSupportedLocale("en")).toBe(true);
  });

  it("rejects unsupported locales", () => {
    expect(isSupportedLocale("de")).toBe(false);
  });

  it("uses Russian as the default launch locale", () => {
    expect(defaultLocale).toBe("ru");
  });
});

describe("localeOptions", () => {
  it("exposes stable RU and EN switcher labels", () => {
    expect(localeOptions).toEqual([
      { locale: "ru", label: "Русский", shortLabel: "RU" },
      { locale: "en", label: "English", shortLabel: "EN" }
    ]);
  });
});

describe("resolveInitialLocale", () => {
  it("uses an explicit initial locale before storage and browser preferences", () => {
    const storage = createStorage("en");

    expect(
      resolveInitialLocale({
        initialLocale: "ru",
        storage,
        browserLanguages: ["en-US"]
      })
    ).toBe("ru");
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it("prefers a supported stored locale", () => {
    const storage = createStorage("en");

    expect(resolveInitialLocale({ storage, browserLanguages: ["ru-RU"] })).toBe("en");
    expect(storage.getItem).toHaveBeenCalledWith(i18nStorageKey);
  });

  it("falls back to the first supported browser language", () => {
    expect(
      resolveInitialLocale({
        storage: createStorage("de"),
        browserLanguages: ["de-DE", "en-US", "ru-RU"]
      })
    ).toBe("en");
  });

  it("normalizes region-specific browser language tags", () => {
    expect(
      resolveInitialLocale({
        storage: createStorage(null),
        browserLanguages: ["ru-RU"]
      })
    ).toBe("ru");
  });

  it("falls back to the default locale when storage and browser languages are unsupported", () => {
    expect(
      resolveInitialLocale({
        storage: createStorage("fr"),
        browserLanguages: ["de-DE"]
      })
    ).toBe(defaultLocale);
  });

  it("ignores storage read failures", () => {
    const storage: LocaleStorage = {
      getItem: vi.fn(() => {
        throw new Error("storage denied");
      }),
      setItem: vi.fn()
    };

    expect(resolveInitialLocale({ storage, browserLanguages: ["en-US"] })).toBe("en");
  });
});

function createStorage(value: string | null): LocaleStorage {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn()
  };
}
