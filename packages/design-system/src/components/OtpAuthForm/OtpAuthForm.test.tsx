import { describe, expect, it, vi } from "vitest";
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

  it("renders motion containers for mode changes", () => {
    const form = OtpAuthForm({
      mode: "login",
      values: { email: "", name: "", phone: "" },
      onModeChange: vi.fn(),
      onValuesChange: vi.fn()
    });

    const indicator = findElementByProp(form, "activeIndex", 1);
    const motionFrame = findElementByClassName(form, "ehOtpAuthForm__motionFrame");
    const motionContent = findElementByClassName(form, "ehOtpAuthForm__motionContent");

    expect(indicator).not.toBeNull();
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

    expect(onSubmit).toHaveBeenCalledWith(
      { email: "user@example.com", name: "Анна", phone: "+7" },
      "register"
    );
  });
});

type TestElement = {
  key?: string | null;
  props?: {
    children?: unknown;
    className?: string;
    onChange?: (event: { currentTarget: { value: string } }) => void;
    onClick?: () => void;
    [key: string]: unknown;
  };
};

function findElementByClassName(node: unknown, className: string): TestElement | null {
  if (!node || typeof node !== "object") {
    return null;
  }

  const element = node as TestElement;
  if (typeof element.props?.className === "string" && element.props.className.split(" ").includes(className)) {
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
