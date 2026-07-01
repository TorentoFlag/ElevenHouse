import { describe, expect, it, vi } from "vitest";
import { Button } from "../Button/index.js";
import { SegmentedTabs } from "../SegmentedTabs/index.js";
import { MotionText } from "../../motion/index.js";
import { OtpAuthForm } from "./OtpAuthForm.js";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: (callback: unknown) => callback
}));

describe("OtpAuthForm", () => {
  it("renders the register form shell with tabs and motion containers", () => {
    const form = renderForm();

    const tabs = findElementByProp(form, "ariaLabel", "Auth mode");
    const motionFrame = findElementByClassName(form, "ehOtpAuthForm__motionFrame");
    const motionContent = findElementByClassName(form, "ehOtpAuthForm__motionContent");

    expect(form.type).toBe("div");
    expect(form.props.className).toBe("ehOtpAuthForm");
    expect(JSON.stringify(form.props.children)).toContain("Создать аккаунт");
    expect(tabs?.type).toBe(SegmentedTabs);
    expect(tabs?.props?.value).toBe("register");
    expect(motionFrame?.props?.transitionKey).toBe("register:default");
    expect(motionContent?.props?.transitionKey).toBe("register");
  });

  it("applies app copy and locale-aware text motion without remounting fields", () => {
    const form = renderForm({
      copy: {
        registerTitle: "Create account",
        registerDescription: "Free, no card.",
        nameLabel: "Name",
        registerSubmitLabel: "Get code"
      },
      localeSwitcher: {
        locale: "en",
        ariaLabel: "Language",
        options: [
          { locale: "ru", label: "Русский", shortLabel: "RU" },
          { locale: "en", label: "English", shortLabel: "EN" }
        ],
        onLocaleChange: vi.fn()
      }
    });
    const tree = expandPrivateOtpAuthComponents(form);

    const switcher = findElementByProp(tree, "ariaLabel", "Language");
    const motionFrame = findElementByClassName(tree, "ehOtpAuthForm__motionFrame");
    const motionContent = findElementByClassName(tree, "ehOtpAuthForm__motionContent");
    const titleMotionText = findElementByProp(
      tree,
      "transitionKey",
      "en:register:title:Create account"
    );
    const nameInput = findElementByProp(tree, "name", "name");

    expect(JSON.stringify(tree)).toContain("Create account");
    expect(switcher?.props?.locale).toBe("en");
    expect(motionFrame?.props?.transitionKey).toBe("register:en");
    expect(motionContent?.props?.transitionKey).toBe("register");
    expect(titleMotionText?.type).toBe(MotionText);
    expect(nameInput?.props?.value).toBe("");
  });

  it("emits controlled value changes for each credential field", () => {
    const onValuesChange = vi.fn();
    const values = { email: "old@example.com", name: "Анна", phone: "+7" };
    const form = renderForm({ values, onValuesChange });
    const tree = expandPrivateOtpAuthComponents(form);

    findElementByProp(tree, "name", "name")?.props?.onChange?.({
      currentTarget: { value: "Мария" }
    });
    findElementByProp(tree, "name", "email")?.props?.onChange?.({
      currentTarget: { value: "new@example.com" }
    });
    findElementByProp(tree, "name", "phone")?.props?.onChange?.({
      currentTarget: { value: "+995" }
    });

    expect(onValuesChange).toHaveBeenNthCalledWith(1, {
      email: "old@example.com",
      name: "Мария",
      phone: "+7"
    });
    expect(onValuesChange).toHaveBeenNthCalledWith(2, {
      email: "new@example.com",
      name: "Анна",
      phone: "+7"
    });
    expect(onValuesChange).toHaveBeenNthCalledWith(3, {
      email: "old@example.com",
      name: "Анна",
      phone: "+995"
    });
  });

  it("supports app-specific identifier order and phone country selection", () => {
    const onPhoneCountryChange = vi.fn();
    const form = renderForm({
      identifierFieldOrder: "email-phone",
      phoneCountry: "GE",
      phoneCountries: [
        { iso2: "RU", name: "Россия", flag: "🇷🇺", callingCode: "7" },
        { iso2: "GE", name: "Грузия", flag: "🇬🇪", callingCode: "995" }
      ],
      phonePlaceholder: "+995 555 12 34 56",
      onPhoneCountryChange
    });
    const tree = expandPrivateOtpAuthComponents(form);

    const serializedForm = JSON.stringify(tree);
    const countrySelect = findElementByClassName(tree, "ehOtpAuthForm__phoneCountrySelect");
    countrySelect?.props?.onChange?.({ currentTarget: { value: "RU" } });

    expect(serializedForm.indexOf("email")).toBeLessThan(serializedForm.indexOf("phone"));
    expect(serializedForm).toContain("+995 555 12 34 56");
    expect(serializedForm).toContain("🇬🇪");
    expect(countrySelect?.props?.value).toBe("GE");
    expect(onPhoneCountryChange).toHaveBeenCalledWith("RU");
  });

  it("renders validation and disabled states requested by the app", () => {
    const form = renderForm({
      values: { email: "bad", name: "А", phone: "+7" },
      emailDisabled: true,
      phoneDisabled: true,
      emailError: "Введите корректный email",
      nameError: "Имя должно быть от 2 до 200 символов",
      phoneError: "Введите корректный номер телефона",
      phoneCountry: "RU",
      phoneCountries: [{ iso2: "RU", name: "Россия", flag: "🇷🇺", callingCode: "7" }]
    });
    const tree = expandPrivateOtpAuthComponents(form);

    const serializedForm = JSON.stringify(tree);
    const emailInput = findElementByProp(tree, "name", "email");
    const nameInput = findElementByProp(tree, "name", "name");
    const phoneInput = findElementByProp(tree, "name", "phone");
    const countrySelect = findElementByClassName(tree, "ehOtpAuthForm__phoneCountrySelect");

    expect(serializedForm).toContain("Введите корректный email");
    expect(serializedForm).toContain("Имя должно быть от 2 до 200 символов");
    expect(serializedForm).toContain("Введите корректный номер телефона");
    expect(emailInput?.props?.disabled).toBe(true);
    expect(emailInput?.props?.["aria-describedby"]).toBe("eh-otp-auth-email-error");
    expect(nameInput?.props?.["aria-describedby"]).toBe("eh-otp-auth-name-error");
    expect(phoneInput?.props?.disabled).toBe(true);
    expect(phoneInput?.props?.["aria-describedby"]).toBe("eh-otp-auth-phone-error");
    expect(countrySelect?.props?.disabled).toBe(true);
  });

  it("submits controlled values in the current auth mode", () => {
    const onSubmit = vi.fn();
    const form = renderForm({
      mode: "login",
      values: { email: "user@example.com", name: "Анна", phone: "+7" },
      onSubmit
    });

    const submitButton = findElementByClassName(form, "ehOtpAuthForm__submit");
    submitButton?.props?.onClick?.();

    expect(submitButton?.type).toBe(Button);
    expect(submitButton?.props?.variant).toBe("brand");
    expect(submitButton?.props?.size).toBe("big");
    expect(submitButton?.props?.type).toBe("button");
    expect(onSubmit).toHaveBeenCalledWith(
      { email: "user@example.com", name: "Анна", phone: "+7" },
      "login"
    );
  });
});

type RenderFormProps = Partial<Parameters<typeof OtpAuthForm>[0]>;

function renderForm(overrides: RenderFormProps = {}) {
  return OtpAuthForm({
    mode: "register",
    values: { email: "", name: "", phone: "" },
    onModeChange: vi.fn(),
    onValuesChange: vi.fn(),
    ...overrides
  });
}

type TestElement = {
  type?: unknown;
  key?: string | null;
  props?: {
    children?: unknown;
    className?: string;
    onChange?: (event: { currentTarget: { value: string } }) => void;
    onClick?: () => void;
    [key: string]: unknown;
  };
};

function expandPrivateOtpAuthComponents(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((child) => expandPrivateOtpAuthComponents(child));
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const element = node as TestElement;

  if (typeof element.type === "function" && element.type.name.startsWith("OtpAuth")) {
    return expandPrivateOtpAuthComponents(element.type(element.props));
  }

  const children = element.props?.children;

  if (children === undefined) {
    return element;
  }

  return {
    ...element,
    props: {
      ...element.props,
      children: expandPrivateOtpAuthComponents(children)
    }
  };
}

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
