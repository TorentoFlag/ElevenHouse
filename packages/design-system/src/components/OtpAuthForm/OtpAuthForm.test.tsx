import { describe, expect, it, vi } from "vitest";
import { Button } from "../Button/index.js";
import { SegmentedTabs } from "../SegmentedTabs/index.js";
import { OtpAuthForm } from "./OtpAuthForm.js";

describe("OtpAuthForm", () => {
  it("renders the shared otp auth form shell", () => {
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "", phone: "" },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    expect(form.type).toBe("div");
    expect(form.props.className).toBe("ehOtpAuthForm");
    expect(JSON.stringify(form.props.children)).toContain("Создать аккаунт");
  });

  it("allows app-specific copy", () => {
    const form = OtpAuthForm({
      mode: "login",
      values: { email: "", name: "", phone: "" },
      copy: {
        loginTitle: "Войти в кабинет"
      },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    expect(JSON.stringify(form.props.children)).toContain("Войти в кабинет");
  });

  it("renders an optional language switcher", () => {
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "", phone: "" },
      localeSwitcher: {
        locale: "ru",
        ariaLabel: "Язык",
        options: [
          { locale: "ru", label: "Русский", shortLabel: "RU" },
          { locale: "en", label: "English", shortLabel: "EN" }
        ],
        onLocaleChange: vi.fn()
      },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    const serializedForm = JSON.stringify(form.props.children);
    const switcher = findElementByProp(form, "ariaLabel", "Язык");

    expect(serializedForm).toContain("RU");
    expect(serializedForm).toContain("EN");
    expect(switcher?.props?.locale).toBe("ru");
    expect(switcher?.props?.ariaLabel).toBe("Язык");
  });

  it("calls the language switcher callback", () => {
    const onLocaleChange = vi.fn();
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "", phone: "" },
      localeSwitcher: {
        locale: "ru",
        ariaLabel: "Language",
        options: [
          { locale: "ru", label: "Русский", shortLabel: "RU" },
          { locale: "en", label: "English", shortLabel: "EN" }
        ],
        onLocaleChange
      },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    const switcher = findElementByProp(form, "ariaLabel", "Language");
    switcher?.props?.onLocaleChange?.("en");

    expect(onLocaleChange).toHaveBeenCalledWith("en");
  });

  it("renders motion containers for mode changes", () => {
    const form = OtpAuthForm({
      mode: "login",
      values: { email: "", name: "", phone: "" },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    const tabs = findElementByProp(form, "ariaLabel", "Auth mode");
    const motionFrame = findElementByClassName(form, "ehOtpAuthForm__motionFrame");
    const motionContent = findElementByClassName(form, "ehOtpAuthForm__motionContent");

    expect(tabs?.type).toBe(SegmentedTabs);
    expect(tabs?.props?.value).toBe("login");
    expect(motionFrame?.props?.transitionKey).toBe("login");
    expect(motionContent?.props?.transitionKey).toBe("login");
  });

  it("renders name validation error", () => {
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "А", phone: "" },
      nameError: "Имя должно быть от 2 до 200 символов",
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    expect(JSON.stringify(form.props.children)).toContain("Имя должно быть от 2 до 200 символов");
  });

  it("renders phone country selector and dynamic phone placeholder", () => {
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "", phone: "" },
      phoneCountry: "GE",
      phoneCountries: [
        { iso2: "RU", name: "Россия", flag: "🇷🇺", callingCode: "7" },
        { iso2: "GE", name: "Грузия", flag: "🇬🇪", callingCode: "995" }
      ],
      phonePlaceholder: "+995 555 12 34 56",
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    const serializedForm = JSON.stringify(form.props.children);

    expect(serializedForm).toContain("+995 555 12 34 56");
    expect(serializedForm).toContain("🇬🇪");
    expect(serializedForm).toContain("+995");
  });

  it("can render email before phone for app-specific auth layouts", () => {
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "", phone: "" },
      identifierFieldOrder: "email-phone",
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    const serializedForm = JSON.stringify(form.props.children);

    expect(serializedForm.indexOf("email")).toBeLessThan(serializedForm.indexOf("phone"));
  });

  it("calls phone country change callback", () => {
    const onPhoneCountryChange = vi.fn();
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "", phone: "" },
      phoneCountry: "RU",
      phoneCountries: [
        { iso2: "RU", name: "Россия", flag: "🇷🇺", callingCode: "7" },
        { iso2: "GE", name: "Грузия", flag: "🇬🇪", callingCode: "995" }
      ],
      onModeChange: vi.fn(),
      onPhoneCountryChange,
      onValuesChange: vi.fn()
    });

    const countrySelect = findElementByClassName(form, "ehOtpAuthForm__phoneCountrySelect");
    countrySelect?.props?.onChange?.({ currentTarget: { value: "GE" } });

    expect(onPhoneCountryChange).toHaveBeenCalledWith("GE");
  });

  it("renders phone validation error", () => {
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "", phone: "+7" },
      phoneError: "Введите корректный номер телефона",
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    const serializedForm = JSON.stringify(form.props.children);

    expect(serializedForm).toContain("Введите корректный номер телефона");
    expect(serializedForm).toContain("eh-otp-auth-phone-error");
  });

  it("disables email and phone controls when requested by the app", () => {
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "", name: "", phone: "+7 999 000-11-22" },
      emailDisabled: true,
      phoneDisabled: true,
      phoneCountry: "RU",
      phoneCountries: [{ iso2: "RU", name: "Россия", flag: "🇷🇺", callingCode: "7" }],
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    const emailInput = findElementByProp(form, "name", "email");
    const phoneInput = findElementByProp(form, "name", "phone");
    const countrySelect = findElementByClassName(form, "ehOtpAuthForm__phoneCountrySelect");

    expect(emailInput?.props?.disabled).toBe(true);
    expect(phoneInput?.props?.disabled).toBe(true);
    expect(countrySelect?.props?.disabled).toBe(true);
  });

  it("submits controlled values", () => {
    const onSubmit = vi.fn();
    const form = OtpAuthForm({
      mode: "register",
      values: { email: "user@example.com", name: "Анна", phone: "+7" },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn(),
      onSubmit
    });

    const submitButton = findElementByClassName(form, "ehOtpAuthForm__submit");
    submitButton?.props?.onClick?.();

    expect(submitButton?.type).toBe(Button);
    expect(submitButton?.props?.title).toBe("Получить код");
    expect(submitButton?.props?.variant).toBe("brand");
    expect(submitButton?.props?.size).toBe("medium");
    expect(submitButton?.props?.type).toBe("button");
    expect(onSubmit).toHaveBeenCalledWith(
      { email: "user@example.com", name: "Анна", phone: "+7" },
      "register"
    );
  });
});

type TestElement = {
  type?: unknown;
  key?: string | null;
  props?: {
    children?: unknown;
    className?: string;
    onChange?: (event: { currentTarget: { value: string } }) => void;
    onClick?: () => void;
    onLocaleChange?: (locale: string) => void;
    [key: string]: unknown;
  };
};

function findElementByClassName(node: unknown, className: string): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByClassName(child, className);
      if (match) {
        return match;
      }
    }
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as TestElement;
  if (
    typeof element.props?.className === "string" &&
    element.props.className.split(" ").includes(className)
  ) {
    return element;
  }

  const children = element.props?.children;
  const childList = Array.isArray(children) ? children : [children];

  for (const child of childList) {
    const match = findElementByClassName(child, className);
    if (match) {
      return match;
    }
  }

  return null;
}

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
