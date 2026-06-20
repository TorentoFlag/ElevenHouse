import { describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "./LanguageSwitcher.js";

describe("LanguageSwitcher", () => {
  it("renders locale options with the active locale state", () => {
    const switcher = LanguageSwitcher({
      locale: "ru",
      ariaLabel: "Язык интерфейса",
      options: [
        { locale: "ru", label: "Русский", shortLabel: "RU" },
        { locale: "en", label: "English", shortLabel: "EN" }
      ],
      onLocaleChange: vi.fn()
    });

    const serializedSwitcher = JSON.stringify(switcher.props.children);
    const activeLocale = findElementByProp(switcher, "aria-label", "Русский");

    expect(switcher.props.className).toBe("ehLanguageSwitcher");
    expect(switcher.props["aria-label"]).toBe("Язык интерфейса");
    expect(serializedSwitcher).toContain("RU");
    expect(serializedSwitcher).toContain("EN");
    expect(activeLocale?.props?.["aria-pressed"]).toBe(true);
  });

  it("calls locale change only when a different locale is selected", () => {
    const onLocaleChange = vi.fn();
    const switcher = LanguageSwitcher({
      locale: "ru",
      ariaLabel: "Language",
      options: [
        { locale: "ru", label: "Русский", shortLabel: "RU" },
        { locale: "en", label: "English", shortLabel: "EN" }
      ],
      onLocaleChange
    });

    findElementByProp(switcher, "aria-label", "Русский")?.props?.onClick?.();
    findElementByProp(switcher, "aria-label", "English")?.props?.onClick?.();

    expect(onLocaleChange).toHaveBeenCalledOnce();
    expect(onLocaleChange).toHaveBeenCalledWith("en");
  });

  it("accepts an app-specific class name", () => {
    const switcher = LanguageSwitcher({
      locale: "en",
      ariaLabel: "Language",
      className: "customSwitcher",
      options: [
        { locale: "ru", label: "Русский", shortLabel: "RU" },
        { locale: "en", label: "English", shortLabel: "EN" }
      ],
      onLocaleChange: vi.fn()
    });

    expect(switcher.props.className).toBe("ehLanguageSwitcher customSwitcher");
  });
});

type TestElement = {
  props?: {
    children?: unknown;
    className?: string;
    onClick?: () => void;
    [key: string]: unknown;
  };
};

function findElementByProp(node: unknown, propName: string, value: unknown): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByProp(child, propName, value);
      if (match) {
        return match;
      }
    }
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as TestElement;
  if (element.props?.[propName] === value) {
    return element;
  }

  const children = element.props?.children;
  const childList = Array.isArray(children) ? children : [children];

  for (const child of childList) {
    const match = findElementByProp(child, propName, value);
    if (match) {
      return match;
    }
  }

  return null;
}
