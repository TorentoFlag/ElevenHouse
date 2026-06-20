import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export const supportedLocales = ["ru", "en"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export type LocaleOption = {
  locale: SupportedLocale;
  label: string;
  shortLabel: string;
};

export type LocaleStorage = Pick<Storage, "getItem" | "setItem">;

export type ResolveInitialLocaleOptions = {
  storage?: LocaleStorage | null;
  browserLanguages?: readonly string[];
};

export type LocaleDictionary = Record<string, unknown>;

export type I18nContextValue<TDictionary extends LocaleDictionary = LocaleDictionary> = {
  locale: SupportedLocale;
  dictionary: TDictionary;
  localeOptions: readonly LocaleOption[];
  setLocale: (locale: SupportedLocale) => void;
};

export type I18nProviderProps<TDictionary extends LocaleDictionary> = {
  children: ReactNode;
  dictionaries: Record<SupportedLocale, TDictionary>;
  storage?: LocaleStorage | null;
  browserLanguages?: readonly string[];
  documentElement?: Pick<HTMLElement, "lang"> | null;
};

export const defaultLocale: SupportedLocale = "ru";

export const i18nStorageKey = "elevenhouse.locale";

export const localeOptions: readonly LocaleOption[] = [
  { locale: "ru", label: "Русский", shortLabel: "RU" },
  { locale: "en", label: "English", shortLabel: "EN" }
] as const;

export function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale);
}

export function resolveInitialLocale({
  storage = getDefaultStorage(),
  browserLanguages = getDefaultBrowserLanguages()
}: ResolveInitialLocaleOptions = {}): SupportedLocale {
  const storedLocale = readStoredLocale(storage);

  if (storedLocale) {
    return storedLocale;
  }

  for (const language of browserLanguages) {
    const normalizedLocale = normalizeLanguageTag(language);

    if (normalizedLocale && isSupportedLocale(normalizedLocale)) {
      return normalizedLocale;
    }
  }

  return defaultLocale;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider<TDictionary extends LocaleDictionary>({
  children,
  dictionaries,
  storage = getDefaultStorage(),
  browserLanguages = getDefaultBrowserLanguages(),
  documentElement = getDefaultDocumentElement()
}: I18nProviderProps<TDictionary>) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    resolveInitialLocale({ storage, browserLanguages })
  );

  useEffect(() => {
    if (documentElement) {
      documentElement.lang = locale;
    }

    try {
      storage?.setItem(i18nStorageKey, locale);
    } catch {
      // Disabled storage must not break rendering.
    }
  }, [documentElement, locale, storage]);

  const value = useMemo<I18nContextValue<TDictionary>>(
    () => ({
      locale,
      dictionary: dictionaries[locale],
      localeOptions,
      setLocale: setLocaleState
    }),
    [dictionaries, locale]
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n<TDictionary extends LocaleDictionary = LocaleDictionary>() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context as I18nContextValue<TDictionary>;
}

function readStoredLocale(storage: LocaleStorage | null): SupportedLocale | null {
  try {
    const storedLocale = storage?.getItem(i18nStorageKey);
    return storedLocale && isSupportedLocale(storedLocale) ? storedLocale : null;
  } catch {
    return null;
  }
}

function normalizeLanguageTag(language: string): string | null {
  const [locale] = language.toLowerCase().split("-");
  return locale ?? null;
}

function getDefaultStorage(): LocaleStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function getDefaultBrowserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") {
    return [];
  }

  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

function getDefaultDocumentElement(): Pick<HTMLElement, "lang"> | null {
  return typeof document === "undefined" ? null : document.documentElement;
}
