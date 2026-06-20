export type LanguageSwitcherOption = {
  locale: string;
  label: string;
  shortLabel: string;
};

export type LanguageSwitcherProps = {
  locale: string;
  options: readonly LanguageSwitcherOption[];
  ariaLabel: string;
  className?: string;
  onLocaleChange: (locale: string) => void;
};
